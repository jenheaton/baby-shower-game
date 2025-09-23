import React, { useState } from "react";
import { MarqueeTitle, ConfettiCSS } from "./SharedComponents";
import { HostView } from "./HostView";
import { PlayerView } from "./PlayerView";
import { DisplayView } from "./DisplayView";

export default function App() {
  const qs = new URLSearchParams(location.search);
  const paramRole = (qs.get("role") || "").toLowerCase();
  const [role, setRole] = useState<"host" | "player" | "display" | null>(
    paramRole === "player" ? "player" :
    paramRole === "display" ? "display" : null
  );
  const [roomCode, setRoomCode] = useState<string>(qs.get("room") || "");

  // Display view gets full screen treatment
  if (role === "display") {
    return <DisplayView roomCode={roomCode} />;
  }

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-blue-100 to-pink-100 p-4 md:p-8">
      <ConfettiCSS />
      <div className="max-w-5xl mx-auto">
        <header className="mb-6">
          <MarqueeTitle withLogo />
        </header>

        {!role && <Landing setRole={setRole} roomCode={roomCode} setRoomCode={setRoomCode} />}
        {role === "host" && <HostView roomCode={roomCode} setRoomCode={setRoomCode} />}
        {role === "player" && <PlayerView roomCode={roomCode} setRoomCode={setRoomCode} />}

        {/* <footer className="mt-10 text-center text-xs text-gray-600">
          Live sync via Firebase • ~30 players • Share link
        </footer> */}
      </div>
    </div>
  );
}

function Landing({ setRole, roomCode, setRoomCode }: { setRole: (r:"host"|"player")=>void; roomCode:string; setRoomCode:(c:string)=>void; }) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-200">
        <h2 className="text-2xl font-semibold text-blue-900 mb-3">I'm Hosting</h2>
        <p className="text-sm text-gray-700 mb-4">Create a room, add items (with photos), pick rules, then invite your team.</p>
        <button className="px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors shadow-sm"
                onClick={()=>setRole("host")}>
          Start Shower
        </button>
      </div>
      <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-200">
        <h2 className="text-2xl font-semibold text-pink-700 mb-3">I'm Joining</h2>
        <p className="text-sm text-gray-700 mb-4">Enter the room code from your host.</p>
        <div className="flex gap-2">
          <input className="flex-1 px-3 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                 placeholder="ROOM CODE"
                 value={roomCode}
                 onChange={(e)=>setRoomCode(e.target.value.toUpperCase())}/>
          <button className="px-5 py-3 bg-pink-600 hover:bg-pink-700 text-white rounded-lg font-medium transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={()=>setRole("player")}
                  disabled={!roomCode || roomCode.length<4}>
            Join Game
          </button>
        </div>
      </div>
    </div>
  );
}