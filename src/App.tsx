import React, { useEffect, useMemo, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, update } from "firebase/database";

/* =========================================================
 *  The Price Is Right — Baby Edition (Show-Style Build)
 *  - Guided host setup, practice round, invite flow
 *  - Player “Come on down!” join moment
 *  - Bids hidden until Reveal; tie rule honors same-amount wins
 *  - Marquee/price-tag theme; built-in sounds w/ mute toggle
 * ========================================================= */

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
type Item = { id: string; name: string; price: number; imageUrl?: string; note?: string };
type Player = { id: string; name: string; joinedAt?: number };
type Guess = { playerId: string; playerName: string; value: number; ts: number };
type Rule = "closest_without_over" | "closest_overall";

type RoomState = {
  code: string;
  createdAt: number;
  hostId: string;
  status: "setup" | "lobby" | "in_round" | "revealed" | "finished";
  rule: Rule;
  roundIndex: number;                 // real rounds only
  roundEndsAt?: number | null;
  roundDurationSec: number;
  isSetupDone?: boolean;
  demoItem?: Item | null;             // practice item (removed from lineup)
  isDemoActive?: boolean;
  items: Item[];
  players: Record<string, Player>;
  guesses: Record<string, Record<string, Guess>>; // "demo" or roundIndex
  scores: Record<string, number>;
  lastWinnerIds?: string[] | null;    // multiple winners if same amount
  themeMuted?: boolean;               // mute sounds
};

/* ---------- Sample items (you can customize; load during Setup) ---------- */
const SAMPLE_ITEMS: Omit<Item, "id">[] = [
  // Replace with your latest curated list whenever you want.
  { name: "Evenflo Balance Wide-Neck Anti-Colic Baby Bottles - 9oz/2pk", price: 9.99, imageUrl: "https://target.scene7.com/is/image/Target/GUEST_9e58c1dc-4129-4283-8212-27eacde304b3?wid=1200&hei=1200&qlt=80&fmt=webp", note: "Baby Bottles!" },
  { name: "Fisher-Price Glow and Grow Kick & Play Piano Gym Baby Playmat with Musical Learning Toy", price: 59.99, imageUrl: "https://media.kohlsimg.com/is/image/kohls/7083250_Blue?wid=805&hei=805&op_sharpen=1", note: "Play time!" },
  { name: "Itzy Ritzy Friends Itzy Blocks", price: 21.99, imageUrl: "https://media.kohlsimg.com/is/image/kohls/7053912?wid=805&hei=805&op_sharpen=1", note: "Building blocks of the brain..." },
  { name: "Cottage Door Press Grandma Wishes Book", price: 9.99, imageUrl: "https://media.kohlsimg.com/is/image/kohls/2252749?wid=805&hei=805&op_sharpen=1" },
  { name: "MAM Original Curved Matte Baby Pacifier 2 Pack", price: 8.99, imageUrl: "https://media.kohlsimg.com/is/image/kohls/7083411_Pink?wid=805&hei=805&op_sharpen=1" },
  { name: "Fisher-Price Rock-A-Stack Roly-Poly Sensory Stacking Toy", price: 13.99, imageUrl: "https://media.kohlsimg.com/is/image/kohls/7158230?wid=805&hei=805&op_sharpen=1" },
  { name: "Baby Trend Cover Me™ 4-in-1 Convertible Car Seat", price: 179.99, imageUrl: "https://media.kohlsimg.com/is/image/kohls/6547103_Quartz_Pink?wid=805&hei=805&op_sharpen=1" },
  { name: "Baby Gucci logo cotton gift set", price: 330, imageUrl: "https://media.gucci.com/style/HEXFBFBFB_South_0_160_640x640/1523467807/516326_X9U05_9112_001_100_0000_Light.jpg" },
];

