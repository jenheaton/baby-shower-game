import React, { useEffect, useMemo, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, update } from "firebase/database";

/** ----------------------------------------------------
 * The Price Is Right — Baby Edition (Guided Setup Build)
 * ---------------------------------------------------- */

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDtPSCkhqwUYwLtjRnB8WciqZKvPz8TakE",
  authDomain: "baby-shower-game-a2858.firebaseapp.com",
  databaseURL: "https://baby-shower-game-a2858-default-rtdb.firebaseio.com",
  projectId: "baby-shower-game-a2858",
  storageBucket: "baby-shower-game-a2858.firebasestorage.app",
  messagingSenderId: "323912064205",
  appId: "1:323912064205:web:d9ae8e7b7f3e5545c35d84",
};

let app: any = null;
let db: any = null;
function ensureFirebase() {
  if (db) return db;
  try { app = initializeApp(FIREBASE_CONFIG); db = getDatabase(app); return db; } catch { return null; }
}

/* ---------- Types ---------- */
type Item = { id: string; name: string; price: number; imageUrl?: string; note?: string; isTest?: boolean };
type Player = { id: string; name: string; joinedAt?: number };
type Guess = { playerId: string; playerName: string; value: number; ts: number };
type Rule = "closest_without_over" | "closest_overall";
type Sfx = { win?: string; reveal?: string; tick?: string };

type RoomState = {
  code: string;
  createdAt: number;
  hostId: string;
  status: "setup" | "lobby" | "in_round" | "revealed" | "finished";
  rule: Rule;
  roundIndex: number;              // real rounds (ignores test round)
  roundEndsAt?: number | null;
  roundDurationSec: number;
  isSetupDone?: boolean;           // locked when true
  demoItemId?: string | null;      // optional test item id
  isDemoActive?: boolean;          // currently playing test round
  items: Item[];
  players: Record<string, Player>;
  guesses: Record<string, Record<string, Guess>>;
  scores: Record<string, number>;
  lastWinnerId?: string | null;
  sfx?: Sfx;                       // optional custom sound URLs (host adds in Setup)
};

/* ---------- Sample Items ---------- */
const SAMPLE_ITEMS: Omit<Item, "id">[] = [
  {
    name: "Evenflo Balance Wide-Neck Anti-Colic Baby Bottles - 9oz/2pk",
    price: 9.99,
    imageUrl:
      "https://target.scene7.com/is/image/Target/GUEST_9e58c1dc-4129-4283-8212-27eacde304b3?wid=1200&hei=1200&qlt=80&fmt=webp",
    note: "Baby Bottles!",
  },
  {
    name: "Fisher-Price Glow and Grow Kick & Play Piano Gym Baby Playmat with Musical Learning Toy",
    price: 59.99,
    imageUrl:
      "https://media.kohlsimg.com/is/image/kohls/7083250_Blue?wid=805&hei=805&op_sharpen=1",
    note: "Play time!",
  },
  {
    name: "Itzy Ritzy Friends Itzy Blocks",
    price: 21.99,
    imageUrl:
      "https://media.kohlsimg.com/is/image/kohls/7053912?wid=805&hei=805&op_sharpen=1",
    note: "Building blocks of the brain...",
  },
  {
    name: "Cottage Door Press Grandma Wishes Book",
    price: 9.99,
    imageUrl:
      "https://media.kohlsimg.com/is/image/kohls/2252749?wid=805&hei=805&op_sharpen=1",
  },
  {
    name: "MAM Original Curved Matte Baby Pacifier 2 Pack",
    price: 8.99,
    imageUrl:
      "https://media.kohlsimg.com/is/image/kohls/7083411_Pink?wid=805&hei=805&op_sharpen=1",
  },
  {
    name: "Fisher-Price Rock-A-Stack Roly-Poly Sensory Stacking Toy",
    price: 13.99,
    imageUrl:
      "https://media.kohlsimg.com/is/image/kohls/7158230?wid=805&hei=805&op_sharpen=1",
  },
  {
    name: "Baby Trend Cover Me™ 4-in-1 Convertible Car Seat",
    price: 179.99,
    imageUrl:
      "https://media.kohlsimg.com/is/image/kohls/6547103_Quartz_Pink?wid=805&hei=805&op_sharpen=1",
  },
  {
    name: "Baby Gucci logo cotton gift set",
    price: 330,
    imageUrl:
      "https://media.gucci.com/style/HEXFBFBFB_South_0_160_640x640/1523467807/516326_X9U05_9112_001_100_0000_Light.jpg",
  },
];

