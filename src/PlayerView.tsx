import React, { useEffect, useMemo, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { ref, onValue, update } from "firebase/database";
import { ensureFirebase } from "./firebase";
import { PriceTag, Countdown, ConfettiOverlay } from "./SharedComponents";
import {
  type RoomState, type Guess, type Item,
  parseMoney, clean, toCurrency, computeWinners, formatNames, pick, SFX, getPrizeDescription
} from "./gameUtils";
import { TOAST_NORMAL, TOAST_OVERBID, FINALE_LINES } from "./gameData";

const db = ensureFirebase();

export function PlayerView({ roomCode: initial, setRoomCode }: { roomCode:string; setRoomCode:(c:string)=>void; }) {
  const [code, setCode] = useState<string>(initial || "");
  const [playerId] = useState<string>(()=>{
    const roomKey = initial || "";
    return roomKey ? (localStorage.getItem(`player_${roomKey}`) || uuidv4()) : uuidv4();
  });
  const [name, setName] = useState<string>(()=>{
    const roomKey = initial || "";
    return roomKey ? (localStorage.getItem(`playerName_${roomKey}`) || "") : "";
  });
  const [hasJoined, setHasJoined] = useState(false);
  const [justJoinedName, setJustJoinedName] = useState<string | null>(null);
  const [autoRejoined, setAutoRejoined] = useState(false);
  const [nameWasDisambiguated, setNameWasDisambiguated] = useState<string | null>(null);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [bid, setBid] = useState("");
  const [isChangingName, setIsChangingName] = useState(false);
  const [newName, setNewName] = useState("");

  // Store player data room-specifically
  useEffect(()=>{
    if (code) {
      localStorage.setItem(`player_${code}`, playerId);
    }
  },[playerId, code]);

  useEffect(()=>{
    if (code && name) {
      localStorage.setItem(`playerName_${code}`, name);
    }
  },[name, code]);
  useEffect(()=>{ if (code) setRoomCode(code); },[code]);

  // Set room code from URL parameter if provided
  useEffect(() => {
    if (initial && !code) {
      setCode(initial);
    }
  }, [initial, code]);

  useEffect(()=>{
    if (!ensureFirebase() || !code) return;
    const roomRef = ref(db, `rooms/${code}`);
    const unsub = onValue(roomRef, snap=>setRoom(snap.val()));
    return ()=>unsub();
  },[code]);

  const join = async () => {
    if (!ensureFirebase()) return alert("Connecting to Firebase…");
    const trimmed = (code||"").toUpperCase().trim();
    if (!trimmed) return alert("Invalid room link.");
    if (name.trim().length < 1) return alert("Please enter your name.");

    // Check for name conflicts and add disambiguation if needed
    const originalName = name.trim();
    const finalName = await getDisambiguatedName(originalName, trimmed);

    // Track if name was changed for user feedback
    if (finalName !== originalName) {
      setNameWasDisambiguated(originalName);
      // Clear the message after a few seconds
      setTimeout(() => setNameWasDisambiguated(null), 5000);
    }

    await update(ref(db, `rooms/${trimmed}/players/${playerId}`), clean({ id:playerId, name: finalName, joinedAt: Date.now() }));
    setName(finalName); // Update local state with the final name
    setHasJoined(true);
    setJustJoinedName(finalName);
  };

  const changeName = async () => {
    if (!ensureFirebase() || !room) return;
    if (newName.trim().length < 1) return alert("Please enter your name.");

    // Check for name conflicts and add disambiguation if needed
    const originalName = newName.trim();
    const finalName = await getDisambiguatedName(originalName, room.code);

    // Track if name was changed for user feedback
    if (finalName !== originalName) {
      setNameWasDisambiguated(originalName);
      // Clear the message after a few seconds
      setTimeout(() => setNameWasDisambiguated(null), 5000);
    }

    await update(ref(db, `rooms/${room.code}/players/${playerId}`), clean({ id:playerId, name: finalName, joinedAt: Date.now() }));
    setName(finalName);
    setIsChangingName(false);
    setNewName("");
  };

  const startChangingName = () => {
    setNewName(name);
    setIsChangingName(true);
  };

  const cancelChangingName = () => {
    setNewName("");
    setIsChangingName(false);
  };

  const getDisambiguatedName = async (desiredName: string, roomCode: string) => {
    if (!room?.players) return desiredName;

    // Check if name already exists (excluding our own playerId)
    const existingNames = Object.entries(room.players)
      .filter(([pid, _]) => pid !== playerId)
      .map(([_, player]) => player.name);

    if (!existingNames.includes(desiredName)) {
      return desiredName; // Name is unique, use as-is
    }

    // Find the next available number
    let counter = 2;
    let newName = `${desiredName} (${counter})`;
    while (existingNames.includes(newName)) {
      counter++;
      newName = `${desiredName} (${counter})`;
    }

    return newName;
  };

  const currentItem = room?.items?.[room?.roundIndex||0];
  const roundKey = String(room?.roundIndex || 0);
  const roundGuesses = (room?.guesses?.[roundKey] || {}) as Record<string, Guess>;
  const myBid = roundGuesses?.[playerId]?.value;

  const submitBid = async () => {
    if (!ensureFirebase() || !room) return;
    if (room.status!=="in_round") return;
    if (typeof myBid === "number") return;
    const v = parseMoney(bid); if (v==null) return alert("Enter a number (e.g., 23.50)");
    await update(ref(db, `rooms/${room.code}/guesses/${roundKey}/${playerId}`), clean({ playerId, playerName: name.trim(), value: v, ts: Date.now() }));
    setBid("");
  };

  const handleBidKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      submitBid();
    }
  };

  // Score & rank
  const scoreEntries = Object.entries(room?.scores||{}).map(([pid,s])=>({ id:pid, name: room?.players?.[pid]?.name || "Player", score: s||0 }));
  const ranked = scoreEntries.sort((a,b)=> b.score-a.score || a.name.localeCompare(b.name)).map((r,i)=>({...r, rank:i+1}));
  const myScore = (room?.scores||{})[playerId] || 0;


  // Previous rounds (hide until after first round)
  const historyRows = useMemo(()=>{
    if (!room) return [];
    if ((room.items?.length||0)===0) return [];
    const show = (room.status==="revealed" || room.status==="finished") && room.roundIndex>=0;
    if (!show) return [];
    const rows: {name:string; price:number; my?:number}[] = [];
    const maxIdx = room.status==="finished" ? room.items.length-1 : room.roundIndex;
    for (let i=0; i<=maxIdx; i++) {
      const item = room.items[i]; if (!item) continue;
      const g = room.guesses?.[String(i)] || {};
      const mine = (g as any)?.[playerId]?.value;
      rows.push({ name: item.name, price: item.price, my: typeof mine==="number" ? mine : undefined });
    }
    return rows;
  }, [room?.items, room?.guesses, room?.roundIndex, room?.status]);

  // Reveal sounds + toast
  const guessesList = Object.values(roundGuesses||{}).sort((a,b)=>a.ts-b.ts);
  const overbidFallback = !!(room?.rule==="closest_without_over" && currentItem && !guessesList.some(x=>x.value<=currentItem.price));
  const winners = currentItem ? computeWinners(guessesList, currentItem.price, room!.rule) : [];
  const iWon = Boolean(winners.some(w=>w.playerId===playerId));
  const toastLineTemplate = overbidFallback ? pick(TOAST_OVERBID) : pick(TOAST_NORMAL);
  const toastLine = winners.length ? toastLineTemplate.replace("{name}", formatNames(winners.map(w=>w.playerName))) : "";

  useEffect(()=>{
    if (!room || room.themeMuted) return;
    if (room.status==="revealed") {
      if (iWon) SFX.win(); else SFX.reveal();
    }
  }, [room?.status, iWon, room?.themeMuted]);

  // Clear the "Come on down" message when the game starts
  useEffect(() => {
    if (room?.status === "in_round" && justJoinedName) {
      setJustJoinedName(null);
    }
  }, [room?.status, justJoinedName]);

  // Auto-rejoin logic for returning players
  useEffect(() => {
    if (room && code && playerId && !hasJoined) {
      // Check if our playerId already exists in the room's players AND we have a stored name
      const storedName = localStorage.getItem(`playerName_${code}`);
      if (room.players && room.players[playerId] && storedName) {
        // We're already in the room with a previous name, auto-rejoin
        setHasJoined(true);
        setAutoRejoined(true);
        // Update our local name to match what's in Firebase
        setName(room.players[playerId].name);
        // Don't show "come on down" message for auto-rejoins
        setJustJoinedName(null);

        // Clear the auto-rejoined message after a few seconds
        setTimeout(() => setAutoRejoined(false), 4000);
      }
    }
  }, [room, code, playerId, hasJoined]);

  return (
    <div className="mt-6 max-w-xl mx-auto bg-white rounded-2xl p-5 shadow-lg border border-gray-200">
      {!hasJoined && (
        <div>
          <div className="text-center mb-4">
            <div className="text-2xl font-bold text-blue-900 mb-2">The Price Is Right</div>
            <div className="text-lg font-semibold">Baby Edition</div>
            {code && <div className="text-sm opacity-70 mt-2">Room: {code}</div>}
          </div>

          <div className="mb-4">
            <label className="block text-sm font-semibold mb-2">Enter your name:</label>
            <input
              className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
              placeholder="Name"
              value={name}
              onChange={(e)=>setName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && join()}
            />
          </div>

          <button
            className="w-full px-4 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-lg transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
            onClick={join}
            disabled={!name.trim()}
          >
            Join Game
          </button>

          <div className="mt-4 text-center text-sm opacity-70">
            Ready to guess some baby item prices?
          </div>
        </div>
      )}

      {hasJoined && room && (
        <div>
          {autoRejoined && (
            <div className="mb-3 p-3 rounded-lg bg-green-50 border border-green-200 text-center font-semibold">
              Welcome back, <span className="text-green-700">{name}</span>! 👋
            </div>
          )}

          {nameWasDisambiguated && (
            <div className="mb-3 p-3 rounded-lg bg-purple-50 border border-purple-200 text-center text-sm">
              <strong>{nameWasDisambiguated}</strong> was already taken, so you're now <strong>{name}</strong>!
            </div>
          )}

          {justJoinedName && (
            <div className="mb-3 p-3 rounded-lg bg-yellow-50 border border-yellow-200 text-center font-semibold">
              Come on down, <span className="text-red-600">{justJoinedName}</span>! You're the next contestant on <i>The Price Is Right: Baby Edition!</i>
            </div>
          )}

          {/* toast winner line for everyone to see on reveal */}
          {room.status==="revealed" && winners.length>0 && (
            <div className="mb-3 p-2 rounded-xl bg-white border text-center text-sm">
              {toastLine}
            </div>
          )}

          {/* Player info with change name option */}
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm">
              Playing as: <span className="font-semibold text-green-700">{name}</span>
            </div>
            <button
              onClick={startChangingName}
              disabled={isChangingName}
              className="text-xs px-2 py-1 rounded-lg bg-purple-100 hover:bg-purple-200 text-purple-700 border border-purple-200 transition-colors"
            >
              Change Name
            </button>
          </div>

          {isChangingName && (
            <div className="mb-3 p-3 rounded-lg bg-yellow-50 border border-yellow-200">
              <div className="text-sm font-semibold mb-2">Change your name:</div>
              <div className="flex gap-2">
                <input
                  className="flex-1 px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter new name"
                  value={newName}
                  onChange={(e)=>setNewName(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && changeName()}
                />
                <button
                  onClick={changeName}
                  disabled={!newName.trim()}
                  className="px-3 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white font-semibold transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  Save
                </button>
                <button
                  onClick={cancelChangingName}
                  className="px-3 py-2 rounded-lg bg-gray-200 text-gray-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}


          {/* Lobby wait */}
          {room.status==="lobby" && <div className="mt-3 p-3 rounded-lg bg-gray-50 border border-gray-200 text-sm">Waiting for host and players… Your score: <b>{myScore}</b></div>}

          {/* Prize reveal phase */}
          {room.status==="showing_prize" && (
            <div className="mt-3 p-4 rounded-lg bg-gradient-to-br from-yellow-50 to-pink-50 border-2 border-yellow-400">
              <div className="text-center">
                <div className="text-lg font-bold text-blue-900 mb-3">
                  🎯 Round {room.roundIndex + 1} of {room.items.length}
                </div>
                <div className="text-2xl font-bold text-pink-600 mb-4">
                  Here's what you're playing for!
                </div>
                {room.currentPrize && (
                  <div className="bg-yellow-100 border-4 border-yellow-400 rounded-xl p-6 mb-4">
                    <div className="text-6xl mb-2">{room.currentPrize}</div>
                    <div className="text-xl font-bold text-yellow-900">
                      {getPrizeDescription(room.currentPrize)}
                    </div>
                  </div>
                )}
                <div className="text-lg text-gray-700 font-medium">
                  Get ready to see what you'll be bidding on!
                </div>
              </div>
            </div>
          )}

          {/* In round: show image and bid panel (image contained within border) */}
          {room.status==="in_round" && (
            <div className="mt-3 p-3 rounded-lg border border-gray-200 bg-white">
              <div className="text-sm opacity-60">Round {room.roundIndex+1} / {room.items.length}</div>

              <div className="text-lg font-semibold mt-2">{currentItem?.name || ""}</div>
              <div className="mt-1 text-sm">Ends in <Countdown targetMs={room.roundEndsAt||0} muted={!!room.themeMuted}/></div>

              {typeof myBid!=="number" ? (
                <div className="mt-3 flex gap-2">
                  <input className="flex-1 px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="$0.00" value={bid} onChange={(e)=>setBid(e.target.value)} onKeyPress={handleBidKeyPress} />
                  <button className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white transition-colors" onClick={submitBid}>Place Bid</button>
                </div>
              ) : (
                <div className="mt-3 text-sm opacity-70">Your bid: {toCurrency(myBid)} (waiting for reveal…)</div>
              )}
            </div>
          )}

          {/* Reveal - Retro Game Show Style */}
          {room.status==="revealed" && currentItem && (
            <div className="mt-4 p-4 rounded-lg border-2 border-yellow-400 bg-gradient-to-br from-yellow-100 to-yellow-200">
              <div className="text-lg font-bold mb-3 text-yellow-800 text-center">
                🎉 THE ACTUAL RETAIL PRICE IS... 🎉
              </div>

              <div className="text-center mb-3">
                <div className="text-2xl font-bold text-yellow-900">
                  {toCurrency(currentItem.price)}
                </div>
              </div>

              {typeof myBid === "number" ? (
                <div className="bg-white rounded-lg p-3 border border-gray-300">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-medium text-gray-700">Your Bid:</span>
                    <span className="font-bold text-lg">{toCurrency(myBid)}</span>
                  </div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-medium text-gray-700">Difference:</span>
                    <span className="font-bold">${Math.abs(myBid-currentItem.price).toFixed(2)}</span>
                  </div>

                  {iWon ? (
                    <div className="text-center p-2 rounded-lg bg-green-500 text-white font-bold animate-pulse">
                      🎯 WINNER! You got the closest bid! +1 point! 🏆
                    </div>
                  ) : (
                    <div className="text-center text-sm">
                      {(room.rule==="closest_without_over" && myBid>currentItem.price) ? (
                        <span className="text-red-600 font-semibold">❌ Over the price!</span>
                      ) : (
                        <span className="text-gray-600">Try again next round!</span>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center text-sm text-gray-600 bg-gray-100 rounded-lg p-2">
                  You didn't place a bid this round.
                </div>
              )}

              <div className="text-center mt-3">
                <span className="font-medium text-yellow-800">Your Score: </span>
                <span className="font-bold text-lg text-yellow-900">{myScore}</span>
              </div>
            </div>
          )}


          {/* History (only after first real round) */}
          {!!historyRows.length && (
            <div className="mt-4">
              <div className="text-xs opacity-60 mb-1">Previous rounds</div>
              <table className="w-full text-xs">
                <thead><tr className="opacity-60"><th className="py-1 text-left">Item</th><th className="text-right">Your Bid</th><th className="text-right">ARP</th></tr></thead>
                <tbody>
                  {historyRows.map((r,idx)=>(
                    <tr key={idx} className="border-t">
                      <td className="py-1">{r.name}</td>
                      <td className="text-right">{typeof r.my==="number" ? toCurrency(r.my) : "—"}</td>
                      <td className="text-right">{toCurrency(r.price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {room.status==="finished" && (
            <Finale ranked={ranked} myPrizes={room.prizes?.[playerId] || []} />
          )}
        </div>
      )}
    </div>
  );
}


function Finale({ ranked, myPrizes }: { ranked:{id:string;name:string;score:number;rank:number}[]; myPrizes: string[] }) {
  const champion = ranked[0];
  const line = champion ? pick(FINALE_LINES).replace("{name}", champion.name) : "Thanks for playing!";
  return (
    <div className="relative mt-4 p-6 rounded-2xl border-2 border-yellow-400 bg-gradient-to-br from-yellow-100 to-yellow-200 overflow-hidden">
      <ConfettiOverlay />

      {/* Main Title */}
      <div className="text-center mb-6">
        <div className="text-3xl font-bold text-yellow-900 mb-2">
          🎉 GAME COMPLETE! 🎉
        </div>
        <div className="text-lg text-yellow-800">
          {line}
        </div>
      </div>

      {/* My Prizes Section */}
      {myPrizes.length > 0 && (
        <div className="bg-white rounded-2xl p-6 border-4 border-green-400 mb-6 shadow-xl">
          <div className="text-2xl font-bold text-green-800 mb-4 text-center">
            🏆 Your Prizes! 🏆
          </div>
          <div className="text-center">
            <div className="text-6xl mb-3">
              {myPrizes.join(" ")}
            </div>
            <div className="text-lg text-green-700">
              You won {myPrizes.length} prize{myPrizes.length !== 1 ? 's' : ''}!
            </div>
          </div>
        </div>
      )}

      {/* No Prizes Message */}
      {myPrizes.length === 0 && (
        <div className="bg-white rounded-2xl p-6 border-2 border-gray-300 mb-6">
          <div className="text-lg font-bold text-gray-700 mb-2 text-center">
            Better luck next time!
          </div>
          <div className="text-gray-600 text-center">
            You didn't win any prizes this game, but you played great!
          </div>
        </div>
      )}

    </div>
  );
}