/* ---------- Utils ---------- */
function parseMoney(s: string): number | null {
  const v = Number(String(s ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(v) ? v : null;
}
function clean<T extends Record<string, any>>(obj: T): T {
  // Strip undefined for RTDB
  return JSON.parse(JSON.stringify(obj));
}
function cls(...a: (string | false | null | undefined)[]) { return a.filter(Boolean).join(" "); }
function toCurrency(n: number) { return `$${n.toFixed(2)}`; }

/* ---------- Built-in Sounds (no setup) ---------- */
function playTone(freq=880, ms=150, type: OscillatorType="sine") {
  try {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = type; o.frequency.value = freq; o.connect(g); g.connect(ctx.destination);
    const now = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.2, now + 0.02);
    o.start(); o.stop(now + ms/1000);
    g.gain.exponentialRampToValueAtTime(0.0001, now + ms/1000);
  } catch {}
}
const SFX = {
  tick: () => playTone(900, 90, "square"),
  reveal: () => playTone(600, 180, "sine"),
  win: () => playTone(1200, 240, "triangle"),
};

/* =========================================================
 *  App Root
 * ========================================================= */
export default function App() {
  const qs = new URLSearchParams(location.search);
  const paramRole = (qs.get("role") || "").toLowerCase();
  const [role, setRole] = useState<"host" | "player" | null>(paramRole === "player" ? "player" : null);
  const [roomCode, setRoomCode] = useState<string>(qs.get("room") || "");

  return (
    <div className="min-h-screen w-full bg-[radial-gradient(circle_at_20%_10%,#FFF2B3_0,#FAD6E7_35%,#E6D9FF_70%)] text-slate-900 p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        <header className="mb-6">
          <MarqueeTitle />
        </header>

        {!role && <Landing setRole={setRole} roomCode={roomCode} setRoomCode={setRoomCode} />}
        {role === "host" && <HostView roomCode={roomCode} setRoomCode={setRoomCode} />}
        {role === "player" && <PlayerView roomCode={roomCode} setRoomCode={setRoomCode} />}

        <footer className="mt-10 text-center text-xs opacity-70">
          Live sync via Firebase • ~30 players • Share link/QR
        </footer>
      </div>
    </div>
  );
}

/* ---------- Themed bits ---------- */
function MarqueeTitle() {
  return (
    <div className="relative">
      <div className="mx-auto max-w-3xl rounded-3xl border-4 border-[#FFC700] bg-white shadow-[0_0_0_6px_#FFF]">
        <div className="px-5 py-4 text-center">
          <h1 className="font-extrabold text-3xl md:text-5xl tracking-tight">
            <span className="text-[#E63946]">THE PRICE IS RIGHT</span>{" "}
            <span className="text-[#17A34A]">— BABY EDITION</span>
          </h1>
          <div className="text-sm mt-1 text-[#2563EB]">Closest without going over wins!</div>
        </div>
      </div>
      {/* Light bulbs */}
      <div className="absolute -inset-1 pointer-events-none grid grid-cols-8 gap-1 opacity-90">
        {[...Array(32)].map((_, i) => (
          <span key={i} className={cls("rounded-full h-1 w-1 bg-[#FFC700]", i%3===0 && "opacity-50")} />
        ))}
      </div>
    </div>
  );
}

function PriceTag({ children }: { children: React.ReactNode }) {
  // chunky price-tag w/ "hole"
  return (
    <div className="relative inline-block bg-[#FFC700] text-slate-900 font-extrabold px-3 py-1 rounded-lg shadow">
      <span className="absolute -left-2 top-1/2 -translate-y-1/2 h-3 w-3 rounded-full bg-white border border-slate-300" />
      {children}
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="px-3 py-1 rounded-full bg-slate-900 text-white text-xs">{children}</span>;
}
function TabButton({ active, children, onClick, disabled }: { active:boolean; children:React.ReactNode; onClick:()=>void; disabled?:boolean }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className={cls("px-4 py-2 rounded-2xl text-sm shadow",
        active ? "bg-slate-900 text-white" : "bg-white hover:bg-slate-50",
        disabled && "opacity-40 cursor-not-allowed"
      )}>
      {children}
    </button>
  );
}

/* =========================================================
 *  Landing
 * ========================================================= */
function Landing({ setRole, roomCode, setRoomCode }: { setRole: (r:"host"|"player")=>void; roomCode:string; setRoomCode:(c:string)=>void; }) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="bg-white rounded-3xl p-6 shadow border-4 border-[#FFC700]">
        <h2 className="text-2xl font-bold mb-2">I’m Hosting</h2>
        <p className="text-sm opacity-80">Create a room, add items (with photos), pick rules, then invite your team.</p>
        <button className="mt-4 px-5 py-3 rounded-xl bg-[#E63946] text-white font-semibold" onClick={()=>setRole("host")}>
          Start Shower
        </button>
      </div>
      <div className="bg-white rounded-3xl p-6 shadow border-4 border-[#14B8A6]">
        <h2 className="text-2xl font-bold mb-2">I’m Joining</h2>
        <p className="text-sm opacity-80">Enter the room code from your host.</p>
        <div className="mt-4 flex gap-2">
          <input className="flex-1 px-3 py-3 rounded-xl border" placeholder="ROOM CODE" value={roomCode} onChange={(e)=>setRoomCode(e.target.value.toUpperCase())}/>
          <button className="px-5 py-3 rounded-xl bg-[#2563EB] text-white font-semibold" onClick={()=>setRole("player")} disabled={!roomCode || roomCode.length<4}>
            Join Game
          </button>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
 *  Host
 * ========================================================= */
function HostView({ roomCode: initial, setRoomCode }: { roomCode:string; setRoomCode:(c:string)=>void; }) {
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
      }));
    })();
  },[]);

  if (!ensureFirebase()) return <div className="mt-6 p-4 bg-white rounded-xl">Connecting…</div>;
  if (!room) return <div className="mt-6">Loading room…</div>;

  const playerCount = Object.keys(room.players||{}).length;

  return (
    <div className="mt-6">
      <div className="bg-white rounded-3xl p-4 shadow flex flex-col md:flex-row md:items-center md:justify-between gap-3 border-4 border-[#FFF2B3]">
        <div>
          <div className="text-sm opacity-70">Room Code</div>
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

      <div className="mt-8 p-4 bg-white rounded-2xl text-xs">
        Player link:&nbsp;
        <code className="bg-slate-100 px-2 py-1 rounded">{location.origin + location.pathname}?room={room.code}&role=player</code>
      </div>
    </div>
  );
}

function MuteToggle({ room }: { room: RoomState }) {
  const toggle = async () => {
    await update(ref(db, `rooms/${room.code}`), { themeMuted: !room.themeMuted });
  };
  return (
    <button onClick={toggle} className={cls("px-3 py-1 rounded-xl text-xs",
      room.themeMuted ? "bg-slate-200" : "bg-[#CFF3E6]")}>
      {room.themeMuted ? "Sound: Off" : "Sound: On"}
    </button>
  );
}