/* ---------- Utils ---------- */
function parseMoney(s: string): number | null {
  const v = Number(String(s ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(v) ? v : null;
}
function clean<T extends Record<string, any>>(obj: T): T {
  // Firebase can't store undefined; this strips them safely.
  return JSON.parse(JSON.stringify(obj));
}
function cls(...a: (string | false | null | undefined)[]) { return a.filter(Boolean).join(" "); }

/* ---------- Sounds (safe defaults; can override with URLs) ---------- */
function playTone(freq=880, ms=150, type: OscillatorType="sine") {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = type; o.frequency.value = freq; o.connect(g); g.connect(ctx.destination);
    const now = ctx.currentTime; g.gain.setValueAtTime(0.001, now);
    g.gain.exponentialRampToValueAtTime(0.25, now + 0.02);
    o.start(); o.stop(now + ms/1000);
    g.gain.exponentialRampToValueAtTime(0.001, now + ms/1000);
  } catch {}
}
function playUrl(url?: string) { if (!url) return; new Audio(url).play().catch(()=>{}); }
const SFX = {
  win: (url?: string) => (url ? playUrl(url) : playTone(1200, 220, "triangle")),
  reveal: (url?: string) => (url ? playUrl(url) : playTone(600, 180, "sine")),
  tick: (url?: string) => (url ? playUrl(url) : playTone(900, 90, "square")),
};

/* ===================== App Root ===================== */
export default function App() {
  const qs = new URLSearchParams(location.search);
  const paramRole = (qs.get("role") || "").toLowerCase();
  const [role, setRole] = useState<"host" | "player" | null>(paramRole === "player" ? "player" : null);
  const [roomCode, setRoomCode] = useState<string>(qs.get("room") || "");

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-pink-50 to-rose-100 text-slate-800 p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        <header className="mb-6">
          <h1 className="text-3xl md:text-5xl font-extrabold text-center md:text-left">
            🎀 The Price Is Right: <span className="text-rose-600">Baby Edition</span>
          </h1>
        </header>

        {!role && <Landing setRole={setRole} roomCode={roomCode} setRoomCode={setRoomCode} />}
        {role === "host" && <HostView roomCode={roomCode} setRoomCode={setRoomCode} />}
        {role === "player" && <PlayerView roomCode={roomCode} setRoomCode={setRoomCode} />}

        <footer className="mt-10 text-center text-xs opacity-60">Live sync via Firebase • ~30 players • Share link/QR</footer>
      </div>
    </div>
  );
}

/* ===================== Landing ===================== */
function Landing({ setRole, roomCode, setRoomCode }: { setRole: (r: "host"|"player")=>void, roomCode: string, setRoomCode:(c:string)=>void }) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="bg-white rounded-2xl p-6 shadow border">
        <h2 className="text-2xl font-bold mb-2">I’m Hosting</h2>
        <p className="text-sm opacity-80">Create a room, add items (with photos), pick rules, then invite your team.</p>
        <button className="mt-4 px-5 py-3 rounded-xl bg-rose-600 text-white font-semibold" onClick={() => setRole("host")}>Create / Host a Game</button>
      </div>
      <div className="bg-white rounded-2xl p-6 shadow border">
        <h2 className="text-2xl font-bold mb-2">I’m Joining</h2>
        <p className="text-sm opacity-80">Enter the room code shared by your host.</p>
        <div className="mt-4 flex gap-2">
          <input className="flex-1 px-3 py-3 rounded-xl border" placeholder="ROOM CODE" value={roomCode} onChange={(e)=>setRoomCode(e.target.value.toUpperCase())}/>
          <button className="px-5 py-3 rounded-xl bg-indigo-600 text-white font-semibold" onClick={()=>setRole("player")} disabled={!roomCode || roomCode.length<4}>Join Game</button>
        </div>
      </div>
    </div>
  );
}

