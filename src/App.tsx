import React, { useEffect, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, update } from "firebase/database";

/**
 * 🎉 Baby Shower Game (Price Is Right – Baby Edition)
 * Host spins up a room, players join via link/QR, guess prices, auto scoring + leaderboard.
 * Preconfigured with your Firebase project.
 */

/********************
 * FIREBASE CONFIG (Jen)
 ********************/
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
  try {
    app = initializeApp(FIREBASE_CONFIG);
    db = getDatabase(app);
    return db;
  } catch (e) {
    return null;
  }
}

/********************
 * TYPES
 ********************/
type Item = { id: string; name: string; imageUrl?: string; price: number; note?: string };
type Player = { id: string; name: string; joinedAt?: number };
type Guess = { playerId: string; playerName: string; value: number };
type Rule = "closest_without_over" | "closest_overall";

type RoomState = {
  code: string;
  createdAt: number;
  hostId: string;
  status: "lobby" | "in_round" | "revealed" | "finished";
  rule: Rule;
  roundIndex: number;
  roundEndsAt?: number;
  roundDurationSec: number;
  items: Item[];
  players: Record<string, Player>;
  guesses: Record<string, Record<string, Guess>>;
  scores: Record<string, number>;
};

/********************
 * SAMPLE ITEMS (25)
 ********************/
const SAMPLE_ITEMS: Omit<Item, "id">[] = [
  { name: "Pampers Swaddlers Diapers (Size 1, 84 ct)", price: 28.99 },
  { name: "Huggies Little Snugglers (Size 2, 80 ct)", price: 29.49 },
  { name: "WaterWipes Baby Wipes (540 ct)", price: 22.99 },
  { name: "Aquaphor Baby Healing Ointment (7 oz)", price: 13.49 },
  { name: "Boudreaux's Butt Paste (4 oz)", price: 7.99 },
  { name: "Dr. Brown's Options+ Bottle (3-pack)", price: 17.99 },
  { name: "Philips Avent Soothie Pacifiers (2-pack)", price: 4.99 },
  { name: "Muslin Swaddle Blankets (3-pack)", price: 19.99 },
  { name: "Baby Monitor (Audio Only)", price: 24.99 },
  { name: "Hooded Baby Towels (2-pack)", price: 18.99 },
  { name: "Bibs (5-pack)", price: 12.99 },
  { name: "Burp Cloths (5-pack)", price: 14.99 },
  { name: "Onesies Short Sleeve (5-pack, 0-3m)", price: 16.99 },
  { name: "Footed Sleepers (2-pack)", price: 18.49 },
  { name: "Nursing Pillow", price: 29.99 },
  { name: "Bottle Brush", price: 5.49 },
  { name: "Infant Nail Clippers", price: 4.49 },
  { name: "Digital Thermometer (Baby)", price: 8.99 },
  { name: "Baby Shampoo & Wash (16 oz)", price: 7.49 },
  { name: "Baby Lotion (16 oz)", price: 6.99 },
  { name: "Teethers (2-pack)", price: 6.99 },
  { name: "Silicone Bib (2-pack)", price: 10.99 },
  { name: "Sippy Cups (2-pack)", price: 9.99 },
  { name: "Diaper Pail Refill (3-pack)", price: 18.99 },
  { name: "Changing Pad Liners (3-pack)", price: 12.49 },
];

/********************
 * APP
 ********************/
export default function App() {
  const [role, setRole] = useState<"host" | "player" | null>(null);
  const [roomCode, setRoomCode] = useState<string>(
    new URLSearchParams(location.search).get("room") || ""
  );

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-pink-50 to-rose-100 text-slate-800 p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        <header className="flex items-center justify-between mb-6">
          <h1 className="text-2xl md:text-4xl font-extrabold">
            🎀 The Price Is Right: <span className="text-rose-600">Baby Edition</span>
          </h1>
        </header>

        {!role && (
          <Landing
            setRole={setRole}
            roomCode={roomCode}
            setRoomCode={setRoomCode}
          />
        )}
        {role === "host" && (
          <HostView roomCode={roomCode} setRoomCode={setRoomCode} />
        )}
        {role === "player" && (
          <PlayerView roomCode={roomCode} setRoomCode={setRoomCode} />
        )}

        <footer className="mt-10 text-center text-xs opacity-60">
          Live sync via Firebase • ~30 players • Share link
        </footer>
      </div>
    </div>
  );
}