/* ---------- Host Setup ---------- */
function HostSetup({ room, onFinished }: { room: RoomState; onFinished: ()=>void }) {
  const [draft, setDraft] = useState({ name:"", price:"", imageUrl:"", note:"" });
  const [csv, setCsv] = useState("");
  const locked = Boolean(room.isSetupDone);
  const up = (patch: Partial<RoomState>) => update(ref(db, `rooms/${room.code}`), clean(patch));

  const addItem = async () => {
    if (locked) return alert("Setup is finished; items are locked.");
    const v = parseMoney(draft.price);
    if (!ensureFirebase() || !draft.name.trim() || v==null) return alert("Need item name and price (e.g., 28.99)");
    const item: Item = clean({ id: uuidv4(), name: draft.name.trim(), price: v, ...(draft.imageUrl?{imageUrl:draft.imageUrl}:{}) , ...(draft.note?{note:draft.note}:{}) });
    await up({ items: [...(room.items||[]), item] });
    setDraft({ name:"", price:"", imageUrl:"", note:"" });
  };

  const removeItem = async (id:string) => {
    if (locked) return alert("Setup is finished; items are locked.");
    await up({ items: (room.items||[]).filter(i=>i.id!==id) });
  };

  const saveItem = async (it: Item) => {
    if (locked) return;
    const items = (room.items||[]).map(i => i.id===it.id ? clean(it) : i);
    await up({ items });
  };

  const markTest = async (id:string) => {
    if (locked) return;
    const items = room.items||[];
    const test = items.find(i=>i.id===id);
    if (!test) return;
    // remove from lineup and set as demo
    const rest = items.filter(i=>i.id!==id);
    await up({ items: rest, demoItem: test });
  };

  const setRule = (rule:Rule)=> up({ rule });
  const setRoundTime = (sec:number)=> up({ roundDurationSec: sec });

  const loadSamples = async () => {
    if (locked) return;
    await up({ items: [...(room.items||[]), ...SAMPLE_ITEMS.map(it=>clean({...it,id:uuidv4()}))] });
  };

  const exportCsv = () => {
    const rows = [["name","price","imageUrl","note","isTest"],
      ...(room.demoItem ? [[room.demoItem.name, room.demoItem.price, room.demoItem.imageUrl||"", room.demoItem.note||"", "true"]] : []),
      ...(room.items||[]).map(i=>[i.name, i.price, i.imageUrl||"", i.note||"", ""])
    ];
    const csv = rows.map(r=>r.map(v=>String(v).replace(/"/g,'""')).map(v=>`"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], {type:"text/csv;charset=utf-8"});
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `baby-items-${room.code}.csv`; a.click(); URL.revokeObjectURL(a.href);
  };

  const importCsv = async () => {
    if (locked) return;
    const lines = csv.split(/\n|\r/).map(l=>l.trim()).filter(Boolean);
    let demo: Item | null = room.demoItem || null;
    const acc: Item[] = [...(room.items||[])];
    for (const line of lines) {
      const [name, priceStr, imageUrl, note, isTestStr] = line.split(",");
      const v = parseMoney(priceStr||""); if (!name || v==null) continue;
      const it: Item = clean({ id: uuidv4(), name, price: v, ...(imageUrl?{imageUrl}:{}) , ...(note?{note}:{}) });
      if (String(isTestStr||"").toLowerCase()==="true") demo = it; else acc.push(it);
    }
    await up({ items: acc, demoItem: demo });
    setCsv("");
  };

  const finishSetup = async () => {
    if (!room.items?.length && !room.demoItem) return alert("Add at least 1 real item (test item doesn’t count).");
    await up({ isSetupDone: true, status: "lobby" });
    alert("Setup finished. Invite players now! Items & rules are locked.");
    onFinished(); // switch to Game tab
  };

  const items = room.items||[];

  return (
    <div className="mt-4 grid gap-4 md:grid-cols-3">
      {/* Items */}
      <div className="bg-white rounded-3xl p-4 shadow md:col-span-2 border-2 border-[#CDE7FF]">
        <div className="flex items-center justify-between">
          <div className="font-semibold mb-3">Items ({items.length})</div>
          <div className="flex gap-2">
            <button className="px-3 py-2 rounded-xl bg-[#17A34A] text-white" onClick={loadSamples} disabled={locked}>Load sample items ({SAMPLE_ITEMS.length})</button>
            <button className="px-3 py-2 rounded-xl bg-slate-900 text-white" onClick={exportCsv}>Export CSV</button>
          </div>
        </div>

        <ul className="divide-y">
          {room.demoItem && (
            <li className="py-2 flex items-center gap-3 bg-[#FFF2B3]/40 rounded-xl px-2 mb-2">
              {room.demoItem.imageUrl && <img src={room.demoItem.imageUrl} className="w-14 h-14 object-cover rounded-xl" alt="" />}
              <div className="flex-1">
                <div className="font-medium">Practice item: {room.demoItem.name}</div>
                <div className="text-xs opacity-60">Price (hidden to players): {toCurrency(room.demoItem.price)}</div>
              </div>
              <span className="text-xs px-2 py-1 rounded border bg-yellow-100">Test Round</span>
            </li>
          )}
          {items.map((it, idx)=>(
            <EditableItem key={it.id} it={it} idx={idx} onSave={saveItem} onRemove={()=>removeItem(it.id)} onMarkTest={()=>markTest(it.id)} disabled={locked}/>
          ))}
          {!items.length && <li className="py-2 text-sm opacity-70">No real items yet.</li>}
        </ul>
      </div>

      {/* Add item + CSV + settings */}
      <div className="bg-white rounded-3xl p-4 shadow border-2 border-[#FAD6E7]">
        <div className="font-semibold mb-2">Add item</div>
        <input className="w-full px-3 py-2 rounded-xl border mb-2" placeholder="Name" value={draft.name} onChange={(e)=>setDraft(p=>({...p,name:e.target.value}))} disabled={locked}/>
        <input className="w-full px-3 py-2 rounded-xl border mb-2" placeholder="Price (e.g., 28.99)" value={draft.price} onChange={(e)=>setDraft(p=>({...p,price:e.target.value}))} disabled={locked}/>
        <input className="w-full px-3 py-2 rounded-xl border mb-2" placeholder="Image URL (optional)" value={draft.imageUrl} onChange={(e)=>setDraft(p=>({...p,imageUrl:e.target.value}))} disabled={locked}/>
        <input className="w-full px-3 py-2 rounded-xl border mb-3" placeholder="Note (optional)" value={draft.note} onChange={(e)=>setDraft(p=>({...p,note:e.target.value}))} disabled={locked}/>
        <button onClick={addItem} disabled={locked} className={cls("w-full px-3 py-2 rounded-xl text-white", locked?"bg-slate-300":"bg-[#E63946] hover:opacity-95")}>Add</button>

        <div className="mt-4 text-xs opacity-70">CSV quick add (name,price,imageUrl?,note?,isTest?)</div>
        <textarea className="w-full h-24 px-3 py-2 rounded-xl border mb-2" placeholder={`Pacifiers,7.99,https://...\nHuggies Diapers,28.49,,,"true"`} value={csv} onChange={(e)=>setCsv(e.target.value)} disabled={locked}/>
        <button onClick={importCsv} disabled={locked} className={cls("w-full px-3 py-2 rounded-xl text-white", locked?"bg-slate-300":"bg-[#2563EB] hover:opacity-95")}>Import CSV</button>

        <div className="mt-6 text-xs opacity-60">Rules</div>
        <div className="flex gap-2 mt-1">
          <button onClick={()=>setRule("closest_without_over")} disabled={locked} className={cls("px-3 py-2 rounded-xl", room.rule==="closest_without_over"?"bg-slate-900 text-white":"bg-white border", locked && "opacity-50 cursor-not-allowed")}>Closest w/o going over</button>
          <button onClick={()=>setRule("closest_overall")} disabled={locked} className={cls("px-3 py-2 rounded-xl", room.rule==="closest_overall"?"bg-slate-900 text-white":"bg-white border", locked && "opacity-50 cursor-not-allowed")}>Closest overall</button>
        </div>

        <div className="mt-3 text-xs opacity-60">Round duration</div>
        <div className="flex gap-2 mt-1">
          {[35,45,60].map(s=>(
            <button key={s} onClick={()=>setRoundTime(s)} disabled={locked} className={cls("px-3 py-2 rounded-xl", room.roundDurationSec===s?"bg-slate-900 text-white":"bg-white border", locked && "opacity-50 cursor-not-allowed")}>{s}s</button>
          ))}
        </div>

        <div className="mt-6">
          <button onClick={finishSetup} disabled={locked} className="w-full px-3 py-3 rounded-xl bg-[#17A34A] text-white font-semibold">
            Finish setup & invite players
          </button>
          <div className="text-xs mt-2 text-rose-700">
            {locked ? "Setup is finished. Items and rules are locked." : "After finishing setup, items and rules cannot be changed."}
          </div>
        </div>
      </div>
    </div>
  );
}

function EditableItem({ it, idx, onSave, onRemove, onMarkTest, disabled }:{
  it: Item; idx:number; onSave:(i:Item)=>void; onRemove:()=>void; onMarkTest:()=>void; disabled:boolean;
}) {
  const [edit, setEdit] = useState(false);
  const [local, setLocal] = useState<Item>(it);

  useEffect(()=>setLocal(it),[it.id]);

  const commit = () => {
    const v = parseMoney(String(local.price));
    if (v==null || !local.name.trim()) return alert("Name and price required.");
    onSave(clean({...local, price:v})); setEdit(false);
  };

  return (
    <li className="py-2 flex items-center gap-3">
      {it.imageUrl && <img src={it.imageUrl} className="w-14 h-14 object-cover rounded-xl" alt="" />}
      <div className="flex-1">
        {!edit ? (
          <>
            <div className="font-medium">{idx+1}. {it.name}</div>
            <div className="text-xs opacity-60">True price: {toCurrency(it.price)} {it.note?`• ${it.note}`:""}</div>
          </>
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            <input className="px-2 py-1 rounded border" value={local.name} onChange={e=>setLocal(p=>({...p,name:e.target.value}))}/>
            <input className="px-2 py-1 rounded border" value={String(local.price)} onChange={e=>setLocal(p=>({...p,price: parseMoney(e.target.value)??0}))}/>
            <input className="px-2 py-1 rounded border md:col-span-2" placeholder="Image URL" value={local.imageUrl||""} onChange={e=>setLocal(p=>({...p,imageUrl:e.target.value||undefined}))}/>
            <input className="px-2 py-1 rounded border md:col-span-2" placeholder="Note" value={local.note||""} onChange={e=>setLocal(p=>({...p,note:e.target.value||undefined}))}/>
          </div>
        )}
      </div>
      {!edit ? (
        <div className="flex gap-2">
          <button className="text-xs px-2 py-1 rounded-lg border bg-white" onClick={()=>setEdit(true)} disabled={disabled}>Edit</button>
          <button className="text-xs px-2 py-1 rounded-lg border bg-yellow-100" onClick={onMarkTest} disabled={disabled}>Set as Test</button>
          <button className="text-xs px-2 py-1 rounded-lg bg-rose-100 hover:bg-rose-200" onClick={onRemove} disabled={disabled}>Remove</button>
        </div>
      ) : (
        <div className="flex gap-2">
          <button className="text-xs px-2 py-1 rounded-lg bg-[#17A34A] text-white" onClick={commit} disabled={disabled}>Save</button>
          <button className="text-xs px-2 py-1 rounded-lg bg-slate-200" onClick={()=>{ setLocal(it); setEdit(false); }} disabled={disabled}>Cancel</button>
        </div>
      )}
    </li>
  );
}

/* ---------- Host Game ---------- */
function HostGame({ room }: { room: RoomState }) {
  const up = (patch: Partial<RoomState>) => update(ref(db, `rooms/${room.code}`), clean(patch));
  const isDemo = Boolean(room.isDemoActive);
  const currentItem = isDemo ? room.demoItem : room.items?.[room.roundIndex];
  const roundKey = isDemo ? "demo" : String(room.roundIndex);
  const roundGuesses = (room.guesses?.[roundKey] || {}) as Record<string, Guess>;

  const startDemo = async () => {
    if (!room.demoItem) return alert("Select a Test round item in Setup.");
    await up({ status: "in_round", isDemoActive: true, roundEndsAt: Date.now() + room.roundDurationSec*1000, lastWinnerIds: null });
  };
  const startRound1 = async () => {
    if (!room.items?.length) return alert("No real items.");
    await up({ status: "in_round", isDemoActive: false, roundIndex: 0, roundEndsAt: Date.now()+room.roundDurationSec*1000, lastWinnerIds: null });
  };
  const startFromLobby = async () => {
    if (room.status!=="lobby") return;
    if (room.demoItem) return startDemo();
    return startRound1();
  };

  const reveal = async () => {
    if (!currentItem) return;
    const gList = Object.values(roundGuesses).sort((a,b)=>a.ts-b.ts);
    const winners = computeWinners(gList, currentItem.price, room.rule);
    const scores = { ...(room.scores||{}) };
    if (!isDemo) {
      // Award each winner (if same amount ties), else earliest only handled in computeWinners.
      for (const w of winners) { scores[w.playerId] = (scores[w.playerId]||0)+1; }
    }
    await up({ status:"revealed", scores, lastWinnerIds: winners.map(w=>w.playerId), roundEndsAt: null });
    if (!room.themeMuted) SFX.reveal();
  };

  const next = async () => {
    if (isDemo) return startRound1();
    const nextIdx = room.roundIndex + 1;
    if (nextIdx >= (room.items?.length||0)) {
      await up({ status:"finished", roundEndsAt:null });
    } else {
      await up({ status:"in_round", roundIndex: nextIdx, roundEndsAt: Date.now()+room.roundDurationSec*1000, lastWinnerIds:null });
    }
  };

  const players = room.players||{};
  const playerIds = Object.keys(players);
  const submittedIds = new Set(Object.keys(roundGuesses));
  const notYet = playerIds.filter(id => !submittedIds.has(id));
  const submitted = playerIds.filter(id => submittedIds.has(id));

  // Combined Players + Scores (sorted by score desc)
  const scoreboard = playerIds.map(pid => ({
    id: pid,
    name: players[pid].name,
    score: room.scores?.[pid] || 0,
    hasBid: submittedIds.has(pid),
  })).sort((a,b)=> b.score - a.score || a.name.localeCompare(b.name));

  // Count summary
  const submittedCount = submitted.length;
  const notYetCount = notYet.length;

  // Revealed items list (real rounds only)
  const revealedRounds = useMemo(()=>{
    const rounds: { idx:number; item: Item; winners: Guess[] }[] = [];
    if (!room.items?.length) return rounds;
    const maxShown = room.status==="finished" ? room.items.length-1 : (room.status==="revealed" ? room.roundIndex : room.roundIndex-1);
    for (let i = 0; i <= maxShown; i++) {
      const item = room.items[i]; if (!item) continue;
      const g = Object.values(room.guesses?.[String(i)] || {}).sort((a,b)=>a.ts-b.ts);
      const winners = computeWinners(g, item.price, room.rule);
      rounds.push({ idx:i, item, winners });
    }
    return rounds;
  }, [room.items, room.guesses, room.rule, room.roundIndex, room.status]);

  const invite = async () => {
    await navigator.clipboard.writeText(`${location.origin + location.pathname}?room=${room.code}&role=player`);
    alert("Player link copied to your clipboard!");
  };

  return (
    <div className="mt-4 grid gap-4 md:grid-cols-3">
      {/* Left: Main Stage */}
      <div className="bg-white rounded-3xl p-4 shadow md:col-span-2 border-4 border-[#FFF2B3]">
        <div className="flex items-center justify-between">
          <div className="text-sm opacity-60">{isDemo ? "Practice round (not scored)" : `Round ${room.roundIndex+1} / ${room.items.length}`}</div>
          <div className="flex items-center gap-2 text-xs">
            <span className="px-2 py-1 rounded bg-[#CFF3E6] text-slate-800">Bids: {submittedCount}</span>
            <span className="px-2 py-1 rounded bg-[#FAD6E7] text-slate-800">Waiting: {notYetCount}</span>
          </div>
        </div>

        {/* Item card always visible in-round and at reveal */}
        {currentItem ? (
          <div className="mt-3 flex gap-4 items-center">
            {currentItem.imageUrl && <img src={currentItem.imageUrl} className="w-40 h-40 object-cover rounded-2xl border-4 border-[#FFC700]" alt=""/>}
            <div className="flex-1">
              <div className="text-2xl font-bold">{currentItem.name}</div>
              {room.status==="in_round" && (
                <div className="mt-1 text-sm">
                  Ends in <Countdown targetMs={room.roundEndsAt||0} muted={!!room.themeMuted}/>
                </div>
              )}
              {room.status==="revealed" && (
                <div className="mt-1 text-xl font-extrabold text-[#17A34A]">
                  Actual Retail Price: <span className="font-black">{toCurrency(currentItem.price)}</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="mt-3 text-sm opacity-70">Waiting for host…</div>
        )}

        {/* Bids list: hide amounts until reveal */}
        <div className="mt-4">
          <div className="font-semibold mb-2">Contestants’ Row</div>
          {room.status!=="revealed" ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {scoreboard.map(p=>(
                <div key={p.id} className={cls("px-3 py-2 rounded-xl text-sm border",
                  p.hasBid ? "bg-[#CFF3E6] border-emerald-300" : "bg-[#FFF2B3] border-yellow-200 text-[#E63946]"
                )}>
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs">{p.hasBid ? "Bid locked" : "Waiting…"}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {Object.values(roundGuesses).sort((a,b)=>a.ts-b.ts).map(g=>(
                <div key={g.playerId} className="px-3 py-2 rounded-xl text-sm border bg-white">
                  <div className="font-medium">{g.playerName}</div>
                  <div className="text-lg font-extrabold tracking-wider">{toCurrency(g.value)}</div>
                </div>
              ))}
              {!Object.keys(roundGuesses).length && <div className="text-sm opacity-60">No bids submitted.</div>}
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="mt-4 flex gap-2">
          {room.status==="lobby" && (
            <button className="px-4 py-2 rounded-xl bg-[#17A34A] text-white" onClick={startFromLobby}>
              {room.demoItem ? "Start Practice Round" : "Start Round 1"}
            </button>
          )}
          {room.status==="in_round" && (
            <>
              <button className="px-4 py-2 rounded-xl bg-[#2563EB] text-white" onClick={invite}>Invite players</button>
              <button className="px-4 py-2 rounded-xl bg-slate-900 text-white" onClick={reveal}>Reveal now</button>
            </>
          )}
          {room.status==="revealed" && (
            <button className="px-4 py-2 rounded-xl bg-[#2563EB] text-white" onClick={next}>
              {isDemo ? "Start Round 1" : (room.roundIndex === (room.items.length-1) ? "Show results" : "Next item")}
            </button>
          )}
          {room.status==="finished" && <div className="px-3 py-2 rounded-xl bg-[#CDE7FF]">Game Over — see Results below</div>}
        </div>
      </div>

      {/* Right: Combined Players + Scores, then Revealed Items */}
      <div className="space-y-4">
        {/* Combined list */}
        <div className="bg-white rounded-3xl p-4 shadow border-2 border-[#E6D9FF]">
          <div className="font-semibold mb-2">Players & Scores ({Object.keys(room.players||{}).length})</div>
          {!scoreboard.length ? (
            <div className="text-sm opacity-60">No players yet.</div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead><tr className="opacity-60"><th className="py-1">#</th><th>Player</th><th>Score</th><th>Status</th></tr></thead>
              <tbody>
                {scoreboard.map((p, i)=>(
                  <tr key={p.id} className="border-t">
                    <td className="py-1">{i+1}</td>
                    <td>{p.name}</td>
                    <td>{p.score}</td>
                    <td className={cls("text-xs", p.hasBid ? "text-emerald-700" : "text-[#E63946]")}>{p.hasBid ? "Bid in" : "Waiting"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Revealed Items (real rounds only, after first reveal) */}
        {!!revealedRounds.length && (
          <div className="bg-white rounded-3xl p-4 shadow border-2 border-[#FFC700]">
            <div className="font-semibold mb-2">Revealed Items</div>
            <div className="space-y-3">
              {revealedRounds.map(r=>(
                <div key={r.idx} className="flex gap-3 items-center">
                  {r.item.imageUrl && <img src={r.item.imageUrl} className="w-14 h-14 rounded-xl object-cover border" alt=""/>}
                  <div className="flex-1">
                    <div className="font-medium">Round {r.idx+1}: {r.item.name}</div>
                    <div className="text-xs opacity-70">Actual Retail Price: <b>{toCurrency(r.item.price)}</b></div>
                    <div className="text-xs mt-1">
                      {r.winners.length ? (
                        <span>Winner{r.winners.length>1?"s":""}: {r.winners.map(w=>`${w.playerName} (${toCurrency(w.value)})`).join(", ")}</span>
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

/* ---------- Scoring helpers (handles “same amount → multiple winners”) ---------- */
function computeWinners(guesses: Guess[], price: number, rule: Rule): Guess[] {
  if (!guesses.length) return [];

  let pool = guesses;
  if (rule === "closest_without_over") {
    const notOver = guesses.filter(g => g.value <= price);
    pool = notOver.length ? notOver : guesses;
  }

  // Find best distance
  let best = Infinity;
  for (const g of pool) {
    const d = Math.abs(g.value - price);
    if (d < best) best = d;
  }

  // All candidates at best distance
  const bestCandidates = pool.filter(g => Math.abs(g.value - price) === best);

  // If multiple candidates share EXACT SAME VALUE, all of them win.
  const uniqueValues = new Set(bestCandidates.map(g => g.value.toFixed(2)));
  if (uniqueValues.size === 1) return bestCandidates;

  // Otherwise, earliest submission among best distance wins
  const earliest = bestCandidates.reduce((a,b)=> a.ts <= b.ts ? a : b);
  return [earliest];
}

/* ---------- Countdown ---------- */
function Countdown({ targetMs, muted }: { targetMs:number; muted:boolean }) {
  const [now, setNow] = useState(Date.now());
  const [beeps, setBeeps] = useState<{[s:number]:boolean}>({});
  useEffect(()=>{ const t = setInterval(()=>setNow(Date.now()), 200); return ()=>clearInterval(t); },[]);
  const remain = Math.max(0, targetMs - now);
  const s = Math.ceil(remain/1000);
  useEffect(()=>{
    if (muted) return;
    if (s<=5 && s>0 && !beeps[s]) { setBeeps(p=>({...p,[s]:true})); SFX.tick(); }
  }, [s, muted]);
  return <span className={cls("font-semibold", s<=5 && "text-[#E63946] animate-pulse")}>{s}s</span>;
}

/* ---------- Host Scores (standalone tab) ---------- */
function HostScores({ room }: { room: RoomState }) {
  const players = room.players||{}; const scores = room.scores||{};
  const rows = Object.keys(players).map(pid=>({ playerId: pid, name: players[pid].name, score: scores[pid]||0 }))
    .sort((a,b)=> b.score - a.score || a.name.localeCompare(b.name));
  return (
    <div className="mt-4 bg-white rounded-3xl p-4 shadow border-2 border-[#CFF3E6]">
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

/* =========================================================
 *  Player
 * ========================================================= */
function PlayerView({ roomCode: initial, setRoomCode }: { roomCode:string; setRoomCode:(c:string)=>void; }) {
  const [playerId] = useState<string>(()=>localStorage.getItem("playerId") || uuidv4());
  const [name, setName] = useState<string>(()=>localStorage.getItem("playerName") || "");
  const [code, setCode] = useState<string>(initial || "");
  const [hasJoined, setHasJoined] = useState(false);
  const [justJoinedName, setJustJoinedName] = useState<string | null>(null);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [bid, setBid] = useState("");

  useEffect(()=>localStorage.setItem("playerId", playerId),[playerId]);
  useEffect(()=>localStorage.setItem("playerName", name),[name]);
  useEffect(()=>{ if (code) setRoomCode(code); },[code]);

  useEffect(()=>{
    if (!ensureFirebase() || !code) return;
    const roomRef = ref(db, `rooms/${code}`);
    const unsub = onValue(roomRef, snap=>setRoom(snap.val()));
    return ()=>unsub();
  },[code]);

  const join = async () => {
    if (!ensureFirebase()) return alert("Connecting to Firebase…");
    const trimmed = (code||"").toUpperCase().trim();
    if (!trimmed || name.trim().length<1) return alert("Enter your name and the room code.");
    await update(ref(db, `rooms/${trimmed}/players/${playerId}`), clean({ id:playerId, name: name.trim(), joinedAt: Date.now() }));
    setCode(trimmed);
    setHasJoined(true);
    setJustJoinedName(name.trim());
    setTimeout(()=>setJustJoinedName(null), 5000);
  };

  const isDemo = Boolean(room?.isDemoActive);
  const currentItem = isDemo ? room?.demoItem : room?.items?.[room?.roundIndex||0];
  const roundKey = isDemo ? "demo" : String(room?.roundIndex || 0);
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

  // Score & rank
  const scoreEntries = Object.entries(room?.scores||{}).map(([pid,s])=>({ id:pid, name: room?.players?.[pid]?.name || "Player", score: s||0 }));
  const ranked = scoreEntries.sort((a,b)=> b.score-a.score || a.name.localeCompare(b.name)).map((r,i)=>({...r, rank:i+1}));
  const myScore = (room?.scores||{})[playerId] || 0;
  const myRank = ranked.find(r=>r.id===playerId)?.rank || (ranked.length? ranked.length+1 : 1);

  // Top 5 visible only after first REAL round completed
  const showTop5 = room && !isDemo && ((room.status==="revealed" && room.roundIndex>=0) || (room.status==="finished" && room.items.length>0));

  // Previous rounds table (hide until after first REAL round)
  const historyRows = useMemo(()=>{
    if (!room) return [];
    if (room.items.length===0) return [];
    const show = !room.isDemoActive && (room.status==="revealed" || room.status==="finished") && room.roundIndex>=0;
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

  // Sounds on reveal/win (only after user interaction join)
  useEffect(()=>{
    if (!room || room.themeMuted) return;
    if (room.status==="revealed") {
      const iWon = room.lastWinnerIds?.includes(playerId) && !room.isDemoActive;
      if (iWon) SFX.win(); else SFX.reveal();
    }
  }, [room?.status, room?.lastWinnerIds, room?.themeMuted]);

  return (
    <div className="mt-6 max-w-xl mx-auto bg-white rounded-3xl p-5 shadow border-4 border-[#CFF3E6]">
      {!hasJoined && (
        <div>
          <div className="font-semibold mb-2">Join a room</div>
          <HowTo />
          <input className="w-full px-3 py-2 rounded-xl border mb-2" placeholder="Display name" value={name} onChange={(e)=>setName(e.target.value)}/>
          <input className="w-full px-3 py-2 rounded-xl border mb-3" placeholder="Room code" value={code} onChange={(e)=>setCode(e.target.value.toUpperCase())}/>
          <button className="w-full px-4 py-2 rounded-xl bg-[#2563EB] text-white" onClick={join}>Join</button>
          <div className="mt-3 text-xs opacity-70">Waiting for host and players…</div>
        </div>
      )}

      {hasJoined && room && (
        <div>
          {justJoinedName && (
            <div className="mb-3 p-3 rounded-xl bg-[#FFF2B3] border text-center font-semibold">
              Come on down, <span className="text-[#E63946]">{justJoinedName}</span>! You’re the next contestant on <i>The Price Is Right: Baby Edition!</i>
            </div>
          )}

          <div className="text-sm opacity-70">Room <PriceTag>{room.code}</PriceTag></div>

          {room.isDemoActive && <div className="mt-2 text-xs px-3 py-2 rounded-xl bg-[#FFF2B3] border">Practice round — not scored.</div>}

          {/* Lobby wait */}
          {room.status==="lobby" && <div className="mt-3 p-3 rounded-xl bg-white border text-sm">Waiting for host and players… Your score: <b>{myScore}</b></div>}

          {/* In round: show image and bid panel */}
          {room.status==="in_round" && (
            <div className="mt-3 p-3 rounded-2xl border bg-white">
              <div className="text-sm opacity-60">{room.isDemoActive ? "Practice round" : `Round ${room.roundIndex+1} / ${room.items.length}`}</div>
              {currentItem?.imageUrl && <img src={currentItem.imageUrl} className="w-full h-48 object-cover rounded-xl border-4 border-[#FFC700] mt-2" alt=""/>}
              <div className="text-lg font-semibold mt-2">{currentItem?.name || ""}</div>
              <div className="mt-1 text-sm">Ends in <Countdown targetMs={room.roundEndsAt||0} muted={!!room.themeMuted}/></div>

              {typeof myBid!=="number" ? (
                <div className="mt-3 flex gap-2">
                  <input className="flex-1 px-3 py-2 rounded-xl border" placeholder="$0.00" value={bid} onChange={(e)=>setBid(e.target.value)} />
                  <button className="px-4 py-2 rounded-xl bg-[#17A34A] text-white" onClick={submitBid}>Place Bid</button>
                </div>
              ) : (
                <div className="mt-3 text-sm opacity-70">Your bid: {toCurrency(myBid)} (waiting for reveal…)</div>
              )}
            </div>
          )}

          {/* Reveal */}
          {room.status==="revealed" && currentItem && (
            <div className="mt-4 p-3 rounded-2xl bg-[#CFF3E6] border">
              <div className="font-semibold mb-1">Reveal</div>
              <div className="text-sm">Actual Retail Price: <b>{toCurrency(currentItem.price)}</b></div>
              {typeof myBid === "number" ? (
                <>
                  <div className="text-sm">Your bid: {toCurrency(myBid)}</div>
                  <div className="text-sm">Off by: {Math.abs(myBid-currentItem.price).toFixed(2)}</div>
                  {!room.isDemoActive && (room.lastWinnerIds?.includes(playerId)
                    ? <div className="text-sm text-[#17A34A] font-semibold">Ohhh yea! <b>{room.players?.[playerId]?.name || "You"}</b> bid the closest! +1 point! 🎉</div>
                    : <div className="text-sm opacity-80">{(room.rule==="closest_without_over" && myBid>currentItem.price) ? <span className="text-[#E63946]">Over the price!</span> : "Better luck next time!"}</div>
                  )}
                </>
              ) : <div className="text-sm opacity-70">You didn’t place a bid this round.</div>}
              <div className="text-sm mt-1">Your score: <b>{myScore}</b></div>
            </div>
          )}

          {/* Top 5 after first REAL round */}
          {showTop5 && (
            <div className="mt-4 p-3 rounded-2xl bg-white border">
              <div className="font-semibold mb-2">Top 5</div>
              <ol className="text-sm list-decimal pl-5">
                {ranked.slice(0,5).map(r=>(
                  <li key={r.id}>{r.name} — {r.score}</li>
                ))}
              </ol>
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
            <div className="mt-4 p-3 rounded-xl bg-white border">
              <div className="font-semibold mb-2">Final Results</div>
              <PlayerResults ranked={ranked}/>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function HowTo() {
  return (
    <div className="text-xs bg-white rounded-xl border p-3 mb-3">
      <div className="font-semibold mb-1">How to play</div>
      <ul className="list-disc pl-4 space-y-1">
        <li>Enter your name and the room code, then tap <b>Join</b>.</li>
        <li>When an item appears, type your <b>bid</b> (e.g., <code>24.99</code>) and submit.</li>
        <li>The <b>closest without going over</b> wins the point.</li>
      </ul>
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
