import React, { useEffect, useMemo, useState } from "react";
import { ref, update } from "firebase/database";
import { ensureFirebase } from "./firebase";
import { Countdown, ConfettiOverlay } from "./SharedComponents";
import {
  type RoomState, type Guess, type Item,
  clean, cls, toCurrency, computeWinners, formatNames, pick, SFX,
  selectRandomPrize, getPrizeDescription, getPrizeName, addFiveMoreRounds
} from "./gameUtils";
import { HOST_NORMAL, HOST_OVERBID, HOST_SCRIPTS } from "./gameData";

const db = ensureFirebase();

export function HostGame({ room }: { room: RoomState }) {
  const up = (patch: Partial<RoomState>) => update(ref(db, `rooms/${room.code}`), clean(patch));
  const currentItem = room.items?.[room.roundIndex];
  const roundKey = String(room.roundIndex);
  const roundGuesses = (room.guesses?.[roundKey] || {}) as Record<string, Guess>;

  const startRound1 = async () => {
    if (!room.items?.length) return alert("No items to play.");
    const { prize, remainingPool } = selectRandomPrize(room.prizePool || []);
    await up({
      status: "showing_prize",
      roundIndex: 0,
      roundEndsAt: null, // No timer during prize reveal
      lastWinnerIds: null,
      currentPrize: prize,
      prizePool: remainingPool
    });
  };

  const showItem = async () => {
    await up({
      status: "in_round",
      roundEndsAt: Date.now() + room.roundDurationSec * 1000
    });
  };

  const reveal = async () => {
    if (!currentItem) return;
    const gList = Object.values(roundGuesses).sort((a,b)=>a.ts-b.ts);
    const winners = computeWinners(gList, currentItem.price, room.rule);
    const scores = { ...(room.scores||{}) };
    const prizes = { ...(room.prizes||{}) };

    // Award current prize to winners
    for (const w of winners) {
      scores[w.playerId] = (scores[w.playerId]||0)+1; // Keep scores for compatibility
      if (!prizes[w.playerId]) prizes[w.playerId] = [];
      if (room.currentPrize) {
        prizes[w.playerId] = [...prizes[w.playerId], room.currentPrize];
      }
    }

    await up({
      status:"revealed",
      scores,
      prizes,
      lastWinnerIds: winners.map(w=>w.playerId),
      roundEndsAt: null
    });
    if (!room.themeMuted) SFX.reveal();
  };

  const next = async () => {
    const nextIdx = room.roundIndex + 1;
    if (nextIdx >= (room.items?.length||0)) {
      await up({ status:"finished", roundEndsAt:null });
    } else {
      const { prize, remainingPool } = selectRandomPrize(room.prizePool || []);
      await up({
        status: "showing_prize",
        roundIndex: nextIdx,
        roundEndsAt: null, // No timer during prize reveal
        lastWinnerIds: null,
        currentPrize: prize,
        prizePool: remainingPool
      });
    }
  };

  const extendGame = async () => {
    const newPrizePool = addFiveMoreRounds(room.prizePool || []);
    await up({
      status: "lobby",
      prizePool: newPrizePool
    });
  };

  const players = room.players||{};
  const playerIds = Object.keys(players);
  const submittedIds = new Set(Object.keys(roundGuesses));
  const notYet = playerIds.filter(id => !submittedIds.has(id));
  const submitted = playerIds.filter(id => submittedIds.has(id));

  const scoreboard = playerIds.map(pid => ({
    id: pid,
    name: players[pid].name,
    score: room.scores?.[pid] || 0,
    prizes: room.prizes?.[pid] || [],
    hasBid: submittedIds.has(pid),
  })).sort((a,b)=> b.score - a.score || a.name.localeCompare(b.name));

  const submittedCount = submitted.length;
  const notYetCount = notYet.length;

  // Revealed items list (real rounds only)
  const revealedRounds = useMemo(()=>{
    const rounds: { idx:number; item: Item; winners: Guess[]; overbid:boolean }[] = [];
    if (!room.items?.length) return rounds;
    const maxShown = room.status==="finished" ? room.items.length-1 : (room.status==="revealed" ? room.roundIndex : room.roundIndex-1);
    for (let i = 0; i <= maxShown; i++) {
      const item = room.items[i]; if (!item) continue;
      const g = Object.values(room.guesses?.[String(i)] || {}).sort((a,b)=>a.ts-b.ts);
      const overbid = room.rule==="closest_without_over" && !g.some(x=>x.value<=item.price);
      const winners = computeWinners(g, item.price, room.rule);
      rounds.push({ idx:i, item, winners, overbid });
    }
    return rounds;
  }, [room.items, room.guesses, room.rule, room.roundIndex, room.status]);

  // Invite link helper
  const invite = async () => {
    try {
      await navigator.clipboard.writeText(`${location.origin}${location.pathname}?room=${room.code}&role=player`);
      alert("Player link copied to your clipboard!");
    } catch (err) {
      console.error('Failed to copy link:', err);
      alert("Failed to copy link. Please copy it manually.");
    }
  };

  const currentGuessesList = Object.values(roundGuesses).sort((a,b)=>a.ts-b.ts);
  const overbidFallback = !!(room.rule==="closest_without_over" && currentItem && !currentGuessesList.some(x=>x.value<=currentItem.price));
  const winnersNow = currentItem ? computeWinners(currentGuessesList, currentItem.price, room.rule) : [];
  const winnerNames = formatNames(winnersNow.map(w=>w.playerName));
  const hostWinLine = winnersNow.length
    ? `${(overbidFallback ? pick(HOST_OVERBID) : pick(HOST_NORMAL)).replace("{name}", winnerNames)} They win ${room.currentPrize} ${getPrizeDescription(room.currentPrize || "")}`
    : (room.status==="revealed" ? "No qualifying bids this round." : "");

  const [showConfetti, setShowConfetti] = useState(false);
  useEffect(()=>{
    if (room.status==="finished") {
      // respect reduced motion: handled in ConfettiOverlay
      setShowConfetti(true);
      const t = setTimeout(()=>setShowConfetti(false), 6000);
      return ()=>clearTimeout(t);
    }
  }, [room.status]);

  // Auto-reveal when timer ends OR when all bids are in
  useEffect(() => {
    if (room.status === "in_round" && room.roundEndsAt) {
      const timeLeft = room.roundEndsAt - Date.now();
      if (timeLeft <= 0) {
        // Timer already expired, reveal immediately
        reveal();
      } else {
        // Set timeout for when timer expires
        const timer = setTimeout(() => {
          reveal();
        }, timeLeft);
        return () => clearTimeout(timer);
      }
    }
  }, [room.status, room.roundEndsAt]);

  // Auto-reveal when all players have submitted bids
  useEffect(() => {
    if (room.status === "in_round" && playerIds.length > 0 && submittedCount === playerIds.length) {
      // All players have submitted, reveal immediately
      reveal();
    }
  }, [room.status, submittedCount, playerIds.length]);

  // Get contextual host script
  const getHostScript = () => {
    if (room.status === "lobby") {
      return pick(HOST_SCRIPTS.WELCOME);
    } else if (room.status === "showing_prize") {
      return `And now, here's what you're playing for! ${room.currentPrize} ${getPrizeDescription(room.currentPrize || "")}!`;
    } else if (room.status === "in_round") {
      if (submittedCount === 0) {
        return pick(HOST_SCRIPTS.ROUND_START);
      } else if (submittedCount < playerIds.length) {
        return pick(HOST_SCRIPTS.COLLECTING_BIDS);
      } else {
        return pick(HOST_SCRIPTS.REVEALING_PRICE);
      }
    } else if (room.status === "revealed") {
      if (winnersNow.length > 0) {
        const script = overbidFallback ? pick(HOST_SCRIPTS.OVERBID_FALLBACK) : pick(HOST_SCRIPTS.WINNER_ANNOUNCEMENT);
        return script.replace("{name}", winnerNames).replace("{prize}", `${room.currentPrize} ${getPrizeDescription(room.currentPrize || "")}`);
      } else {
        return "No qualifying bids this round. Let's move on to the next item!";
      }
    } else if (room.status === "finished") {
      return pick(HOST_SCRIPTS.GAME_WRAP) + " " + pick(HOST_SCRIPTS.BOB_SIGNATURE);
    }
    return "";
  };

  return (
    <div className="mt-4 grid gap-4 md:grid-cols-3">
      {/* Left: Main Stage */}
      <div className="relative bg-white rounded-2xl p-4 shadow-lg md:col-span-2 border border-gray-200 overflow-hidden">
        {showConfetti && <ConfettiOverlay />}
        {/* Invite step (clear & obvious) */}
        {room.status==="lobby" && (
          <div className="mb-3 p-3 rounded-xl bg-green-50 border border-green-200">
            <div className="font-semibold mb-1">Invite Players</div>
            <div className="text-sm">Share this link so players can join on their phones:</div>
            <div className="mt-2 flex gap-2 items-center">
              <code className="flex-1 px-2 py-1 rounded bg-white border text-xs overflow-x-auto">
                {`${location.origin}${location.pathname}?room=${room.code}&role=player`}
              </code>
              <button className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors" onClick={invite}>Copy link</button>
              {"share" in navigator && (navigator as any).share && (
                <button className="px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-900 text-white transition-colors" onClick={()=> (navigator as any).share({ title:"Join the game", text:"Join the baby shower game:", url: `${location.origin}${location.pathname}?room=${room.code}&role=player` })}>
                  Share…
                </button>
              )}
            </div>
            <div className="text-xs mt-1 opacity-70">Tip: paste into Teams chat so everyone can tap it.</div>
            <div className="mt-3 pt-3 border-t border-emerald-200">
              <div className="text-sm font-semibold mb-2">Display Screen for Teams Meeting</div>
              <button
                className="px-4 py-2 rounded-lg bg-yellow-400 hover:bg-yellow-500 text-gray-900 font-semibold border border-yellow-500 transition-colors"
                onClick={() => window.open(`${location.origin}${location.pathname}?room=${room.code}&role=display`, '_blank')}
              >
                🖥️ Open Display Screen
              </button>
              <div className="text-xs mt-1 opacity-70">Open in new tab to share your screen in Teams</div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="text-sm opacity-60">Round {room.roundIndex+1} / {room.items.length}</div>
            {room.currentPrize && (
              <div className="px-4 py-2 rounded-lg bg-yellow-100 border-2 border-yellow-400">
                <span className="text-lg font-bold">🎁 {getPrizeDescription(room.currentPrize)}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="px-2 py-1 rounded bg-green-100 text-green-800 text-xs">Bids: {submittedCount}</span>
            <span className="px-2 py-1 rounded bg-pink-100 text-pink-800 text-xs">Waiting: {notYetCount}</span>
          </div>
        </div>

        {/* Item card always visible in-round and at reveal */}
        {currentItem ? (
          <div className="mt-3 flex gap-4 items-center">
            {currentItem.imageUrl && <img src={currentItem.imageUrl} className="w-40 h-40 object-cover rounded-xl border-2 border-yellow-400" alt=""/>}
            <div className="flex-1">
              <div className="text-2xl font-bold">{currentItem.name}</div>
              {room.status==="in_round" && (
                <div className="mt-1 text-sm">
                  Ends in <Countdown targetMs={room.roundEndsAt||0} muted={!!room.themeMuted}/>
                </div>
              )}
              {room.status==="revealed" && (
                <div className="mt-1 text-xl font-bold text-green-600">
                  Actual Retail Price: <span className="font-black">{toCurrency(currentItem.price)}</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="mt-3 text-sm opacity-70">Waiting for host…</div>
        )}

        {/* Contestants' Row: hide bid amounts until reveal */}
        <div className="mt-4">
          <div className="font-semibold mb-2">Contestants' Row</div>
          {room.status!=="revealed" ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {scoreboard.map(p=>(
                <div key={p.id} className={cls("px-3 py-2 rounded-lg text-sm border",
                  p.hasBid ? "bg-green-50 border-green-200 text-green-800" : "bg-yellow-50 border-yellow-200 text-red-600"
                )}>
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs">{p.hasBid ? "Bid locked" : "Waiting…"}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {currentGuessesList.map(g=>(
                <div key={g.playerId} className="px-3 py-2 rounded-lg text-sm border border-gray-200 bg-white">
                  <div className="font-medium">{g.playerName}</div>
                  <div className="text-lg font-extrabold tracking-wider">{toCurrency(g.value)}</div>
                </div>
              ))}
              {!Object.keys(roundGuesses).length && <div className="text-sm opacity-60">No bids submitted.</div>}
            </div>
          )}
        </div>

        {/* Reveal message */}
        {room.status==="revealed" && (
          <div className="mt-3 p-3 rounded-lg bg-blue-50 border border-blue-200">
            <div className="text-sm">{winnersNow.length ? hostWinLine : "No qualifying bids this round."}</div>
          </div>
        )}

        {/* Host Script Teleprompter */}
        <div className="mt-4 p-4 rounded-xl bg-gradient-to-r from-yellow-50 to-orange-50 border-2 border-yellow-300">
          <div className="flex items-center gap-2 mb-2">
            <div className="text-lg font-bold text-yellow-800">🎤 Host Script</div>
            <div className="text-xs bg-yellow-200 text-yellow-800 px-2 py-1 rounded-full">
              {room.status === "lobby" ? "Welcome" :
               room.status === "showing_prize" ? "Prize Reveal" :
               room.status === "in_round" ? "Active Round" :
               room.status === "revealed" ? "Reveal" :
               room.status === "finished" ? "Wrap-up" : "Ready"}
            </div>
          </div>
          <div className="text-sm italic text-gray-700 leading-relaxed">
            "{getHostScript()}"
          </div>
        </div>

        {/* Controls */}
        <div className="mt-4 flex gap-2 flex-wrap">
          {/* Display Screen - Always Available */}
          <button
            className="px-3 py-2 rounded-lg bg-yellow-400 hover:bg-yellow-500 text-gray-900 font-semibold border border-yellow-500 transition-colors"
            onClick={() => window.open(`${location.origin}${location.pathname}?room=${room.code}&role=display`, '_blank')}
          >
            🖥️ Display Screen
          </button>

          {room.status==="lobby" && (
            <button className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white transition-colors" onClick={startRound1}>
              Start Round 1
            </button>
          )}
          {room.status==="showing_prize" && (
            <button className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors" onClick={showItem}>
              Show Item to Bid On
            </button>
          )}
          {room.status==="in_round" && (
            <>
              <button className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors" onClick={invite}>Invite players</button>
              <button className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-900 text-white transition-colors" onClick={reveal}>Reveal now</button>
            </>
          )}
          {room.status==="revealed" && (
            <button className="px-5 py-3 rounded-lg bg-yellow-400 hover:bg-yellow-500 text-gray-900 font-bold border border-yellow-500 transition-colors animate-shimmer"
                    onClick={next}>
              {room.roundIndex === (room.items.length-1) ? "🎉 Show Results" : "Next item"}
            </button>
          )}
          {room.status==="finished" && (
            <div className="space-y-3">
              <div className="p-4 rounded-xl bg-gradient-to-br from-blue-50 to-pink-50 border-2 border-blue-200">
                <div className="text-lg font-bold text-blue-900 mb-2">🎯 Host Final Signoff</div>
                <div className="text-sm text-gray-700 space-y-2">
                  <p>"And that concludes another exciting edition of <em>The Price Is Right: Baby Edition!</em> 🍼"</p>
                  <p>"Thank you to all our wonderful contestants for playing along and making this such a fun celebration!"</p>
                  <p>"Remember to check out all the prize winners on the display screen, and most importantly..."</p>
                  <p className="font-semibold text-blue-800">"Help control the pet population. Have your pets spayed or neutered."</p>
                  <p className="text-xs text-gray-600 italic">— Bob Barker</p>
                </div>
              </div>
              <div className="flex gap-2">
                <div className="px-3 py-2 rounded-lg bg-blue-100 text-blue-800">Game Over — see Results below</div>
                <button
                  className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white font-semibold transition-colors"
                  onClick={extendGame}
                >
                  🎮 5 More Rounds
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right: Combined Players + Scores, then Revealed Items */}
      <div className="space-y-4">
        {/* Combined list */}
        <div className="bg-white rounded-2xl p-4 shadow-lg border border-gray-200">
          <div className="font-semibold mb-2">Players & Prizes ({Object.keys(room.players||{}).length})</div>
          {!scoreboard.length ? (
            <div className="text-sm opacity-60">No players yet.</div>
          ) : (
            <div className="space-y-2">
              {scoreboard.map((p, i)=>(
                <div key={p.id} className="flex justify-between items-center p-2 border-b border-gray-100">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">#{i+1}</span>
                    <span>{p.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-4xl">{p.prizes.join(" ") || "—"}</div>
                    <div className={cls("text-xs px-2 py-1 rounded", p.hasBid ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600")}>
                      {p.hasBid ? "Bid in" : "Waiting"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Revealed Items (real rounds only, after first reveal) */}
        {!!revealedRounds.length && (
          <div className="bg-white rounded-2xl p-4 shadow-lg border border-gray-200">
            <div className="font-semibold mb-2">Revealed Items</div>
            <div className="space-y-3">
              {revealedRounds.map(r=>(
                <div key={r.idx} className="flex gap-3 items-center">
                  {r.item.imageUrl && <img src={r.item.imageUrl} className="w-14 h-14 rounded-lg object-cover border border-gray-200" alt=""/>}
                  <div className="flex-1">
                    <div className="font-medium">Round {r.idx+1}: {r.item.name}</div>
                    <div className="text-xs opacity-70">Actual Retail Price: <b>{toCurrency(r.item.price)}</b></div>
                    <div className="text-xs mt-1">
                      {r.winners.length ? (
                        <span>Winner{r.winners.length>1?"s":""}: {r.winners.map(w=>`${w.playerName} (${toCurrency(w.value)})`).join(", ")} {r.overbid && <em className="opacity-60">• Overbid fallback</em>}</span>
                      ) : <span>No qualifying bids</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}