/* ===================== Host ===================== */
function HostView({ roomCode: initial, setRoomCode }: { roomCode: string; setRoomCode: (c: string) => void; }) {
  const [room, setRoom] = useState<RoomState | null>(null);
  const [hostId] = useState<string>(() => localStorage.getItem("hostId") || uuidv4());
  const [tab, setTab] = useState<"setup" | "game" | "scores">("setup");

  useEffect(()=>localStorage.setItem("hostId", hostId),[hostId]);

  useEffect(() => {
    if (!ensureFirebase()) return;
    const code = initial && initial.length>=4 ? initial : Math.random().toString().slice(2,8).toUpperCase();
    setRoomCode(code);
    const roomRef = ref(db, `rooms/${code}`);
    onValue(roomRef, (snap)=>setRoom(snap.val()));
    (async()=>{
      const now = Date.now();
      await update(roomRef, clean({
        code, createdAt: now, hostId,
        status: "setup",
        rule: "closest_without_over",
        roundIndex: 0,
        roundDurationSec: 35,
        isSetupDone: false,
      }));
    })();
  },[]);

  if (!ensureFirebase()) return <div className="mt-6 p-4 bg-white rounded-xl">Connecting…</div>;
  if (!room) return <div className="mt-6">Loading room…</div>;

  const playerCount = Object.keys(room.players||{}).length;

  return (
    <div className="mt-6">
      <div className="bg-white rounded-2xl p-4 shadow flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <div className="text-sm opacity-70">Room Code</div>
          <div className="text-3xl font-extrabold tracking-widest">{room.code}</div>
        </div>
        <div className="flex gap-2 flex-wrap items-center text-sm">
          <Badge>Rule: {room.rule==="closest_without_over" ? "Closest w/o going over" : "Closest overall"}</Badge>
          <Badge>Round time: {room.roundDurationSec}s</Badge>
          <Badge>Items: {room.items?.length || 0}</Badge>
          <Badge>Players: {playerCount}</Badge>
          <Badge>Status: {room.status}</Badge>
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <TabButton active={tab==="setup"} onClick={()=>setTab("setup")}>Game Setup</TabButton>
        <TabButton active={tab==="game"} onClick={()=>setTab("game")} disabled={!room.isSetupDone}>Game</TabButton>
        <TabButton active={tab==="scores"} onClick={()=>setTab("scores")} disabled={!Object.keys(room.scores||{}).length}>Scores</TabButton>
      </div>

      {tab==="setup" && <HostSetup room={room} />}
      {tab==="game" && <HostGame room={room} />}
      {tab==="scores" && <HostScores room={room} />}

      <div className="mt-8 p-4 bg-white rounded-2xl text-xs">
        Player link:&nbsp;
        <code className="bg-slate-100 px-2 py-1 rounded">{location.origin + location.pathname}?room={room.code}&role=player</code>
      </div>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) { return <span className="px-3 py-1 rounded-full bg-slate-900 text-white text-xs">{children}</span>; }
function TabButton({ active, children, onClick, disabled }: { active:boolean; children:React.ReactNode; onClick:()=>void; disabled?:boolean; }) {
  return <button onClick={onClick} disabled={disabled} className={cls("px-4 py-2 rounded-2xl text-sm shadow", active?"bg-slate-900 text-white":"bg-white hover:bg-slate-50", disabled && "opacity-40 cursor-not-allowed")}>{children}</button>;
}

/* ----- Setup (items + rules + sfx + finish) ----- */
function HostSetup({ room }: { room: RoomState }) {
  const [draft, setDraft] = useState({ name:"", price:"", imageUrl:"", note:"" });
  const [csv, setCsv] = useState("");
  const locked = Boolean(room.isSetupDone);

  const up = (patch: Partial<RoomState>) => update(ref(db, `rooms/${room.code}`), clean(patch));

  const addItem = async () => {
    if (locked) return alert("Setup is finished; items are locked.");
    const v = parseMoney(draft.price);
    if (!ensureFirebase() || !draft.name.trim() || v==null) return alert("Need item name and price (e.g., 28.99)");
    const item: Item = clean({ id: uuidv4(), name: draft.name.trim(), price: v, ...(draft.imageUrl?{imageUrl:draft.imageUrl}:{}), ...(draft.note?{note:draft.note}:{}) });
    await up({ items: [...(room.items||[]), item] });
    setDraft({ name:"", price:"", imageUrl:"", note:"" });
  };
  const removeItem = async (id:string) => {
    if (locked) return alert("Setup is finished; items are locked.");
    await up({ items: (room.items||[]).filter(i=>i.id!==id) });
  };
  const setRule = (rule:Rule)=> up({ rule });
  const setRoundTime = (sec:number)=> up({ roundDurationSec: sec });

  const importCsv = async () => {
    if (locked) return;
    const lines = csv.split(/\n|\r/).map(l=>l.trim()).filter(Boolean);
    const items: Item[] = [];
    for (const line of lines) {
      const [name, priceStr, imageUrl, note, isTestStr] = line.split(",");
      const v = parseMoney(priceStr||""); if (!name || v==null) continue;
      items.push(clean({ id: uuidv4(), name, price:v, ...(imageUrl?{imageUrl}:{}), ...(note?{note}:{}), ...(isTestStr?.toLowerCase()==="true"?{isTest:true}:{}) }));
    }
    await up({ items: [...(room.items||[]), ...items] });
    setCsv("");
  };

  const loadSamples = async () => {
    if (locked) return;
    await up({ items: [...(room.items||[]), ...SAMPLE_ITEMS.map(it=>clean({...it,id:uuidv4()}))] });
  };

  const exportCsv = () => {
    const rows = [["name","price","imageUrl","note","isTest"], ... (room.items||[]).map(i=>[i.name, i.price, i.imageUrl||"", i.note||"", i.isTest? "true":""])];
    const csv = rows.map(r=>r.map(v=>String(v).replace(/"/g,'""')).map(v=>`"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], {type:"text/csv;charset=utf-8"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `baby-items-${room.code}.csv`; a.click();
    URL.revokeObjectURL(a.href);
  };

  const markTest = async (id:string) => {
    if (locked) return;
    const items = (room.items||[]).map(i => i.id===id ? {...i, isTest: true} : {...i, isTest: false});
    await up({ items, demoItemId: id });
  };

  const saveSfx = async (patch: Partial<Sfx>) => {
    await up({ sfx: clean({ ...(room.sfx||{}), ...patch }) });
  };

  const finishSetup = async () => {
    if (!room.items?.length) return alert("Add at least 1 item.");
    await up({ isSetupDone: true, status: "lobby" });
    alert("Setup finished. Invite players now! Items & rules are locked.");
  };

  const items = room.items||[];

  return (
    <div className="mt-4 grid gap-4 md:grid-cols-3">
      {/* Items */}
      <div className="bg-white rounded-2xl p-4 shadow md:col-span-2">
        <div className="flex items-center justify-between">
          <div className="font-semibold mb-3">Items ({items.length})</div>
          <div className="flex gap-2">
            <button className="px-3 py-2 rounded-xl bg-emerald-700 text-white" onClick={loadSamples} disabled={locked}>
              Load sample items ({SAMPLE_ITEMS.length})
              </button>
            <button className="px-3 py-2 rounded-xl bg-slate-900 text-white" onClick={exportCsv}>Export CSV</button>
          </div>
        </div>
        <ul className="divide-y">
          {items.map((it, idx)=>(
            <li key={it.id} className="py-2 flex items-center gap-3">
              {it.imageUrl && <img src={it.imageUrl} className="w-14 h-14 object-cover rounded-xl" alt="" />}
              <div className="flex-1">
                <div className="font-medium">{idx+1}. {it.name} {it.isTest && <span className="ml-2 text-xs bg-yellow-100 px-2 py-0.5 rounded-full border">Test round</span>}</div>
                <div className="text-xs opacity-60">True price: ${it.price.toFixed(2)} {it.note? `• ${it.note}`:""}</div>
              </div>
              <div className="flex gap-2">
                <button className={cls("text-xs px-2 py-1 rounded-lg border", it.isTest?"bg-yellow-200":"bg-white")} onClick={()=>markTest(it.id)} disabled={locked}>Set as Test</button>
                <button className="text-xs px-2 py-1 rounded-lg bg-rose-100 hover:bg-rose-200" onClick={()=>removeItem(it.id)} disabled={locked}>Remove</button>
              </div>
            </li>
          ))}
          {!items.length && <li className="py-2 text-sm opacity-70">No items yet.</li>}
        </ul>
      </div>

      {/* Add item + CSV + settings */}
      <div className="bg-white rounded-2xl p-4 shadow">
        <div className="font-semibold mb-2">Add item</div>
        <input className="w-full px-3 py-2 rounded-xl border mb-2" placeholder="Name" value={draft.name} onChange={(e)=>setDraft(p=>({...p,name:e.target.value}))} disabled={locked}/>
        <input className="w-full px-3 py-2 rounded-xl border mb-2" placeholder="Price (e.g., 28.99)" value={draft.price} onChange={(e)=>setDraft(p=>({...p,price:e.target.value}))} disabled={locked}/>
        <input className="w-full px-3 py-2 rounded-xl border mb-2" placeholder="Image URL (optional)" value={draft.imageUrl} onChange={(e)=>setDraft(p=>({...p,imageUrl:e.target.value}))} disabled={locked}/>
        <input className="w-full px-3 py-2 rounded-xl border mb-3" placeholder="Note (optional)" value={draft.note} onChange={(e)=>setDraft(p=>({...p,note:e.target.value}))} disabled={locked}/>
        <button onClick={addItem} disabled={locked} className={cls("w-full px-3 py-2 rounded-xl text-white", locked?"bg-slate-300":"bg-rose-600 hover:bg-rose-700")}>Add</button>

        <div className="mt-4 text-xs opacity-70">CSV quick add (name,price,imageUrl?,note?,isTest?)</div>
        <textarea className="w-full h-24 px-3 py-2 rounded-xl border mb-2" placeholder={`Pacifiers,7.99,https://...\nHuggies Diapers,28.49,,,"true"`} value={csv} onChange={(e)=>setCsv(e.target.value)} disabled={locked}/>
        <button onClick={importCsv} disabled={locked} className={cls("w-full px-3 py-2 rounded-xl text-white", locked?"bg-slate-300":"bg-indigo-600 hover:bg-indigo-700")}>Import CSV</button>

        <div className="mt-6 text-xs opacity-60">Rules</div>
        <div className="flex gap-2 mt-1">
          <button onClick={()=>setRule("closest_without_over")} disabled={locked} className={cls("px-3 py-2 rounded-xl", room.rule==="closest_without_over"?"bg-slate-900 text-white":"bg-white border", locked && "opacity-50 cursor-not-allowed")}>Closest w/o going over</button>
          <button onClick={()=>setRule("closest_overall")} disabled={locked} className={cls("px-3 py-2 rounded-xl", room.rule==="closest_overall"?"bg-slate-900 text-white":"bg-white border", locked && "opacity-50 cursor-not-allowed")}>Closest overall</button>
        </div>

        <div className="mt-3 text-xs opacity-60">Round duration</div>
        <div className="flex gap-2 mt-1">
          {[20,30,35,45,60].map(s=>(
            <button key={s} onClick={()=>setRoundTime(s)} disabled={locked} className={cls("px-3 py-2 rounded-xl", room.roundDurationSec===s?"bg-slate-900 text-white":"bg-white border", locked && "opacity-50 cursor-not-allowed")}>{s}s</button>
          ))}
        </div>

        <div className="mt-6 text-xs opacity-60">Sound effects (optional URLs)</div>
        <input className="w-full px-3 py-2 rounded-xl border mb-2" placeholder="Win sound URL" defaultValue={room.sfx?.win||""} onBlur={(e)=>saveSfx({win:e.target.value||undefined})}/>
        <input className="w-full px-3 py-2 rounded-xl border mb-2" placeholder="Reveal sound URL" defaultValue={room.sfx?.reveal||""} onBlur={(e)=>saveSfx({reveal:e.target.value||undefined})}/>
        <input className="w-full px-3 py-2 rounded-xl border" placeholder="Tick sound URL (last 5s)" defaultValue={room.sfx?.tick||""} onBlur={(e)=>saveSfx({tick:e.target.value||undefined})}/>

        <div className="mt-6">
          <button onClick={finishSetup} disabled={locked} className="w-full px-3 py-3 rounded-xl bg-emerald-600 text-white font-semibold">
            Finish setup & invite players
          </button>
          <div className="text-xs mt-2 text-rose-700">{locked ? "Setup is finished. Items and rules are locked." : "After finishing setup, items and rules cannot be changed."}</div>
        </div>
      </div>
    </div>
  );
}

/* ----- Game (host) ----- */
function HostGame({ room }: { room: RoomState }) {
  const currentItem = room.isDemoActive
    ? (room.items||[]).find(i=>i.id===room.demoItemId)
    : room.items?.[room.roundIndex];
  const roundKey = room.isDemoActive ? "demo" : String(room.roundIndex);
  const roundGuesses = (room.guesses?.[roundKey] || {}) as Record<string, Guess>;

  const playerCount = Object.keys(room.players||{}).length;
  const submittedCount = Object.keys(roundGuesses).length;

  const up = (patch: Partial<RoomState>) => update(ref(db, `rooms/${room.code}`), clean(patch));

  const startDemo = async () => {
    if (!room.demoItemId) return alert("Select a Test round item in Setup.");
    await up({ status:"in_round", isDemoActive:true, roundEndsAt: Date.now() + room.roundDurationSec*1000, lastWinnerId:null });
  };
  const startRealRound1 = async () => {
    await up({ status:"in_round", isDemoActive:false, roundIndex:0, roundEndsAt: Date.now() + room.roundDurationSec*1000, lastWinnerId:null });
  };
  const startRoundIfLobby = async () => {
    if (room.status!=="lobby") return;
    if (room.demoItemId) return startDemo();
    return startRealRound1();
  };

  const reveal = async () => {
    if (!currentItem) return;
    const key = room.isDemoActive ? "demo" : String(room.roundIndex);
    const entries = Object.values(roundGuesses).sort((a,b)=>a.ts-b.ts);
    let pool = entries;
    if (room.rule==="closest_without_over") {
      const notOver = entries.filter(g=>g.value<=currentItem.price);
      pool = notOver.length ? notOver : entries;
    }
    let winner: Guess | null = null;
    if (pool.length) {
      winner = pool.reduce((best,g)=>{
        const d = Math.abs(g.value-currentItem.price);
        const bd = Math.abs(best.value-currentItem.price);
        return d<bd ? g : best;
      }, pool[0]);
    }
    const scores = { ...(room.scores||{}) };
    if (winner && !room.isDemoActive) scores[winner.playerId] = (scores[winner.playerId]||0)+1; // no score for demo
    await up({ status:"revealed", scores, lastWinnerId: winner?.playerId || null, roundEndsAt: null });
    SFX.reveal(room.sfx?.reveal);
  };

  const next = async () => {
    if (room.isDemoActive) {
      // End demo, move to Round 1 immediately
      return startRealRound1();
    }
    const nextIdx = room.roundIndex + 1;
    if (nextIdx >= (room.items?.length||0)) {
      await up({ status:"finished", roundEndsAt:null });
    } else {
      await up({ status:"in_round", roundIndex: nextIdx, roundEndsAt: Date.now() + room.roundDurationSec*1000, lastWinnerId:null });
    }
  };

  // Build ranked scores for sidebar + results
  const scoreEntries = Object.entries(room.scores||{}).map(([pid,s])=>({id:pid, name: room.players?.[pid]?.name || "Player", score: s||0}));
  const ranked = scoreEntries.sort((a,b)=>b.score-a.score || a.name.localeCompare(b.name)).map((r,i)=>({...r, rank:i+1}));
  const top3 = ranked.slice(0,3);
  const players = Object.values(room.players||{}).map(p=>({ id:p.id, name:p.name, guessed:Boolean(roundGuesses[p.id]), score: room.scores?.[p.id]||0, rank: ranked.find(r=>r.id===p.id)?.rank || "-" })).sort((a,b)=>a.name.localeCompare(b.name));

  return (
    <div className="mt-4 grid gap-4 md:grid-cols-3">
      {/* Left: main round */}
      <div className="bg-white rounded-2xl p-4 shadow md:col-span-2">
        <div className="flex items-center justify-between">
          <div className="text-sm opacity-60">{room.isDemoActive ? "Test round" : `Round ${room.roundIndex+1} / ${room.items.length}`}</div>
          <div className="text-xs opacity-70">Submissions: {submittedCount} / {playerCount}</div>
        </div>

        {/* Only show item details during active round (not in lobby) */}
        {room.status==="in_round" && currentItem && (
          <div className="mt-2">
            <div className="text-2xl font-bold mb-1">Guess the price!</div>
            <div className="flex gap-4 items-center">
              {currentItem.imageUrl && <img src={currentItem.imageUrl} className="w-40 h-40 object-cover rounded-xl" alt=""/>}
              <div className="flex-1">
                <div className="text-xl font-semibold">{currentItem.name}</div>
                <div className="mt-1 text-sm">Time left: <Countdown targetMs={room.roundEndsAt||0} sfxTick={room.sfx?.tick}/></div>
              </div>
            </div>
          </div>
        )}

        {/* Guesses */}
        <div className="mt-4">
          <div className="font-semibold mb-2">Guesses</div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {Object.values(roundGuesses).map(g=>(
              <div key={g.playerId} className="px-3 py-2 rounded-xl bg-slate-100 text-sm">
                <div className="font-medium">{g.playerName}</div>
                <div>${g.value.toFixed(2)}</div>
              </div>
            ))}
            {!Object.keys(roundGuesses).length && <div className="text-sm opacity-60">Waiting for guesses…</div>}
          </div>
        </div>

        {/* Buttons */}
        <div className="mt-4 flex gap-2">
          {room.status==="lobby" && (
            <button className="px-4 py-2 rounded-xl bg-emerald-600 text-white" onClick={startRoundIfLobby}>
              {room.demoItemId ? "Start test round" : "Start Round 1"}
            </button>
          )}
          {room.status==="in_round" && <button className="px-4 py-2 rounded-xl bg-slate-900 text-white" onClick={reveal}>Reveal now</button>}
          {room.status==="revealed" && (
            <button className="px-4 py-2 rounded-xl bg-indigo-600 text-white" onClick={next}>
              {room.isDemoActive ? "Start Round 1" : (room.roundIndex === (room.items.length-1) ? "Show results" : "Next item")}
            </button>
          )}
          {room.status==="finished" && <ResultsBlock ranked={ranked} />}
        </div>
      </div>

      {/* Right: reveal + players + scores */}
      <div className="space-y-4">
        <div className="bg-white rounded-2xl p-4 shadow">
          <div className="font-semibold mb-2">Reveal</div>
          {(room.status!=="revealed" || !currentItem) ? (
            <div className="text-sm opacity-70">{room.status==="lobby" ? "Waiting for host and players" : "True price hidden"}</div>
          ) : (
            <div>
              <div className="text-5xl font-extrabold text-rose-600">${currentItem.price.toFixed(2)}</div>
              <div className="mt-1 text-sm">
                {room.isDemoActive ? "Practice round — no points awarded." :
                 <>Winner: <b>{room.lastWinnerId ? room.players?.[room.lastWinnerId]?.name || "Player" : "—"}</b></>}
              </div>
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl p-4 shadow">
          <div className="font-semibold mb-2">Players ({players.length})</div>
          <ul className="text-sm divide-y">
            {players.map(p=>(
              <li key={p.id} className="py-1 flex justify-between">
                <span>{p.name} {top3.find(t=>t.id===p.id)&&<span className="ml-1">🏅</span>}</span>
                <span className="text-xs">{p.guessed?"✓ guessed":"—"} • {p.score} pts</span>
              </li>
            ))}
            {!players.length && <li className="py-1 opacity-60">No players yet.</li>}
          </ul>
        </div>

        <div className="bg-white rounded-2xl p-4 shadow">
          <div className="font-semibold mb-2">Scores</div>
          {!ranked.length ? <div className="text-sm opacity-60">No scores yet.</div> : (
            <table className="w-full text-left text-sm">
              <thead><tr className="opacity-60"><th className="py-1">#</th><th>Player</th><th>Score</th></tr></thead>
              <tbody>{ranked.map(r=>(
                <tr key={r.id} className="border-t"><td className="py-1">{r.rank}</td><td>{r.name}</td><td>{r.score}</td></tr>
              ))}</tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

/* ----- Results / Podium block ----- */
function ResultsBlock({ ranked }: { ranked:{id:string;name:string;score:number;rank:number}[] }) {
  const top3 = ranked.slice(0,3);
  return (
    <div className="bg-yellow-50 text-yellow-900 px-3 py-2 rounded-xl">
      <div className="font-semibold mb-1">Final Results</div>
      <div className="flex items-end gap-3">
        {top3[1] && <div className="flex-1 text-center"><div className="text-lg">🥈 {top3[1].name}</div><div className="bg-slate-300 h-10 rounded-t-xl mt-1"/></div>}
        {top3[0] && <div className="flex-1 text-center"><div className="text-xl font-bold">🥇 {top3[0].name}</div><div className="bg-slate-400 h-16 rounded-t-xl mt-1"/></div>}
        {top3[2] && <div className="flex-1 text-center"><div className="text-lg">🥉 {top3[2].name}</div><div className="bg-slate-200 h-6 rounded-t-xl mt-1"/></div>}
      </div>
      <div className="mt-3">
        <table className="w-full text-left text-sm">
          <thead><tr className="opacity-60"><th className="py-1">#</th><th>Player</th><th>Score</th></tr></thead>
          <tbody>{ranked.map(r=>(
            <tr key={r.id} className="border-t"><td className="py-1">{r.rank}</td><td>{r.name}</td><td>{r.score}</td></tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}

/* ===================== Player ===================== */
function PlayerView({ roomCode: initial, setRoomCode }: { roomCode: string; setRoomCode:(c:string)=>void; }) {
  const [playerId] = useState<string>(()=>localStorage.getItem("playerId") || uuidv4());
  const [name, setName] = useState<string>(()=>localStorage.getItem("playerName") || "");
  const [code, setCode] = useState<string>(initial || "");
  const [hasJoined, setHasJoined] = useState(false);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [guess, setGuess] = useState("");

  useEffect(()=>localStorage.setItem("playerId", playerId),[playerId]);
  useEffect(()=>localStorage.setItem("playerName", name),[name]);
  useEffect(()=>{ if (code) setRoomCode(code); },[code]);

  useEffect(() => {
    if (!ensureFirebase() || !code) return;
    const roomRef = ref(db, `rooms/${code}`);
    const unsub = onValue(roomRef, snap => setRoom(snap.val()));
    return ()=>unsub();
  }, [code]);

  const join = async () => {
    if (!ensureFirebase()) return alert("Connecting to Firebase…");
    const trimmed = (code||"").toUpperCase().trim();
    if (!trimmed || name.trim().length<1) return alert("Enter your name and the room code.");
    await update(ref(db, `rooms/${trimmed}/players/${playerId}`), clean({ id: playerId, name: name.trim(), joinedAt: Date.now() }));
    setCode(trimmed);
    setHasJoined(true);
  };

  const isDemo = Boolean(room?.isDemoActive);
  const currentItem = isDemo ? room?.items?.find(i=>i.id===room?.demoItemId) : room?.items?.[room?.roundIndex||0];
  const roundKey = isDemo ? "demo" : String(room?.roundIndex || 0);
  const roundGuesses = (room?.guesses?.[roundKey] || {}) as Record<string, Guess>;
  const myGuess = roundGuesses?.[playerId]?.value;

  const submitGuess = async () => {
    if (!ensureFirebase() || !room) return;
    if (room.status!=="in_round") return;
    if (typeof myGuess === "number") return;
    const v = parseMoney(guess); if (v==null) return alert("Enter a number (e.g., 23.50)");
    await update(ref(db, `rooms/${room.code}/guesses/${roundKey}/${playerId}`), clean({ playerId, playerName: name.trim(), value: v, ts: Date.now() }));
    setGuess("");
  };

  // Rank & my score
  const scoreEntries = Object.entries(room?.scores||{}).map(([pid,s])=>({ id:pid, name: room?.players?.[pid]?.name || "Player", score: s||0 }));
  const ranked = scoreEntries.sort((a,b)=>b.score-a.score || a.name.localeCompare(b.name)).map((r,i)=>({...r, rank:i+1}));
  const myScore = (room?.scores||{})[playerId] || 0;
  const myRank = ranked.find(r=>r.id===playerId)?.rank || (ranked.length? ranked.length+1 : 1);

  // Reveal messaging + sounds
  useEffect(()=>{
    if (!room) return;
    if (room.status==="revealed") {
      const iWon = room.lastWinnerId === playerId && !room.isDemoActive;
      if (iWon) SFX.win(room.sfx?.win); else SFX.reveal(room.sfx?.reveal);
    }
  }, [room?.status, room?.lastWinnerId]);

  // Previous rounds list (small, below main)
  const historyRows = useMemo(()=>{
    if (!room) return [];
    const rows: {name:string; price:number; my?:number; won:boolean; isDemo:boolean}[] = [];
    const upto = room.status==="revealed" || room.status==="finished" ? room.roundIndex : Math.max(0,(room.roundIndex||0)-1);
    for (let i=0; i<=upto; i++) {
      const item = room.items?.[i]; if (!item) continue;
      const g = room.guesses?.[String(i)] || {};
      const mine = (g as any)?.[playerId]?.value;
      const won = room.lastWinnerId && room.status!=="in_round" ? (room.lastWinnerId===playerId && i===room.roundIndex) : false;
      rows.push({ name: item.name, price: item.price, my: typeof mine==="number" ? mine : undefined, won, isDemo:false });
    }
    // include demo if already revealed
    if (room.demoItemId && !room.isDemoActive && room.status!=="setup" && room.status!=="lobby") {
      const demo = room.items?.find(i=>i.id===room.demoItemId);
      if (demo) rows.unshift({ name: `(Test) ${demo.name}`, price: demo.price, my: room.guesses?.["demo"]?.[playerId]?.value, won:false, isDemo:true });
    }
    return rows;
  }, [room?.items, room?.guesses, room?.roundIndex, room?.status, room?.lastWinnerId]);

  const tooHigh = room?.rule==="closest_without_over" && typeof myGuess==="number" && currentItem && myGuess>currentItem.price;
  const iWon = room?.lastWinnerId===playerId && !room?.isDemoActive;

  return (
    <div className="mt-6 max-w-xl mx-auto bg-white rounded-2xl p-5 shadow">
      {!hasJoined && (
        <div>
          <div className="font-semibold mb-2">Join a room</div>
          <GuestHowTo />
          <input className="w-full px-3 py-2 rounded-xl border mb-2" placeholder="Display name" value={name} onChange={(e)=>setName(e.target.value)}/>
          <input className="w-full px-3 py-2 rounded-xl border mb-3" placeholder="Room code" value={code} onChange={(e)=>setCode(e.target.value.toUpperCase())}/>
          <button className="w-full px-4 py-2 rounded-xl bg-indigo-600 text-white" onClick={join}>Join</button>
          <div className="mt-3 text-xs opacity-70">Waiting for host and players…</div>
        </div>
      )}

      {hasJoined && room && (
        <div>
          <div className="text-sm opacity-70">Room {room.code}</div>

          {/* Waiting / Round / Reveal */}
          {room.status==="lobby" && <div className="mt-3 p-3 rounded-xl bg-white border text-sm">Waiting for host and players… Your score: <b>{myScore}</b> • Rank: <b>{myRank}</b></div>}

          {room.status==="in_round" && (
            <div className="mt-3 p-3 rounded-xl border" style={{background: "#fff7f7"}}>
              <div className="text-sm opacity-60">{room.isDemoActive ? "Test round" : `Round ${room.roundIndex+1} / ${room.items.length}`}</div>
              <div className="text-lg font-semibold">{currentItem?.name || ""}</div>
              <div className="mt-1 text-sm">Ends in <Countdown targetMs={room.roundEndsAt||0} sfxTick={room.sfx?.tick}/></div>

              {typeof myGuess!=="number" ? (
                <div className="mt-3 flex gap-2">
                  <input className="flex-1 px-3 py-2 rounded-xl border" placeholder="$0.00" value={guess} onChange={(e)=>setGuess(e.target.value)} />
                  <button className="px-4 py-2 rounded-xl bg-emerald-600 text-white" onClick={submitGuess}>Submit</button>
                </div>
              ) : (
                <div className="mt-3 text-sm opacity-70">Your guess: ${myGuess.toFixed(2)} (waiting for reveal…)</div>
              )}
            </div>
          )}

          {room.status==="revealed" && currentItem && (
            <div className="mt-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200">
              <div className="font-semibold mb-1">Reveal</div>
              <div className="text-sm">Correct price: <b>${currentItem.price.toFixed(2)}</b></div>
              {typeof myGuess==="number"
                ? (<>
                    <div className="text-sm">Your guess: ${myGuess.toFixed(2)}</div>
                    <div className="text-sm">Off by: {(Math.abs(myGuess-currentItem.price)).toFixed(2)}</div>
                    {room.isDemoActive ? <div className="text-sm opacity-70">Practice round — no points.</div> :
                      (iWon ? <div className="text-sm text-emerald-700 font-semibold">Ohhh yea! <b>{room.players?.[playerId]?.name || "You"}</b> guessed the closest without going over! +1 point! 🎉</div>
                            : <div className="text-sm">{tooHigh ? <span className="text-rose-700">Too high!</span> : <span className="opacity-80">Better luck next time!</span>}</div>)}
                  </>)
                : <div className="text-sm opacity-70">You didn’t submit a guess this round.</div>}
              <div className="text-sm mt-1">Your score: <b>{myScore}</b> • Rank: <b>{myRank}</b></div>
            </div>
          )}

          {room.status==="finished" && (
            <div className="mt-4 p-3 rounded-xl bg-white border">
              <div className="font-semibold mb-2">Final Results</div>
              <PlayerResults ranked={ranked} />
            </div>
          )}

          {/* History (compact) */}
          {!!historyRows.length && (
            <div className="mt-5">
              <div className="text-xs opacity-60 mb-1">Previous rounds</div>
              <table className="w-full text-xs">
                <thead><tr className="opacity-60"><th className="py-1 text-left">Item</th><th className="text-right">You</th><th className="text-right">Price</th></tr></thead>
                <tbody>
                  {historyRows.map((r,idx)=>(
                    <tr key={idx} className="border-t">
                      <td className="py-1">{r.name}</td>
                      <td className="text-right">{typeof r.my==="number" ? `$${r.my.toFixed(2)}` : "—"}</td>
                      <td className="text-right">${r.price.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PlayerResults({ ranked }: { ranked:{id:string;name:string;score:number;rank:number}[] }) {
  const top3 = ranked.slice(0,3);
  return (
    <div>
      <div className="flex items-end gap-3">
        {top3[1] && <div className="flex-1 text-center"><div className="text-lg">🥈 {top3[1].name}</div><div className="bg-slate-300 h-10 rounded-t-xl mt-1"/></div>}
        {top3[0] && <div className="flex-1 text-center"><div className="text-xl font-bold">🥇 {top3[0].name}</div><div className="bg-slate-400 h-16 rounded-t-xl mt-1"/></div>}
        {top3[2] && <div className="flex-1 text-center"><div className="text-lg">🥉 {top3[2].name}</div><div className="bg-slate-200 h-6 rounded-t-xl mt-1"/></div>}
      </div>
      <table className="w-full text-left text-sm mt-3">
        <thead><tr className="opacity-60"><th className="py-1">#</th><th>Player</th><th>Score</th></tr></thead>
        <tbody>{ranked.map(r=>(
          <tr key={r.id} className="border-t"><td className="py-1">{r.rank}</td><td>{r.name}</td><td>{r.score}</td></tr>
        ))}</tbody>
      </table>
    </div>
  );
}

/* ---------- Shared UI ---------- */
function Countdown({ targetMs, sfxTick }: { targetMs:number; sfxTick?:string }) {
  const [now, setNow] = useState(Date.now());
  const [played, setPlayed] = useState<{[s:number]:boolean}>({});
  useEffect(()=>{ const t = setInterval(()=>setNow(Date.now()), 200); return ()=>clearInterval(t); },[]);
  const remain = Math.max(0, targetMs - now);
  const s = Math.ceil(remain/1000);
  // Beep last 5 seconds once each
  useEffect(()=>{
    if (s<=5 && s>0 && !played[s]) { setPlayed(p=>({...p,[s]:true})); SFX.tick(sfxTick); }
  }, [s]);
  return <span className={cls("font-semibold", s<=5 && "text-rose-600 animate-pulse")}>{s}s</span>;
}

function HostScores({ room }: { room: RoomState }) {
  const players = room.players||{}; const scores = room.scores||{};
  const rows = Object.keys(players).map(pid=>({ playerId: pid, name: players[pid].name, score: scores[pid]||0 })).sort((a,b)=>b.score-a.score || a.name.localeCompare(b.name));
  return (
    <div className="mt-4 bg-white rounded-2xl p-4 shadow">
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

function GuestHowTo() {
  return (
    <div className="text-xs bg-white rounded-xl border p-3 mb-3">
      <div className="font-semibold mb-1">How to play</div>
      <ul className="list-disc pl-4 space-y-1">
        <li>Enter the room code and your display name, then tap <b>Join</b>.</li>
        <li>When a round starts, type the price (e.g., <code>24.99</code>) and tap <b>Submit</b>. One guess per round.</li>
        <li>Scoring: <b>1 point</b> to the single round winner.
          <ul className="list-disc pl-4 mt-1">
            <li><b>Closest without going over</b> (default). If everyone goes over, we switch to <i>closest overall</i> for that round.</li>
            <li>Ties go to the <i>earliest</i> submitted guess.</li>
            <li>Practice (test) round never scores.</li>
          </ul>
        </li>
        <li>After each round, you’ll see the <b>correct price</b>, your <b>guess</b>, how far off you were, whether you <b>won</b>, and your <b>score</b>.</li>
      </ul>
    </div>
  );
}