function Landing({ setRole, roomCode, setRoomCode }: any) {
  const joinDisabled = !roomCode || roomCode.length < 4;
  return (
    <div className="grid gap-6 md:gap-8 md:grid-cols-2">
      <div className="bg-white/70 rounded-2xl p-5 md:p-8 shadow">
        <h2 className="text-xl font-semibold mb-2">Host a game</h2>
        <p className="text-sm opacity-80 mb-4">
          Create a room, add items + real prices, then share a link.
        </p>
        <button
          className="px-4 py-2 rounded-2xl shadow bg-rose-500 text-white hover:bg-rose-600"
          onClick={() => setRole("host")}
        >
          Start as Host
        </button>
      </div>
      <div className="bg-white/70 rounded-2xl p-5 md:p-8 shadow">
        <h2 className="text-xl font-semibold mb-2">Join a game</h2>
        <p className="text-sm opacity-80 mb-4">
          Enter the 4–6 digit room code from the host.
        </p>
        <div className="flex items-center gap-2">
          <input
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
            placeholder="ROOM"
            className="flex-1 px-3 py-2 rounded-xl border bg-white"
          />
          <button
            className="px-4 py-2 rounded-2xl shadow bg-indigo-500 text-white hover:bg-indigo-600 disabled:opacity-40"
            disabled={joinDisabled}
            onClick={() => setRole("player")}
          >
            Join
          </button>
        </div>
      </div>
    </div>
  );
}

