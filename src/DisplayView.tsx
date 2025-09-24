import React, { useEffect, useState } from "react";
import { ref, onValue } from "firebase/database";
import { ensureFirebase } from "./firebase";
import { Countdown, MarqueeTitle, ConfettiOverlay } from "./SharedComponents";
import {
  type RoomState, type Guess,
  toCurrency, computeWinners, formatNames, getDisplayCount, getPrizeDescription
} from "./gameUtils";

const db = ensureFirebase();

export function DisplayView({ roomCode }: { roomCode: string }) {
  const [room, setRoom] = useState<RoomState | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    if (!ensureFirebase() || !roomCode) return;
    const roomRef = ref(db, `rooms/${roomCode}`);
    const unsubscribe = onValue(roomRef, snap => setRoom(snap.val()));
    return unsubscribe;
  }, [roomCode]);

  useEffect(() => {
    if (room?.status === "revealed") {
      setShowConfetti(true);
      const timer = setTimeout(() => setShowConfetti(false), 3000);
      return () => clearTimeout(timer);
    } else if (room?.status === "finished") {
      // Longer confetti for finale
      setShowConfetti(true);
      const timer = setTimeout(() => setShowConfetti(false), 8000);
      return () => clearTimeout(timer);
    } else {
      setShowConfetti(false);
    }
  }, [room?.status]);

  if (!ensureFirebase()) {
    return <div className="flex items-center justify-center min-h-screen text-2xl">Connecting...</div>;
  }

  if (!room) {
    return <div className="flex items-center justify-center min-h-screen text-2xl">Loading room...</div>;
  }

  const currentItem = room.items?.[room.roundIndex];
  const roundKey = String(room.roundIndex);
  const roundGuesses = (room.guesses?.[roundKey] || {}) as Record<string, Guess>;

  const players = room.players || {};
  const submittedIds = new Set(Object.keys(roundGuesses));
  const submittedCount = submittedIds.size;
  const totalPlayers = Object.keys(players).length;

  const currentGuessesList = Object.values(roundGuesses).sort((a, b) => a.ts - b.ts);
  const winners = currentItem ? computeWinners(currentGuessesList, currentItem.price, room.rule) : [];

  // Get top bids for reveal state
  const topBids = currentGuessesList
    .sort((a, b) => Math.abs(a.value - (currentItem?.price || 0)) - Math.abs(b.value - (currentItem?.price || 0)))
    .slice(0, getDisplayCount(room, 'bids'));

  const finalScores = room.scores ?
    Object.entries(room.scores)
      .map(([playerId, score]) => ({
        name: players[playerId]?.name || "Unknown",
        score,
        prizes: room.prizes?.[playerId] || []
      }))
      .sort((a, b) => b.score - a.score)
    : [];

  // Calculate top scores for display
  const topScoresCount = getDisplayCount(room, 'scores');
  const topScores = room.scores
    ? Object.entries(room.scores)
        .map(([playerId, score]) => ({
          name: players[playerId]?.name || "Unknown",
          score,
          prizes: room.prizes?.[playerId] || []
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, topScoresCount)
    : [];

  // Determine if we should show scores (only between rounds)
  const showScores = room.status === "lobby" || room.status === "revealed";

  return (
    <div className="h-screen w-full bg-gradient-to-br from-blue-100 to-pink-100 text-gray-900 p-4 relative overflow-hidden flex flex-col">
      {showConfetti && <ConfettiOverlay />}

      {/* Compact header for Teams meeting */}
      <header className="mb-4">
        <div className="flex justify-between items-center">
          <div className="flex-1">
            <MarqueeTitle withLogo />
          </div>
          {/* Prize winner announcement in header */}
          {room.status === "revealed" && winners.length > 0 && room.currentPrize && (
            <div className="bg-yellow-100 border-4 border-yellow-400 rounded-2xl p-12 shadow-xl h-40 flex items-center">
              <div className="flex items-center gap-6">
                <div className="text-8xl">{room.currentPrize}</div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-blue-900">
                    🎉 Winner: {formatNames(winners.map(w => w.playerName))} 🎉
                  </div>
                  <div className="text-lg text-gray-700">
                    Wins {getPrizeDescription(room.currentPrize)}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Main Content Grid - maximized for viewing */}
      <div className="flex-1 grid grid-cols-12 gap-3 min-h-0">
        {/* SECTION D: Round Results/Active Round */}
        <div className={`${showScores ? 'col-span-8' : 'col-span-12'} p-6 rounded-2xl bg-white shadow-lg border border-gray-200 min-h-0 flex flex-col`}>

          {room.status === "lobby" && (
            <div className="flex-1 flex flex-col justify-center items-center text-center">
              <div className="text-4xl font-bold text-blue-900 mb-4">
                Waiting for Players...
              </div>
              <div className="text-xl text-gray-700">
                Host will start the game when ready
              </div>
            </div>
          )}

          {room.status === "showing_prize" && (
            <div className="flex-1 flex flex-col items-center justify-center">
              <div className="text-center mb-8">
                <div className="text-3xl font-bold text-blue-900 mb-4">
                  Round {room.roundIndex + 1} of {room.items.length}
                </div>
                <div className="text-5xl font-bold text-pink-600 mb-6">
                  Here's what you're playing for!
                </div>
              </div>

              {room.currentPrize && (
                <div className="bg-yellow-100 border-8 border-yellow-400 rounded-3xl p-12 shadow-2xl text-center">
                  <div className="text-8xl mb-6">{room.currentPrize}</div>
                  <div className="text-4xl font-bold text-yellow-900 mb-2">
                    {getPrizeDescription(room.currentPrize)}
                  </div>
                </div>
              )}

              <div className="mt-8 text-2xl text-gray-600 font-medium">
                Get ready to see what you'll be bidding on...
              </div>
            </div>
          )}

          {room.status === "in_round" && currentItem && (
            <div className="flex-1 flex flex-col">
              <div className="text-center mb-6">
                <div className="text-xl font-bold text-blue-900">
                  Round {room.roundIndex + 1} of {room.items.length}
                </div>
                <div className="text-3xl font-bold text-red-600">
                  <Countdown targetMs={room.roundEndsAt || 0} muted={true} />
                </div>
              </div>

              <div className="flex-1 flex gap-8 items-center">
                {/* Left column: Image */}
                <div className="flex-1 flex justify-center">
                  {currentItem.imageUrl && (
                    <img
                      src={currentItem.imageUrl}
                      className="w-96 h-96 object-cover rounded-2xl border-4 border-yellow-400 shadow-xl"
                      alt={currentItem.name}
                    />
                  )}
                </div>

                {/* Right column: Text content */}
                <div className="flex-1 text-center">
                  <h2 className="text-4xl font-bold text-gray-900 mb-6">{currentItem.name}</h2>
                  {currentItem.note && (
                    <p className="text-xl text-gray-700 mb-6">{currentItem.note}</p>
                  )}
                  <div className="text-2xl text-pink-600 font-medium mb-6">
                    What do you think this costs?
                  </div>
                  <div className="text-xl font-medium text-gray-700">
                    Bids: {submittedCount} / {totalPlayers}
                  </div>
                </div>
              </div>
            </div>
          )}

          {room.status === "revealed" && currentItem && (
            <div className="flex-1 flex flex-col">
              <div className="text-center mb-4">
                <div className="text-2xl font-bold text-blue-900">
                  Round {room.roundIndex + 1} Results
                </div>
                <div className="text-5xl font-bold text-green-600 mb-4">
                  {toCurrency(currentItem.price)}
                </div>
              </div>

              <div className="flex-1 flex gap-8">
                {currentItem.imageUrl && (
                  <img
                    src={currentItem.imageUrl}
                    className="w-72 h-72 object-cover rounded-2xl border-4 border-yellow-400 shadow-lg flex-shrink-0"
                    alt={currentItem.name}
                  />
                )}
                <div className="flex-1">
                  <h2 className="text-3xl font-bold text-gray-900 mb-4">{currentItem.name}</h2>
                  <h3 className="text-2xl font-bold text-gray-700 mb-4">Top {getDisplayCount(room, 'bids')} Bids</h3>
                  <div className="space-y-2">
                    {topBids.map((bid, index) => {
                      const isWinner = winners.some(w => w.playerId === bid.playerId);
                      const distance = Math.abs(bid.value - currentItem.price);
                      return (
                        <div
                          key={bid.playerId}
                          className={`flex justify-between items-center p-2 rounded-lg border-2 ${
                            isWinner
                              ? "border-green-500 bg-green-100 text-green-900"
                              : "border-gray-300 bg-gray-50 text-gray-800"
                          }`}
                        >
                          <div className="flex items-center gap-4">
                            <div className="text-xl font-bold">#{index + 1}</div>
                            <div className="text-lg">{bid.playerName}</div>
                            {isWinner && <div className="text-2xl">🏆 WINNER</div>}
                          </div>
                          <div className="text-right">
                            <div className="text-xl font-bold">{toCurrency(bid.value)}</div>
                            <div className="text-sm opacity-70">Off by {toCurrency(distance)}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {room.status === "finished" && (
            <div className="flex-1 flex flex-col">
              {/* Header with title and Bob's message */}
              <div className="flex justify-between items-start mb-8">
                <div className="flex-1">
                  <div className="text-6xl font-bold text-blue-900 mb-2">
                    🍼 Baby Shower Champions! 🍼
                  </div>
                  <div className="text-2xl text-pink-600 font-semibold">
                    The Price Was Right!
                  </div>
                </div>
                <div className="bg-blue-600 text-white rounded-2xl p-4 shadow-xl border-4 border-blue-700 max-w-sm">
                  <div className="text-sm font-bold mb-1">A Special Message from Bob Barker:</div>
                  <div className="text-sm italic">
                    "Help control the pet population. Have your pets spayed or neutered."
                  </div>
                </div>
              </div>

              {/* Prize Winners Display */}
              <div className="flex-1 bg-gradient-to-br from-yellow-50 to-pink-50 rounded-3xl p-8 border-4 border-yellow-400 shadow-2xl overflow-y-auto">
                <h2 className="text-4xl font-bold text-gray-900 mb-6 text-center">Prize Winners</h2>
                {(() => {
                  const winnersWithPrizes = finalScores.filter(player => player.prizes.length > 0);
                  const winnerCount = winnersWithPrizes.length;

                  if (winnerCount === 0) {
                    return (
                      <div className="text-center text-xl text-gray-600">
                        No prizes were won this game!
                      </div>
                    );
                  }

                  // Dynamic layout based on winner count
                  const isLargeFormat = winnerCount <= 4;
                  const isCompact = winnerCount >= 5 && winnerCount <= 8;
                  const isTwoColumn = winnerCount >= 9;

                  const containerClass = isTwoColumn
                    ? "grid grid-cols-2 gap-3 overflow-y-auto max-h-[calc(100vh-400px)]"
                    : "space-y-4 overflow-y-auto max-h-[calc(100vh-400px)]";

                  const cardClass = isLargeFormat
                    ? "flex justify-between items-center p-6 rounded-2xl border-2 border-gray-300 bg-white shadow-lg"
                    : isCompact
                    ? "flex justify-between items-center p-3 rounded-xl border-2 border-gray-300 bg-white shadow-md"
                    : "flex justify-between items-center p-2 rounded-lg border border-gray-300 bg-white shadow-sm";

                  const nameClass = isLargeFormat
                    ? "text-2xl font-semibold"
                    : isCompact
                    ? "text-xl font-semibold"
                    : "text-lg font-semibold truncate";

                  const prizeClass = isLargeFormat
                    ? "text-6xl"
                    : isCompact
                    ? "text-4xl"
                    : "text-3xl";

                  return (
                    <div className={containerClass}>
                      {winnersWithPrizes.map((player, index) => (
                        <div
                          key={player.name}
                          className={`${cardClass} animate-pulse hover:animate-bounce transition-all duration-500`}
                          style={{ animationDelay: `${index * 0.2}s` }}
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className={nameClass}>{player.name}</div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <div className={`${prizeClass} animate-bounce`} style={{ animationDelay: `${index * 0.3}s` }}>
                              {player.prizes.join(" ") || "—"}
                            </div>
                            <div className="text-sm text-gray-600">{player.prizes.length} prize{player.prizes.length !== 1 ? 's' : ''}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>
          )}
        </div>

        {/* SECTIONS E, F, G: Contestants' Row (only visible between rounds) */}
        {showScores && (
          <div className="col-span-4 flex flex-col gap-4">
            {/* SECTION E & F: Header with Player Count */}
            <div className="p-3 rounded-2xl bg-pink-600 text-white shadow-lg border border-pink-700">
              <div className="flex justify-between items-center">
                <div className="text-lg font-bold">CONTESTANTS' ROW</div>
                <div className="text-right">
                  <div className="text-xs opacity-90">PLAYERS</div>
                  <div className="text-xl font-bold">{totalPlayers}</div>
                </div>
              </div>
            </div>

            {/* SECTION G: Prize Winners */}
            <div className="flex-1 p-4 rounded-2xl bg-white shadow-lg border border-gray-200">
              <div className="text-lg font-bold text-gray-900 mb-3 text-center">
                Prize Winners
              </div>
              <div className="space-y-2">
                {Object.entries(room.prizes || {})
                  .filter(([_, prizes]) => prizes.length > 0)
                  .map(([playerId, prizes]) => ({
                    name: players[playerId]?.name || "Unknown",
                    prizes: prizes,
                    count: prizes.length
                  }))
                  .sort((a, b) => b.count - a.count)
                  .map((player, index) => (
                  <div
                    key={player.name}
                    className="flex justify-between items-center p-2 rounded-lg border border-gray-300 bg-gray-50"
                  >
                    <div className="text-sm text-gray-700 truncate">{player.name}</div>
                    <div className="text-right">
                      <div className="text-4xl">{player.prizes.join(" ")}</div>
                    </div>
                  </div>
                ))}
                {Object.keys(room.prizes || {}).filter(playerId => (room.prizes?.[playerId] || []).length > 0).length === 0 && (
                  <div className="text-center text-sm text-gray-600 opacity-70">
                    No prizes yet
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Simple footer with room info and join link */}
      <footer className="mt-3 bg-white rounded-lg p-2 shadow border border-gray-200">
        <div className="flex justify-between items-center text-xs text-gray-600">
          {/* Room Code */}
          <div>
            Room: <span className="font-bold text-gray-700">{room.code}</span>
          </div>

          {/* Join Link */}
          <div>
            Join: <span className="bg-gray-100 px-1 rounded font-mono text-gray-700">
              {`${location.origin}${location.pathname}?room=${room.code}&role=player`}
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}