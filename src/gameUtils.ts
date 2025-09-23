import { PRIZE_DATABASE, ALL_PRIZE_EMOJIS } from "./gameData";

/* ---------- Types ---------- */
export type Item = { id: string; name: string; price: number; imageUrl?: string; note?: string };
export type Player = { id: string; name: string; joinedAt?: number };
export type Guess = { playerId: string; playerName: string; value: number; ts: number };
export type Rule = "closest_without_over" | "closest_overall";

export type RoomState = {
  code: string;
  createdAt: number;
  hostId: string;
  status: "setup" | "lobby" | "showing_prize" | "in_round" | "revealed" | "finished";
  rule: Rule;
  roundIndex: number;                  // real rounds only
  roundEndsAt?: number | null;
  roundDurationSec: number;
  isSetupDone?: boolean;
  items: Item[];
  players: Record<string, Player>;
  guesses: Record<string, Record<string, Guess>>; // "demo" or roundIndex
  scores: Record<string, number>;      // kept for backward compatibility, but prizes are used instead
  prizes: Record<string, string[]>;   // playerId -> array of prize emojis
  prizePool: string[];                 // available prize emojis for this game
  currentPrize?: string;               // emoji of current round's prize
  lastWinnerIds?: string[] | null;     // multiple winners if same winning amount
  themeMuted?: boolean;
  topScoresCount?: number;             // number of top scores to display (default 5)
  topBidsCount?: number;               // number of top bids to display (default 5)
};


/* ---------- Utils ---------- */
export function parseMoney(s: string): number | null {
  const v = Number(String(s ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(v) ? v : null;
}

export function clean<T extends Record<string, any>>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)); // strips undefined for RTDB
}

export function cls(...a: (string | false | null | undefined)[]) {
  return a.filter(Boolean).join(" ");
}

export function toCurrency(n: number) {
  return `$${n.toFixed(2)}`;
}

export const pick = <T,>(a: T[]) => a[Math.floor(Math.random()*a.length)];

export function getDisplayCount(room: RoomState, type: 'scores' | 'bids'): number {
  if (type === 'scores') return room.topScoresCount ?? 5;
  return room.topBidsCount ?? 5;
}

export function formatNames(names: string[]) {
  if (!names.length) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
}

/* ---------- Scoring helpers (supports same-amount multi-winners) ---------- */
export function computeWinners(guesses: Guess[], price: number, rule: Rule): Guess[] {
  if (!guesses.length) return [];

  let pool = guesses;
  if (rule === "closest_without_over") {
    const notOver = guesses.filter(g => g.value <= price);
    pool = notOver.length ? notOver : guesses;
  }

  // Best distance
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

/* ---------- Built-in Sounds (no setup) ---------- */
export function playTone(freq=880, ms=150, type: OscillatorType="sine") {
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

export const SFX = {
  tick: () => playTone(900, 90, "square"),
  reveal: () => playTone(600, 180, "sine"),
  win: () => playTone(1200, 240, "triangle"),
};

/* ---------- Prize System ---------- */

export function initializePrizePool(): string[] {
  return [...ALL_PRIZE_EMOJIS]; // Copy of all available prizes
}

export function selectRandomPrize(prizePool: string[]): { prize: string; remainingPool: string[] } {
  if (prizePool.length === 0) {
    // If pool is empty, reset with all prizes
    const newPool = initializePrizePool();
    const randomIndex = Math.floor(Math.random() * newPool.length);
    const selectedPrize = newPool[randomIndex];
    return {
      prize: selectedPrize,
      remainingPool: newPool.filter(p => p !== selectedPrize)
    };
  }

  const randomIndex = Math.floor(Math.random() * prizePool.length);
  const selectedPrize = prizePool[randomIndex];
  const remainingPool = prizePool.filter(p => p !== selectedPrize);

  return { prize: selectedPrize, remainingPool };
}

export function getPrizeDescription(emoji: string): string {
  return PRIZE_DATABASE[emoji]?.description || emoji;
}

export function getPrizeName(emoji: string): string {
  return PRIZE_DATABASE[emoji]?.name || emoji;
}

export function addFiveMoreRounds(currentPool: string[]): string[] {
  // Add 5 random prizes back to the pool for extended gameplay
  const availablePrizes = ALL_PRIZE_EMOJIS.filter(prize => !currentPool.includes(prize));
  const shuffled = [...availablePrizes].sort(() => Math.random() - 0.5);
  return [...currentPool, ...shuffled.slice(0, 5)];
}