function RoomHeader({ room }: { room: RoomState }) {
  return (
    <div className="bg-white/70 rounded-2xl p-4 shadow flex flex-col md:flex-row md:items-center md:justify-between gap-3">
      <div>
        <div className="text-sm opacity-70">Room Code</div>
        <div className="text-3xl font-extrabold tracking-widest">{room.code}</div>
      </div>
      <div className="flex gap-2 flex-wrap items-center text-sm">
        <Badge>
          Rule: {room.rule === "closest_without_over" ? "Closest w/o going over" : "Closest overall"}
        </Badge>
        <Badge>Round time: {room.roundDurationSec}s</Badge>
        <Badge>Items: {room.items?.length || 0}</Badge>
        <Badge>Players: {Object.keys(room.players || {}).length}</Badge>
        <Badge>Status: {room.status}</Badge>
      </div>
    </div>
  );
}
function Badge({ children }: any) {
  return (
    <span className="px-3 py-1 rounded-full bg-slate-900 text-white text-xs">{children}</span>
  );
}
function TabButton({ active, children, onClick, disabled }: any) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={`${active ? "bg-slate-900 text-white" : "bg-white/70 hover:bg-white"} px-4 py-2 rounded-2xl text-sm shadow ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
    >
      {children}
    </button>
  );
}

/********************
 * HOST VIEW
 ********************/
function HostView({
  roomCode: initial,
  setRoomCode,
}: {
  roomCode: string;
  setRoomCode: (c: string) => void;
}) {
  const [room, setRoom] = useState<RoomState | null>(null);
  const [hostId] = useState<string>(() => localStorage.getItem("hostId") || uuidv4());
  const [tab, setTab] = useState<"lobby" | "items" | "game" | "scores">("lobby");

  useEffect(() => localStorage.setItem("hostId", hostId), [hostId]);

  useEffect(() => {
    if (!ensureFirebase()) return;
    const code =
      initial && initial.length >= 4
        ? initial
        : Math.random().toString().slice(2, 8).toUpperCase();
    setRoomCode(code);
    const roomRef = ref(db, `rooms/${code}`);
    onValue(roomRef, (snap) => setRoom(snap.val()));
    (async () => {
      const now = Date.now();
      const base: RoomState = {
        code,
        createdAt: now,
        hostId,
        status: "lobby",
        rule: "closest_without_over",
        roundIndex: 0,
        roundDurationSec: 35,
        items: [],
        players: {},
        guesses: {},
        scores: {},
      };
      await update(roomRef, base);
    })();
  }, []);

  if (!ensureFirebase())
    return (
      <div className="mt-6 p-4 bg-white/80 rounded-2xl">
        Connecting to Firebase… (If this never loads, deploy to Netlify and try the live URL.)
      </div>
    );
  if (!room) return <div className="mt-6">Loading room…</div>;

  return (
    <div className="mt-6">
      <RoomHeader room={room} />

      <div className="mt-4 flex gap-2 flex-wrap">
        <TabButton active={tab === "lobby"} onClick={() => setTab("lobby")}>
          Lobby
        </TabButton>
        <TabButton active={tab === "items"} onClick={() => setTab("items")}>
          Items
        </TabButton>
        <TabButton
          active={tab === "game"}
          onClick={() => setTab("game")}
          disabled={!room.items?.length}
        >
          Game
        </TabButton>
        <TabButton
          active={tab === "scores"}
          onClick={() => setTab("scores")}
          disabled={!Object.keys(room.scores || {}).length}
        >
          Scores
        </TabButton>
      </div>

      {tab === "lobby" && <HostLobby room={room} />}
      {tab === "items" && <HostItems room={room} />}
      {tab === "game" && <HostGame room={room} />}
      {tab === "scores" && <HostScores room={room} />}

      <div className="mt-8 p-4 bg-white/70 rounded-2xl text-xs">
        Share link:{" "}
        <code className="bg-slate-100 px-2 py-1 rounded">
          {location.origin + location.pathname}?room={room.code}
        </code>
      </div>
    </div>
  );
}

function HostLobby({ room }: { room: RoomState }) {
  const copy = async () => {
    await navigator.clipboard.writeText(
      location.origin + location.pathname + `?room=${room.code}`
    );
    alert("Invite link copied!");
  };
  return (
    <div className="mt-4 grid gap-4 md:grid-cols-2">
      <div className="bg-white/70 rounded-2xl p-4 shadow">
        <div className="font-semibold mb-2">Players</div>
        <ul className="divide-y">
          {Object.values(room.players || {}).map((p) => (
            <li key={p.id} className="py-2 flex justify-between items-center">
              <span>{p.name}</span>
              <span className="text-xs opacity-60">joined</span>
            </li>
          ))}
          {!Object.keys(room.players || {}).length && (
            <li className="py-2 text-sm opacity-60">
              Waiting for players… Share the invite!
            </li>
          )}
        </ul>
      </div>
      <div className="bg-white/70 rounded-2xl p-4 shadow">
        <div className="font-semibold mb-2">Invite</div>
        <div className="text-sm break-all">
          {location.origin + location.pathname}?room={room.code}
        </div>
        <div className="mt-2 flex gap-2">
          <button
            className="px-3 py-2 rounded-xl bg-indigo-500 text-white"
            onClick={copy}
          >
            Copy link
          </button>
          <a
            href={`${location.origin + location.pathname}?room=${room.code}`}
            target="_blank"
            rel="noreferrer"
            className="px-3 py-2 rounded-xl bg-slate-900 text-white text-xs"
          >
            Open link
          </a>
        </div>
        <div className="mt-4 text-xs opacity-70">
          Players can open the link on their phones to join instantly.
        </div>
      </div>
    </div>
  );
}

function HostItems({ room }: { room: RoomState }) {
  const [draft, setDraft] = useState({ name: "", price: "", imageUrl: "", note: "" });
  const [csv, setCsv] = useState("");

  const addItem = async () => {
    const v = Number(String(draft.price).replace(/[^0-9.\-]/g, ""));
    if (!ensureFirebase() || !draft.name || !Number.isFinite(v))
      return alert("Need item name and price");
    const item: Item = {
      id: uuidv4(),
      name: draft.name,
      price: v,
      imageUrl: draft.imageUrl || undefined,
      note: draft.note || undefined,
    };
    await update(ref(db, `rooms/${room.code}`), { items: [...(room.items || []), item] });
    setDraft({ name: "", price: "", imageUrl: "", note: "" });
  };

  const removeItem = async (id: string) => {
    if (!ensureFirebase()) return;
    const items = (room.items || []).filter((i) => i.id !== id);
    await update(ref(db, `rooms/${room.code}`), { items });
  };

  const importCsv = async () => {
    const lines = csv.split(/\n|\r/).map((l) => l.trim()).filter(Boolean);
    const items: Item[] = [];
    for (const line of lines) {
      const [name, priceStr, imageUrl, note] = line.split(",");
      const v = Number(String(priceStr || "").replace(/[^0-9.\-]/g, ""));
      if (!name || !Number.isFinite(v)) continue;
      items.push({ id: uuidv4(), name, price: v, imageUrl, note });
    }
    await update(ref(db, `rooms/${room.code}`), {
      items: [...(room.items || []), ...items],
    });
    setCsv("");
  };

  const setRule = async (rule: Rule) => {
    await update(ref(db, `rooms/${room.code}`), { rule });
  };
  const setRoundTime = async (sec: number) => {
    await update(ref(db, `rooms/${room.code}`), { roundDurationSec: sec });
  };

  const loadSampleItems = async () => {
    if (!ensureFirebase()) return;
    const samples: Item[] = SAMPLE_ITEMS.map((it) => ({ ...it, id: uuidv4() }));
    await update(ref(db, `rooms/${room.code}`), {
      items: [...(room.items || []), ...samples],
    });
  };

  const clearAll = async () => {
    if (!ensureFirebase()) return;
    if (!confirm("Remove all items?")) return;
    await update(ref(db, `rooms/${room.code}`), { items: [] });
  };

  return (
    <div className="mt-4 grid gap-4 md:grid-cols-3">
      <div className="bg-white/70 rounded-2xl p-4 shadow md:col-span-2">
        <div className="font-semibold mb-3">
          Items ({room.items?.length || 0})
        </div>
        <ul className="divide-y">
          {(room.items || []).map((it, idx) => (
            <li key={it.id} className="py-2 flex items-center gap-3">
              {it.imageUrl && (
                <img
                  src={it.imageUrl}
                  alt=""
                  className="w-14 h-14 object-cover rounded-xl"
                />
              )}
              <div className="flex-1">
                <div className="font-medium">
                  {idx + 1}. {it.name}
                </div>
                <div className="text-xs opacity-60">
                  True price: ${it.price.toFixed(2)} {it.note ? `• ${it.note}` : ""}
                </div>
              </div>
              <button
                onClick={() => removeItem(it.id)}
                className="text-xs px-2 py-1 rounded-lg bg-rose-100 hover:bg-rose-200"
              >
                Remove
              </button>
            </li>
          ))}
          {!room.items?.length && (
            <li className="py-2 text-sm opacity-70">No items yet.</li>
          )}
        </ul>
      </div>

      <div className="bg-white/70 rounded-2xl p-4 shadow">
        <div className="font-semibold mb-2">Add item</div>
        <input
          className="w-full px-3 py-2 rounded-xl border mb-2"
          placeholder="Name (e.g., Pampers Swaddlers 84ct)"
          value={draft.name}
          onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))}
        />
        <input
          className="w-full px-3 py-2 rounded-xl border mb-2"
          placeholder="Price (e.g., 28.99)"
          value={draft.price}
          onChange={(e) => setDraft((p) => ({ ...p, price: e.target.value }))}
        />
        <input
          className="w-full px-3 py-2 rounded-xl border mb-2"
          placeholder="Image URL (optional)"
          value={draft.imageUrl}
          onChange={(e) => setDraft((p) => ({ ...p, imageUrl: e.target.value }))}
        />
        <input
          className="w-full px-3 py-2 rounded-xl border mb-3"
          placeholder="Note (optional)"
          value={draft.note}
          onChange={(e) => setDraft((p) => ({ ...p, note: e.target.value }))}
        />
        <button
          onClick={addItem}
          className="w-full px-3 py-2 rounded-xl bg-rose-500 text-white"
        >
          Add
        </button>

        <div className="mt-4 text-xs opacity-70">
          CSV quick add (name,price,imageUrl?,note?)
        </div>
        <textarea
          className="w-full h-24 px-3 py-2 rounded-xl border mb-2"
          placeholder="Pacifiers,7.99,https://...\nHuggies Diapers,28.49"
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
        />
        <button
          onClick={importCsv}
          className="w-full px-3 py-2 rounded-xl bg-indigo-500 text-white"
        >
          Import CSV
        </button>

        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            onClick={loadSampleItems}
            className="px-3 py-2 rounded-xl bg-emerald-600 text-white"
          >
            Load sample items (25)
          </button>
          <button
            onClick={clearAll}
            className="px-3 py-2 rounded-xl bg-rose-200"
          >
            Clear all items
          </button>
        </div>

        <div className="mt-4 text-xs opacity-60">Rules</div>
        <div className="flex gap-2 mt-1">
          <button
            onClick={() => setRule("closest_without_over")}
            className={`px-3 py-2 rounded-xl ${
              room.rule === "closest_without_over"
                ? "bg-slate-900 text-white"
                : "bg-white border"
            }`}
          >
            Closest w/o going over
          </button>
          <button
            onClick={() => setRule("closest_overall")}
            className={`px-3 py-2 rounded-xl ${
              room.rule === "closest_overall"
                ? "bg-slate-900 text-white"
                : "bg-white border"
            }`}
          >
            Closest overall
          </button>
        </div>

        <div className="mt-3 text-xs opacity-60">Round duration</div>
        <div className="flex gap-2 mt-1">
          {[20, 30, 35, 45, 60].map((s) => (
            <button
              key={s}
              onClick={() => setRoundTime(s)}
              className={`px-3 py-2 rounded-xl ${
                room.roundDurationSec === s
                  ? "bg-slate-900 text-white"
                  : "bg-white border"
              }`}
            >
              {s}s
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function HostGame({ room }: { room: RoomState }) {
  const currentItem = room.items?.[room.roundIndex];
  const roundGuesses = (room.guesses?.[String(room.roundIndex)] || {}) as Record<
    string,
    Guess
  >;
  const playerCount = Object.keys(room.players || {}).length;
  const submittedCount = Object.keys(roundGuesses).length;

  const startRound = async () => {
    if (!ensureFirebase() || !currentItem) return;
    await update(ref(db, `rooms/${room.code}`), {
      status: "in_round",
      roundEndsAt: Date.now() + room.roundDurationSec * 1000,
    });
  };
  const reveal = async () => {
    if (!ensureFirebase() || !currentItem) return;
    const entries = Object.values(roundGuesses);
    let winner: Guess | null = null;
    if (entries.length) {
      if (room.rule === "closest_without_over") {
        const notOver = entries.filter((g) => g.value <= currentItem.price);
        const pool = notOver.length ? notOver : entries;
        winner = pool.reduce((best, g) => {
          const d = Math.abs(g.value - currentItem.price);
          const bd = Math.abs(best.value - currentItem.price);
          return d < bd ? g : best;
        }, pool[0]);
      } else {
        winner = entries.reduce((best, g) => {
          const d = Math.abs(g.value - currentItem.price);
          const bd = Math.abs(best.value - currentItem.price);
          return d < bd ? g : best;
        }, entries[0]);
      }
    }
    const scores = { ...(room.scores || {}) };
    if (winner) {
      scores[winner.playerId] = (scores[winner.playerId] || 0) + 1;
    }
    await update(ref(db, `rooms/${room.code}`), {
      status: "revealed",
      scores,
    });
  };
  const next = async () => {
    if (!ensureFirebase()) return;
    const nextIndex = room.roundIndex + 1;
    if (nextIndex >= (room.items?.length || 0)) {
      await update(ref(db, `rooms/${room.code}`), { status: "finished" });
    } else {
      await update(ref(db, `rooms/${room.code}`), {
        status: "lobby",
        roundIndex: nextIndex,
        roundEndsAt: null,
      });
    }
  };

  if (!currentItem)
    return <div className="mt-4 p-4 bg-white/70 rounded-2xl">Add items to start.</div>;

  return (
    <div className="mt-4 grid gap-4 md:grid-cols-3">
      <div className="bg-white/70 rounded-2xl p-4 shadow md:col-span-2">
        <div className="text-sm opacity-60">
          Round {room.roundIndex + 1} / {room.items.length}
        </div>
        <div className="text-2xl font-bold mb-2">Guess the price!</div>
        <div className="flex gap-4 items-center">
          {currentItem.imageUrl && (
            <img src={currentItem.imageUrl} className="w-40 h-40 object-cover rounded-xl" />
          )}
          <div className="flex-1">
            <div className="text-xl font-semibold">{currentItem.name}</div>
            {room.status === "in_round" && (
              <div className="mt-2 text-sm">
                Time left: <Countdown targetMs={room.roundEndsAt || 0} />
              </div>
            )}
            <div className="mt-2 text-sm opacity-70">
              Submissions: {submittedCount} / {playerCount}
            </div>
          </div>
        </div>

        <div className="mt-4">
          <div className="font-semibold mb-2">Guesses</div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {Object.values(roundGuesses).map((g) => (
              <div key={g.playerId} className="px-3 py-2 rounded-xl bg-slate-100 text-sm">
                <div className="font-medium">{g.playerName}</div>
                <div>${g.value.toFixed(2)}</div>
              </div>
            ))}
            {!Object.keys(roundGuesses).length && (
              <div className="text-sm opacity-60">Waiting for guesses…</div>
            )}
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          {room.status === "lobby" && (
            <button className="px-4 py-2 rounded-xl bg-emerald-600 text-white" onClick={startRound}>
              Start round
            </button>
          )}
          {room.status === "in_round" && (
            <button className="px-4 py-2 rounded-xl bg-slate-900 text-white" onClick={reveal}>
              Reveal now
            </button>
          )}
          {room.status === "revealed" && (
            <button className="px-4 py-2 rounded-xl bg-indigo-600 text-white" onClick={next}>
              Next item
            </button>
          )}
          {room.status === "finished" && (
            <div className="px-3 py-2 rounded-xl bg-yellow-100">
              Game finished • See Scores tab
            </div>
          )}
        </div>
      </div>

      <div className="bg-white/70 rounded-2xl p-4 shadow">
        <div className="font-semibold mb-2">Reveal</div>
        {room.status !== "revealed" ? (
          <div className="text-sm opacity-70">True price hidden</div>
        ) : (
          <div>
            <div className="text-5xl font-extrabold text-rose-600">
              ${currentItem.price.toFixed(2)}
            </div>
            <WinnerCard room={room} />
          </div>
        )}
      </div>
    </div>
  );
}

function Countdown({ targetMs }: { targetMs: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, []);
  const remain = Math.max(0, targetMs - now);
  const s = Math.ceil(remain / 1000);
  return <span className={`${s <= 5 ? "text-rose-600 animate-pulse" : ""} font-semibold`}>{s}s</span>;
}

function WinnerCard({ room }: { room: RoomState }) {
  const item = room.items[room.roundIndex];
  const guesses = Object.values(room.guesses?.[String(room.roundIndex)] || {}) as Guess[];
  if (!guesses.length) return <div className="text-sm opacity-60">No guesses submitted.</div>;
  let pool = guesses;
  if (room.rule === "closest_without_over") {
    const notOver = guesses.filter((g) => g.value <= item.price);
    pool = notOver.length ? notOver : guesses;
  }
  const winner = pool.reduce((best, g) => {
    const d = Math.abs(g.value - item.price);
    const bd = Math.abs(best.value - item.price);
    return d < bd ? g : best;
  }, pool[0]);
  return (
    <div className="mt-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200">
      <div className="text-sm">Winner</div>
      <div className="text-xl font-bold">{winner.playerName}</div>
      <div className="text-sm opacity-70">
        with ${winner.value.toFixed(2)} (diff {(Math.abs(winner.value - item.price)).toFixed(2)})
      </div>
    </div>
  );
}

function HostScores({ room }: { room: RoomState }) {
  const players = room.players || {};
  const scores = room.scores || {};
  const rows = Object.keys(players)
    .map((pid) => ({ playerId: pid, name: players[pid].name, score: scores[pid] || 0 }))
    .sort((a, b) => b.score - a.score);

  return (
    <div className="mt-4 bg-white/70 rounded-2xl p-4 shadow">
      <div className="text-xl font-semibold mb-3">Leaderboard</div>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="opacity-60">
            <th className="py-2">#</th>
            <th>Player</th>
            <th>Score</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => (
            <tr key={r.playerId} className="border-t">
              <td className="py-2">{idx + 1}</td>
              <td>{r.name}</td>
              <td>{r.score}</td>
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={3} className="py-2 opacity-60">
                No players yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/********************
 * PLAYER VIEW
 ********************/
function PlayerView({
  roomCode: initial,
  setRoomCode,
}: {
  roomCode: string;
  setRoomCode: (c: string) => void;
}) {
  const [playerId] = useState<string>(() => localStorage.getItem("playerId") || uuidv4());
  const [name, setName] = useState<string>(() => localStorage.getItem("playerName") || "");
  const [room, setRoom] = useState<RoomState | null>(null);
  const [code, setCode] = useState<string>(initial || "");
  const [guess, setGuess] = useState<string>("");

  useEffect(() => {
    localStorage.setItem("playerId", playerId);
  }, [playerId]);
  useEffect(() => {
    localStorage.setItem("playerName", name);
  }, [name]);
  useEffect(() => {
    if (code) setRoomCode(code);
  }, [code]);

  useEffect(() => {
    if (!ensureFirebase() || !code || name.trim().length < 1) return;
    const roomRef = ref(db, `rooms/${code}`);
    const unsub = onValue(roomRef, (snap) => setRoom(snap.val()));
    return () => unsub();
  }, [code, name]);

  const join = async () => {
    if (!ensureFirebase()) return alert("Connecting to Firebase…");
    if (!code || name.trim().length < 1) return;
    await update(ref(db, `rooms/${code}/players/${playerId}`), {
      id: playerId,
      name,
      joinedAt: Date.now(),
    });
  };

  const submitGuess = async () => {
    if (!ensureFirebase() || !room) return;
    const v = Number(String(guess).replace(/[^0-9.\-]/g, ""));
    if (!Number.isFinite(v)) return alert("Enter a number");
    const roundKey = String(room.roundIndex);
    await update(ref(db, `rooms/${room.code}/guesses/${roundKey}/${playerId}`), {
      playerId,
      playerName: name,
      value: v,
    });
    setGuess("");
  };

  const currentItem = room?.items?.[room?.roundIndex || 0];
  const roundGuesses = room?.guesses?.[String(room?.roundIndex || 0)] || {};
  const myGuess = (roundGuesses as any)?.[playerId]?.value;

  return (
    <div className="mt-6 max-w-xl mx-auto bg-white/70 rounded-2xl p-5 shadow">
      {!room && (
        <div>
          <div className="font-semibold mb-2">Join a room</div>
          <input
            className="w-full px-3 py-2 rounded-xl border mb-2"
            placeholder="Display name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="w-full px-3 py-2 rounded-xl border mb-3"
            placeholder="Room code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
          <button className="w-full px-4 py-2 rounded-xl bg-indigo-600 text-white" onClick={join}>
            Join
          </button>
          <div className="mt-3 text-xs opacity-70">
            Ask the host for the room code or open their invite link.
          </div>
        </div>
      )}

      {room && (
        <div>
          <div className="text-sm opacity-70">Room {room.code}</div>
          <div className="text-xl font-bold">Hi {name}! Submit your guess below.</div>
          <div className="mt-3 p-3 rounded-xl bg-rose-50">
            <div className="text-sm opacity-60">
              Round {room.roundIndex + 1} / {room.items.length}
            </div>
            <div className="text-lg font-semibold">
              {currentItem?.name || "Waiting for host…"}
            </div>
            {room.status === "in_round" && (
              <div className="mt-1 text-sm">
                Ends in <Countdown targetMs={room.roundEndsAt || 0} />
              </div>
            )}
          </div>
          {room.status === "in_round" && (
            <div className="mt-3 flex gap-2">
              <input
                className="flex-1 px-3 py-2 rounded-xl border"
                placeholder="$0.00"
                value={guess}
                onChange={(e) => setGuess(e.target.value)}
              />
              <button
                className="px-4 py-2 rounded-xl bg-emerald-600 text-white"
                onClick={submitGuess}
                disabled={typeof myGuess === "number"}
              >
                {typeof myGuess === "number" ? `Submitted: $${myGuess.toFixed(2)}` : "Submit"}
              </button>
            </div>
          )}
          {room.status !== "in_round" && (
            <div className="mt-3 text-sm opacity-60">Waiting for next round…</div>
          )}
        </div>
      )}
    </div>
  );
}
