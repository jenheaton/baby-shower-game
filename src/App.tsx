import React, { useEffect, useMemo, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, update } from "firebase/database";

/**
 * 🎉 The Price Is Right — Baby Edition
 * Host creates a room, players join via link, guess prices. Realtime via Firebase.
 * This build implements: stable lobby player list, reliable add items, working scores,
 * player-friendly join flow, reveal feedback, auto-start next round, item locking,
 * player/host scoreboards, podium at end.
 */

/* --------------------- Firebase (preconfigured) --------------------- */
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
  } catch {
    return null;
  }
}

/* --------------------- Types --------------------- */
type Item = { id: string; name: string; price: number; imageUrl?: string; note?: string };
type Player = { id: string; name: string; joinedAt?: number };
type Guess = { playerId: string; playerName: string; value: number; ts: number };
type Rule = "closest_without_over" | "closest_overall";

type RoomState = {
  code: string;
  createdAt: number;
  hostId: string;
  status: "lobby" | "in_round" | "revealed" | "finished";
  rule: Rule;
  roundIndex: number;
  roundEndsAt?: number | null;
  roundDurationSec: number;
  items: Item[]; // locked after first round starts
  players: Record<string, Player>;
  guesses: Record<string, Record<string, Guess>>;
  scores: Record<string, number>;
  lastWinnerId?: string | null; // set on reveal
};

/* --------------------- Sample items --------------------- */
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

/* --------------------- Utilities --------------------- */
function parseMoney(s: string): number | null {
  const v = Number(String(s ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(v) ? v : null;
}
function clean<T extends Record<string, any>>(obj: T): T {
  // Firebase RTDB does not allow undefined values anywhere in the object.
  return JSON.parse(JSON.stringify(obj));
}

/* --------------------- App --------------------- */
export default function App() {
  const qs = new URLSearchParams(location.search);
  const paramRole = (qs.get("role") || "").toLowerCase();

  const [role, setRole] = useState<"host" | "player" | null>(
    paramRole === "player" ? "player" : null
  );
  const [roomCode, setRoomCode] = useState<string>(qs.get("room") || "");

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
          Live sync via Firebase • ~30 players • Share link/QR
        </footer>
      </div>
    </div>
  );
}

/* --------------------- Landing --------------------- */
function Landing({
  setRole,
  roomCode,
  setRoomCode,
}: {
  setRole: (r: "host" | "player") => void;
  roomCode: string;
  setRoomCode: (c: string) => void;
}) {
  const joinDisabled = !roomCode || roomCode.length < 4;
  return (
    <div className="grid gap-6 md:gap-8 md:grid-cols-2">
      <div className="bg-white/70 rounded-2xl p-5 md:p-8 shadow">
        <h2 className="text-xl font-semibold mb-2">Host a game</h2>
        <p className="text-sm opacity-80 mb-4">
          Create a room, add items + real prices, then share a player link.
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

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-3 py-1 rounded-full bg-slate-900 text-white text-xs">
      {children}
    </span>
  );
}
function TabButton({
  active,
  children,
  onClick,
  disabled,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={`${active ? "bg-slate-900 text-white" : "bg-white/70 hover:bg-white"} px-4 py-2 rounded-2xl text-sm shadow ${
        disabled ? "opacity-40 cursor-not-allowed" : ""
      }`}
    >
      {children}
    </button>
  );
}

/* --------------------- Host --------------------- */
function HostView({
  roomCode: initial,
  setRoomCode,
}: {
  roomCode: string;
  setRoomCode: (c: string) => void;
}) {
  const [room, setRoom] = useState<RoomState | null>(null);
  const [hostId] = useState<string>(
    () => localStorage.getItem("hostId") || uuidv4()
  );
  const [tab, setTab] =
    useState<"lobby" | "items" | "game" | "scores">("lobby");

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
    // Initialize top-level fields but DO NOT erase arrays/objects
    (async () => {
      const now = Date.now();
      await update(roomRef, clean({
        code,
        createdAt: now,
        hostId,
        status: "lobby",
        rule: "closest_without_over",
        roundIndex: 0,
        roundDurationSec: 35,
      }));
    })();
  }, []);

  if (!ensureFirebase())
    return (
      <div className="mt-6 p-4 bg-white/80 rounded-2xl">Connecting…</div>
    );
  if (!room) return <div className="mt-6">Loading room…</div>;

  const playerCount = Object.keys(room.players || {}).length;

  return (
    <div className="mt-6">
      <div className="bg-white/70 rounded-2xl p-4 shadow flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <div className="text-sm opacity-70">Room Code</div>
          <div className="text-3xl font-extrabold tracking-widest">
            {room.code}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap items-center text-sm">
          <Badge>
            Rule:{" "}
            {room.rule === "closest_without_over"
              ? "Closest w/o going over"
              : "Closest overall"}
          </Badge>
          <Badge>Round time: {room.roundDurationSec}s</Badge>
          <Badge>Items: {room.items?.length || 0}</Badge>
          <Badge>Players: {playerCount}</Badge>
          <Badge>Status: {room.status}</Badge>
        </div>
      </div>

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
        Player link:{" "}
        <code className="bg-slate-100 px-2 py-1 rounded">
          {location.origin + location.pathname}?room={room.code}&role=player
        </code>
      </div>
    </div>
  );
}

