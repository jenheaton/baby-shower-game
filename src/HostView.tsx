import React, { useEffect, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { ref, onValue, update } from "firebase/database";
import { ensureFirebase } from "./firebase";
import { PriceTag, Badge, TabButton, MuteToggle } from "./SharedComponents";
import { HostSetup } from "./HostSetup";
import { HostGame } from "./HostGame";
import { type RoomState, clean, initializePrizePool } from "./gameUtils";

const db = ensureFirebase();

export function HostView({ roomCode: initial, setRoomCode }: { roomCode:string; setRoomCode:(c:string)=>void; }) {
  const [room, setRoom] = useState<RoomState | null>(null);
  const [hostId] = useState<string>(()=>localStorage.getItem("hostId") || uuidv4());
  const [tab, setTab] = useState<"setup"|"game"|"scores">("setup");

  useEffect(()=>localStorage.setItem("hostId", hostId),[hostId]);

  useEffect(()=>{
    if (!ensureFirebase()) return;
    const code = initial && initial.length>=4 ? initial : Math.random().toString().slice(2,8).toUpperCase();
    setRoomCode(code);
    const roomRef = ref(db, `rooms/${code}`);
    onValue(roomRef, snap=>setRoom(snap.val()));
    (async()=>{
      const now = Date.now();
      await update(roomRef, clean({
        code, createdAt: now, hostId,
        status: "setup",
        rule: "closest_without_over",
        roundIndex: 0,
        roundDurationSec: 35,
        isSetupDone: false,
        topScoresCount: 5,
        topBidsCount: 5,
        prizes: {},
        prizePool: initializePrizePool(),
        scores: {},
      }));
    })();
  },[]);

  if (!ensureFirebase()) return <div className="mt-6 p-4 bg-white rounded-xl">Connecting…</div>;
  if (!room) return <div className="mt-6">Loading room…</div>;

  const playerCount = Object.keys(room.players||{}).length;

  return (
    <div className="mt-6">
      <div className="bg-white p-4 rounded-2xl shadow-lg border border-gray-200 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <div className="text-sm text-gray-600 font-medium">Room Code</div>
          <div className="text-3xl font-extrabold tracking-widest">
            <PriceTag>{room.code}</PriceTag>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap items-center text-sm">
          <Badge>Rule: {room.rule==="closest_without_over" ? "Closest w/o going over" : "Closest overall"}</Badge>
          <Badge>Round time: {room.roundDurationSec}s</Badge>
          <Badge>Items: {room.items?.length || 0}</Badge>
          <Badge>Players: {playerCount}</Badge>
          <Badge>Status: {room.status}</Badge>
          <MuteToggle room={room} />
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <TabButton active={tab==="setup"} onClick={()=>setTab("setup")}>Game Setup</TabButton>
        <TabButton active={tab==="game"} onClick={()=>setTab("game")} disabled={!room.isSetupDone}>Game</TabButton>
        <TabButton active={tab==="scores"} onClick={()=>setTab("scores")} disabled={!Object.keys(room.scores||{}).length}>Scores</TabButton>
      </div>

      {tab==="setup" && <HostSetup room={room} onFinished={()=>setTab("game")} />}
      {tab==="game"  && <HostGame room={room} />}
      {tab==="scores"&& <HostScores room={room} />}

      <div className="mt-8 p-4 rounded-2xl border border-gray-200 bg-gray-50 text-xs">
        <span className="text-gray-700 font-medium">Player link:</span>&nbsp;
        <code className="bg-white px-2 py-1 rounded border border-gray-300 text-gray-800">{`${location.origin}${location.pathname}?room=${room.code}&role=player`}</code>
      </div>
    </div>
  );
}

function HostScores({ room }: { room: RoomState }) {
  const players = room.players||{}; const scores = room.scores||{};
  const rows = Object.keys(players).map(pid=>({ playerId: pid, name: players[pid].name, score: scores[pid]||0 }))
    .sort((a,b)=> b.score - a.score || a.name.localeCompare(b.name));
  return (
    <div className="mt-4 bg-white rounded-2xl p-4 shadow-lg border border-gray-200">
      <div className="text-xl font-semibold mb-3">Leaderboard</div>
      <table className="w-full text-left text-sm">
        <thead><tr className="opacity-60"><th className="py-2">#</th><th>Player</th><th>Score</th></tr></thead>
        <tbody>
          {rows.map((r,idx)=> (<tr key={r.playerId} className="border-t"><td className="py-2">{idx+1}</td><td>{r.name}</td><td>{r.score}</td></tr>))}
          {!rows.length && <tr><td colSpan={3} className="py-2 opacity-60">No players yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}