function HostLobby({ room }: { room: RoomState }) {
  const copy = async () => {
    await navigator.clipboard.writeText(
      location.origin +
        location.pathname +
        `?room=${room.code}&role=player`
    );
    alert("Player link copied!");
  };
  const players = useMemo(
    () =>
      Object.values(room.players || {}).sort(
        (a, b) => (a.joinedAt || 0) - (b.joinedAt || 0)
      ),
    [room.players]
  );

  return (
    <div className="mt-4 grid gap-4 md:grid-cols-2">
      <div className="bg-white/70 rounded-2xl p-4 shadow">
        <div className="font-semibold mb-2">
          Players ({players.length})
        </div>
        <ul className="divide-y">
          {players.map((p) => (
            <li
              key={p.id}
              className="py-2 flex justify-between items-center"
            >
              <span>{p.name}</span>
              <span className="text-xs opacity-60">joined</span>
            </li>
          ))}
          {!players.length && (
            <li className="py-2 text-sm opacity-60">
              Waiting for players… Share the player link!
            </li>
          )}
        </ul>
      </div>

      <div className="bg-white/70 rounded-2xl p-4 shadow">
        <div className="font-semibold mb-2">Invite</div>
        <div className="text-sm break-all">
          {location.origin + location.pathname}?room={room.code}&role=player
        </div>
        <div className="mt-2 flex gap-2">
          <button
            className="px-3 py-2 rounded-xl bg-indigo-500 text-white"
            onClick={copy}
          >
            Copy link
          </button>
          <a
            href={`${location.origin + location.pathname}?room=${room.code}&role=player`}
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
  const [draft, setDraft] = useState({
    name: "",
    price: "",
    imageUrl: "",
    note: "",
  });
  const [csv, setCsv] = useState("");

  // Lock items once any round has started or after first reveal
  const locked =
    room.roundIndex > 0 || room.status === "in_round" || room.status === "revealed" || room.status === "finished";

  const addItem = async () => {
    if (locked) return alert("Items are locked once the game starts.");
    const v = parseMoney(draft.price);
    if (!ensureFirebase() || !draft.name.trim() || v == null)
      return alert("Need item name and price (e.g., 28.99)");
    try {
      const item: Item = clean({
        id: uuidv4(),
        name: draft.name.trim(),
        price: v,
        ...(draft.imageUrl ? { imageUrl: draft.imageUrl } : {}),
        ...(draft.note ? { note: draft.note } : {}),
      });
      const items = [...(room.items || []), item];
      await update(ref(db, `rooms/${room.code}`), { items });
      setDraft({ name: "", price: "", imageUrl: "", note: "" });
    } catch (e: any) {
      alert("Could not add item: " + (e?.message || e));
    }
  };

  const removeItem = async (id: string) => {
    if (locked) return alert("Items are locked once the game starts.");
    if (!ensureFirebase()) return;
    const items = (room.items || []).filter((i) => i.id !== id);
    await update(ref(db, `rooms/${room.code}`), { items });
  };

  const importCsv = async () => {
    if (locked) return alert("Items are locked once the game starts.");
    const lines = csv.split(/\n|\r/).map((l) => l.trim()).filter(Boolean);
    const items: Item[] = [];
    for (const line of lines) {
      const [name, priceStr, imageUrl, note] = line.split(",");
      const v = parseMoney(priceStr || "");
      if (!name || v == null) continue;
      items.push(
        clean({
          id: uuidv4(),
          name,
          price: v,
          ...(imageUrl ? { imageUrl } : {}),
          ...(note ? { note } : {}),
        })
      );
    }
    await update(ref(db, `rooms/${room.code}`), {
      items: [...(room.items || []), ...items],
    });
    setCsv("");
  };

  const setRule = async (rule: Rule) =>
    await update(ref(db, `rooms/${room.code}`), { rule });
  const setRoundTime = async (sec: number) =>
    await update(ref(db, `rooms/${room.code}`), { roundDurationSec: sec });

  const loadSampleItems = async () => {
    if (locked) return alert("Items are locked once the game starts.");
    if (!ensureFirebase()) return;
    const samples: Item[] = SAMPLE_ITEMS.map((it) =>
      clean({ ...it, id: uuidv4() })
    );
    await update(ref(db, `rooms/${room.code}`), {
      items: [...(room.items || []), ...samples],
    });
  };

  const clearAll = async () => {
    if (locked) return alert("Items are locked once the game starts.");
    if (!ensureFirebase()) return;
    if (!confirm("Remove all items?")) return;
    await update(ref(db, `rooms/${room.code}`), { items: [] });
  };

  const items = room.items || [];

  return (
    <div className="mt-4 grid gap-4 md:grid-cols-3">
      <div className="bg-white/70 rounded-2xl p-4 shadow md:col-span-2">
        <div className="font-semibold mb-3">Items ({items.length})</div>
        <ul className="divide-y">
          {items.map((it, idx) => (
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
                  True price: ${it.price.toFixed(2)}{" "}
                  {it.note ? `• ${it.note}` : ""}
                </div>
              </div>
              <button
                onClick={() => removeItem(it.id)}
                className={`text-xs px-2 py-1 rounded-lg ${
                  locked
                    ? "bg-slate-200 cursor-not-allowed"
                    : "bg-rose-100 hover:bg-rose-200"
                }`}
                disabled={locked}
              >
                Remove
              </button>
            </li>
          ))}
          {!items.length && (
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
          onChange={(e) =>
            setDraft((p) => ({ ...p, name: e.target.value }))
          }
          disabled={locked}
        />
        <input
          className="w-full px-3 py-2 rounded-xl border mb-2"
          placeholder="Price (e.g., 28.99)"
          value={draft.price}
          onChange={(e) =>
            setDraft((p) => ({ ...p, price: e.target.value }))
          }
          disabled={locked}
        />
        <input
          className="w-full px-3 py-2 rounded-xl border mb-2"
          placeholder="Image URL (optional)"
          value={draft.imageUrl}
          onChange={(e) =>
            setDraft((p) => ({ ...p, imageUrl: e.target.value }))
          }
          disabled={locked}
        />
        <input
          className="w-full px-3 py-2 rounded-xl border mb-3"
          placeholder="Note (optional)"
          value={draft.note}
          onChange={(e) =>
            setDraft((p) => ({ ...p, note: e.target.value }))
          }
          disabled={locked}
        />
        <button
          onClick={addItem}
          disabled={locked}
          className={`w-full px-3 py-2 rounded-xl ${
            locked ? "bg-slate-300" : "bg-rose-500 hover:bg-rose-600"
          } text-white`}
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
          disabled={locked}
        />
        <button
          onClick={importCsv}
          disabled={locked}
          className={`w-full px-3 py-2 rounded-xl ${
            locked ? "bg-slate-300" : "bg-indigo-500 hover:bg-indigo-600"
          } text-white`}
        >
          Import CSV
        </button>

        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            onClick={loadSampleItems}
            disabled={locked}
            className={`px-3 py-2 rounded-xl ${
              locked ? "bg-slate-300" : "bg-emerald-600 hover:bg-emerald-700"
            } text-white`}
          >
            Load sample items (25)
          </button>
          <button
            onClick={clearAll}
            disabled={locked}
            className={`px-3 py-2 rounded-xl ${
              locked ? "bg-slate-300" : "bg-rose-200 hover:bg-rose-300"
            }`}
          >
            Clear all items
          </button>
        </div>

        <div className="mt-4 text-xs opacity-60">Rules</div>
        <div className="flex gap-2 mt-1">
          <button
            onClick={() => setRule("closest_without_over")}
            disabled={locked}
            className={`px-3 py-2 rounded-xl ${
              room.rule === "closest_without_over"
                ? "bg-slate-900 text-white"
                : "bg-white border"
            } ${locked ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            Closest w/o going over
          </button>
          <button
            onClick={() => setRule("closest_overall")}
            disabled={locked}
            className={`px-3 py-2 rounded-xl ${
              room.rule === "closest_overall"
                ? "bg-slate-900 text-white"
                : "bg-white border"
            } ${locked ? "opacity-50 cursor-not-allowed" : ""}`}
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
              disabled={locked}
              className={`px-3 py-2 rounded-xl ${
                room.roundDurationSec === s
                  ? "bg-slate-900 text-white"
                  : "bg-white border"
              } ${locked ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              {s}s
            </button>
          ))}
        </div>
        {locked && (
          <div className="mt-3 text-xs text-rose-700">
            Items are locked after the game starts.
          </div>
        )}
      </div>
    </div>
  );
}

function HostGame({ room }: { room: RoomState }) {
  const currentItem = room.items?.[room.roundIndex];
  const roundGuesses =
    (room.guesses?.[String(room.roundIndex)] || {}) as Record<string, Guess>;
  const playerCount = Object.keys(room.players || {}).length;
  const submittedCount = Object.keys(roundGuesses).length;

  const startRound = async () => {
    if (!ensureFirebase() || !currentItem) return;
    await update(ref(db, `rooms/${room.code}`), {
      status: "in_round",
      roundEndsAt: Date.now() + room.roundDurationSec * 1000,
      lastWinnerId: null,
    });
  };
  const reveal = async () => {
    if (!ensureFirebase() || !currentItem) return;
    const entries = Object.values(roundGuesses).sort((a, b) => a.ts - b.ts); // for tie-break: earliest wins
    let pool = entries;
    if (room.rule === "closest_without_over") {
      const notOver = entries.filter((g) => g.value <= currentItem.price);
      pool = notOver.length ? notOver : entries;
    }
    let winner: Guess | null = null;
    if (pool.length) {
      winner = pool.reduce((best, g) => {
        const d = Math.abs(g.value - currentItem.price);
        const bd = Math.abs(best.value - currentItem.price);
        return d < bd ? g : best;
      }, pool[0]);
    }
    const scores = { ...(room.scores || {}) };
    if (winner) scores[winner.playerId] = (scores[winner.playerId] || 0) + 1;
    await update(ref(db, `rooms/${room.code}`), {
      status: "revealed",
      scores,
      lastWinnerId: winner?.playerId || null,
      roundEndsAt: null,
    });
  };
  const next = async () => {
    if (!ensureFirebase()) return;
    const nextIndex = room.roundIndex + 1;
    if (nextIndex >= (room.items?.length || 0)) {
      await update(ref(db, `rooms/${room.code}`), {
        status: "finished",
        roundEndsAt: null,
      });
    } else {
      await update(ref(db, `rooms/${room.code}`), {
        status: "in_round", // auto-start next round
        roundIndex: nextIndex,
        roundEndsAt: Date.now() + room.roundDurationSec * 1000,
        lastWinnerId: null,
      });
    }
  };

  if (!currentItem)
    return (
      <div className="mt-4 p-4 bg-white/70 rounded-2xl">Add items to start.</div>
    );

  // Build always-on player/score view with top-3 markers
  const scoreEntries = Object.entries(room.scores || {}).map(([pid, s]) => ({
    id: pid,
    name: room.players?.[pid]?.name || "Player",
    score: s || 0,
  }));
  const ranked = scoreEntries
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .map((r, i) => ({ ...r, rank: i + 1 }));

  const playersWithStatus = Object.values(room.players || {})
    .map((p) => ({
      id: p.id,
      name: p.name,
      guessed: Boolean(roundGuesses[p.id]),
      score: room.scores?.[p.id] || 0,
      rank: ranked.find((r) => r.id === p.id)?.rank || "-",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const top3 = ranked.slice(0, 3);

  return (
    <div className="mt-4 grid gap-4 md:grid-cols-3">
      {/* Left: Round & guesses */}
      <div className="bg-white/70 rounded-2xl p-4 shadow md:col-span-2">
        <div className="text-sm opacity-60">
          Round {room.roundIndex + 1} / {room.items.length}
        </div>
        <div className="text-2xl font-bold mb-2">Guess the price!</div>

        <div className="flex gap-4 items-center">
          {/* Only show item name/image during the round */}
          {room.status === "in_round" && (
            <>
              {currentItem.imageUrl && (
                <img
                  src={currentItem.imageUrl}
                  className="w-40 h-40 object-cover rounded-xl"
                />
              )}
              <div className="flex-1">
                <div className="text-xl font-semibold">{currentItem.name}</div>
                {room.status === "in_round" && (
                  <div className="mt-2 text-sm">
                    Time left:{" "}
                    <Countdown targetMs={room.roundEndsAt || 0} />
                  </div>
                )}
                <div className="mt-2 text-sm opacity-70">
                  Submissions: {submittedCount} / {playerCount}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="mt-4">
          <div className="font-semibold mb-2">Guesses</div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {Object.values(roundGuesses).map((g) => (
              <div
                key={g.playerId}
                className="px-3 py-2 rounded-xl bg-slate-100 text-sm"
              >
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
            <button
              className="px-4 py-2 rounded-xl bg-emerald-600 text-white"
              onClick={startRound}
            >
              Start round
            </button>
          )}
          {room.status === "in_round" && (
            <button
              className="px-4 py-2 rounded-xl bg-slate-900 text-white"
              onClick={reveal}
            >
              Reveal now
            </button>
          )}
          {room.status === "revealed" && (
            <button
              className="px-4 py-2 rounded-xl bg-indigo-600 text-white"
              onClick={next}
            >
              Next item
            </button>
          )}
          {room.status === "finished" && (
            <ResultsBlock ranked={ranked} />
          )}
        </div>
      </div>

      {/* Right: Reveal + Players + Scores */}
      <div className="space-y-4">
        <div className="bg-white/70 rounded-2xl p-4 shadow">
          <div className="font-semibold mb-2">Reveal</div>
          {room.status !== "revealed" ? (
            <div className="text-sm opacity-70">True price hidden</div>
          ) : (
            <div>
              <div className="text-5xl font-extrabold text-rose-600">
                ${currentItem.price.toFixed(2)}
              </div>
              <div className="mt-2 text-sm">
                Winner:{" "}
                {room.lastWinnerId
                  ? room.players?.[room.lastWinnerId]?.name || "Player"
                  : "—"}
              </div>
            </div>
          )}
        </div>

        <div className="bg-white/70 rounded-2xl p-4 shadow">
          <div className="font-semibold mb-2">
            Players ({playersWithStatus.length})
          </div>
          <ul className="text-sm divide-y">
            {playersWithStatus.map((p) => (
              <li key={p.id} className="py-1 flex justify-between">
                <span>
                  {p.name}{" "}
                  {top3.find((t) => t.id === p.id) && (
                    <span className="ml-1">🏅</span>
                  )}
                </span>
                <span className="text-xs">
                  {p.guessed ? "✓ guessed" : "—"} • {p.score} pts
                </span>
              </li>
            ))}
            {!playersWithStatus.length && (
              <li className="py-1 opacity-60">No players yet.</li>
            )}
          </ul>
        </div>

        <div className="bg-white/70 rounded-2xl p-4 shadow">
          <div className="font-semibold mb-2">Scores</div>
          {!ranked.length ? (
            <div className="text-sm opacity-60">No scores yet.</div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="opacity-60">
                  <th className="py-1">#</th>
                  <th>Player</th>
                  <th>Score</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="py-1">{r.rank}</td>
                    <td>{r.name}</td>
                    <td>{r.score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function ResultsBlock({ ranked }: { ranked: { id: string; name: string; score: number; rank: number }[] }) {
  const top3 = ranked.slice(0, 3);
  return (
    <div className="bg-yellow-50 text-yellow-900 px-3 py-2 rounded-xl">
      <div className="font-semibold mb-1">Show Results</div>
      <div className="flex items-end gap-3">
        {top3[1] && (
          <div className="flex-1 text-center">
            <div className="text-lg">🥈 {top3[1].name}</div>
            <div className="bg-slate-300 h-10 rounded-t-xl mt-1" />
          </div>
        )}
        {top3[0] && (
          <div className="flex-1 text-center">
            <div className="text-xl font-bold">🥇 {top3[0].name}</div>
            <div className="bg-slate-400 h-16 rounded-t-xl mt-1" />
          </div>
        )}
        {top3[2] && (
          <div className="flex-1 text-center">
            <div className="text-lg">🥉 {top3[2].name}</div>
            <div className="bg-slate-200 h-6 rounded-t-xl mt-1" />
          </div>
        )}
      </div>
    </div>
  );
}

/* --------------------- Player --------------------- */
function PlayerView({
  roomCode: initial,
  setRoomCode,
}: {
  roomCode: string;
  setRoomCode: (c: string) => void;
}) {
  const [playerId] = useState<string>(
    () => localStorage.getItem("playerId") || uuidv4()
  );
  const [name, setName] = useState<string>(
    () => localStorage.getItem("playerName") || ""
  );
  const [code, setCode] = useState<string>(initial || "");
  const [hasJoined, setHasJoined] = useState<boolean>(false);

  const [room, setRoom] = useState<RoomState | null>(null);
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

  // Subscribe to room always (so we can compute ranks, etc.), but
  // do NOT advance UI until hasJoined === true.
  useEffect(() => {
    if (!ensureFirebase() || !code) return;
    const roomRef = ref(db, `rooms/${code}`);
    const unsub = onValue(roomRef, (snap) => setRoom(snap.val()));
    return () => unsub();
  }, [code]);

  const join = async () => {
    if (!ensureFirebase()) return alert("Connecting to Firebase…");
    const trimmed = (code || "").trim().toUpperCase();
    if (!trimmed || name.trim().length < 1)
      return alert("Enter your name and the room code.");
    await update(ref(db, `rooms/${trimmed}/players/${playerId}`), {
      id: playerId,
      name: name.trim(),
      joinedAt: Date.now(),
    });
    setCode(trimmed);
    setHasJoined(true);
  };

  const currentItem = room?.items?.[room?.roundIndex || 0];
  const roundGuesses =
    (room?.guesses?.[String(room?.roundIndex || 0)] || {}) as Record<
      string,
      Guess
    >;
  const myGuess = roundGuesses?.[playerId]?.value;
  const myScore = (room?.scores || {})[playerId] || 0;

  const ranked = useMemo(() => {
    const entries = Object.entries(room?.scores || {}).map(([pid, s]) => ({
      id: pid,
      name: room?.players?.[pid]?.name || "Player",
      score: s || 0,
    }));
    const sortd = entries
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
      .map((r, i) => ({ ...r, rank: i + 1 }));
    const mine = sortd.find((r) => r.id === playerId);
    return { sortd, myRank: mine?.rank || sortd.length + 1 };
  }, [room?.scores, room?.players, playerId]);

  const submitGuess = async () => {
    if (!ensureFirebase() || !room) return;
    if (room.status !== "in_round") return;
    if (typeof myGuess === "number") return; // already submitted
    const v = parseMoney(guess);
    if (v == null) return alert("Enter a number (e.g., 23.50)");
    const roundKey = String(room.roundIndex);
    await update(
      ref(db, `rooms/${room.code}/guesses/${roundKey}/${playerId}`),
      clean({ playerId, playerName: name.trim(), value: v, ts: Date.now() })
    );
    setGuess("");
  };

  const tooHigh =
    room?.rule === "closest_without_over" &&
    typeof myGuess === "number" &&
    currentItem &&
    myGuess > currentItem.price;

  const iWon = room?.lastWinnerId === playerId;

  return (
    <div className="mt-6 max-w-xl mx-auto bg-white/70 rounded-2xl p-5 shadow">
      {!hasJoined && (
        <div>
          <div className="font-semibold mb-2">Join a room</div>
          <GuestHowTo />
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
          <button
            className="w-full px-4 py-2 rounded-xl bg-indigo-600 text-white"
            onClick={join}
          >
            Join
          </button>
          <div className="mt-3 text-xs opacity-70">
            Ask the host for the room link.
          </div>
        </div>
      )}

      {hasJoined && room && (
        <div>
          <div className="text-sm opacity-70">Room {room.code}</div>

          {/* Waiting / Round / Reveal blocks */}
          {room.status === "in_round" && (
            <>
              <div className="mt-3 p-3 rounded-xl bg-rose-50">
                <div className="text-sm opacity-60">
                  Round {room.roundIndex + 1} / {room.items.length}
                </div>
                {/* Do NOT show next item name unless round is active */}
                <div className="text-lg font-semibold">
                  {currentItem?.name || "Waiting for host…"}
                </div>
                <div className="mt-1 text-sm">
                  Ends in{" "}
                  <Countdown targetMs={room.roundEndsAt || 0} />
                </div>
              </div>

              {/* Guess box (hide once submitted) */}
              {typeof myGuess !== "number" ? (
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
                  >
                    Submit
                  </button>
                </div>
              ) : (
                <div className="mt-3 text-sm opacity-70">
                  Your guess: ${myGuess.toFixed(2)} (waiting for reveal…)
                </div>
              )}
            </>
          )}

          {room.status === "revealed" && currentItem && (
            <div className="mt-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200">
              <div className="font-semibold mb-1">Reveal</div>
              <div className="text-sm">
                Correct price:{" "}
                <span className="font-bold">
                  ${currentItem.price.toFixed(2)}
                </span>
              </div>
              {typeof myGuess === "number" ? (
                <>
                  <div className="text-sm">Your guess: ${myGuess.toFixed(2)}</div>
                  <div className="text-sm">
                    Off by: {Math.abs(myGuess - currentItem.price).toFixed(2)}
                  </div>
                  {tooHigh && (
                    <div className="text-sm text-rose-700">Too high!</div>
                  )}
                  {iWon ? (
                    <div className="text-sm text-emerald-700 font-semibold">
                      You won this round! 🎉
                    </div>
                  ) : (
                    <div className="text-sm opacity-80">
                      Better luck next time!
                    </div>
                  )}
                </>
              ) : (
                <div className="text-sm opacity-70">
                  You didn’t submit a guess this round.
                </div>
              )}
              <div className="text-sm mt-1">
                Your score: <span className="font-bold">{myScore}</span> • Rank:{" "}
                <span className="font-bold">{ranked.myRank}</span>
              </div>
            </div>
          )}

          {(room.status === "lobby" || room.status === "finished") && (
            <div className="mt-4 p-3 rounded-xl bg-white border">
              <div className="font-semibold">Waiting for the host…</div>
              <div className="text-sm mt-1">
                Your score: <b>{myScore}</b> • Rank: <b>{ranked.myRank}</b>
              </div>
              {!!ranked.sortd.length && (
                <div className="mt-2">
                  <div className="text-xs opacity-70 mb-1">Top 3</div>
                  <ol className="text-sm list-decimal pl-5">
                    {ranked.sortd.slice(0, 3).map((r) => (
                      <li key={r.id}>
                        {r.name} — {r.score}
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function GuestHowTo() {
  return (
    <div className="text-xs bg-white rounded-xl border p-3 mb-3">
      <div className="font-semibold mb-1">How to play</div>
      <ul className="list-disc pl-4 space-y-1">
        <li>Enter the room code and your display name, then tap <b>Join</b>.</li>
        <li>When a round starts, type the price (e.g., <code>24.99</code>) and tap <b>Submit</b>. You can submit once per round.</li>
        <li>Scoring: <b>1 point</b> to the single round winner.
          <ul className="list-disc pl-4 mt-1">
            <li><b>Closest without going over</b> (default). If everyone goes over, we switch to <i>closest overall</i>.</li>
            <li>Tie-breaker: earliest submitted guess wins.</li>
          </ul>
        </li>
        <li>After each round, you’ll see the <b>correct price</b>, your <b>guess</b>, how far off you were, whether you <b>won</b>, and your <b>score</b>.</li>
      </ul>
    </div>
  );
}

/* --------------------- Shared UI --------------------- */
function Countdown({ targetMs }: { targetMs: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, []);
  const remain = Math.max(0, targetMs - now);
  const s = Math.ceil(remain / 1000);
  return (
    <span className={`${s <= 5 ? "text-rose-600 animate-pulse" : ""} font-semibold`}>
      {s}s
    </span>
  );
}

function HostScores({ room }: { room: RoomState }) {
  const players = room.players || {};
  const scores = room.scores || {};
  const rows = Object.keys(players)
    .map((pid) => ({
      playerId: pid,
      name: players[pid].name,
      score: scores[pid] || 0,
    }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
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
