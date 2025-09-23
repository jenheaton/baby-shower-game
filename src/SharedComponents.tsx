import React, { useEffect, useState } from "react";
import { ref, update } from "firebase/database";
import { cls, SFX } from "./gameUtils";
import { ensureFirebase } from "./firebase";
import type { RoomState } from "./gameUtils";

const db = ensureFirebase();

/* ---------- Themed bits ---------- */
export function MarqueeTitle({ withLogo = false }: { withLogo?: boolean }) {
  return (
    <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-200 max-w-4xl mx-auto">
      <div className="flex items-center gap-6">
        {withLogo && (
          <img src="/logo-baby-edition.png" alt="Baby Shower Game Logo" className="h-40 w-auto flex-shrink-0" />
        )}
        <div className="text-center flex-1">
          <h1 className="font-fredoka text-3xl md:text-6xl tracking-wide text-blue-900 mb-2">
            THE PRICE IS RIGHT
          </h1>
          <div className="text-xl md:text-3xl text-pink-600 font-semibold mb-3">
            — BABY EDITION —
          </div>
          <div className="text-sm md:text-lg text-gray-700 tracking-wide">
            CLOSEST WITHOUT GOING OVER WINS!
          </div>
        </div>
        {withLogo && (
          <img src="/logo-baby-edition.png" alt="Baby Shower Game Logo" className="h-40 w-auto flex-shrink-0" />
        )}
      </div>
    </div>
  );
}

export function PriceTag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block px-4 py-2 bg-yellow-400 text-gray-800 font-bold rounded-lg border-2 border-yellow-500 shadow-md">
      {children}
    </span>
  );
}

export function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-3 py-1 text-xs text-blue-800 bg-blue-100 border border-blue-200 rounded-full">
      {children}
    </span>
  );
}

export function TabButton({ active, children, onClick, disabled }: { active:boolean; children:React.ReactNode; onClick:()=>void; disabled?:boolean }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className={cls(
        "px-4 py-2 text-sm font-medium rounded-lg border transition-colors duration-200",
        active
          ? "bg-blue-600 text-white border-blue-600"
          : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50",
        disabled && "opacity-50 cursor-not-allowed hover:bg-white"
      )}>
      {children}
    </button>
  );
}

export function GameButton({
  children,
  onClick,
  disabled = false,
  variant = 'primary',
  size = 'medium'
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'success' | 'warning';
  size?: 'small' | 'medium' | 'large';
}) {
  const variants = {
    primary: "bg-blue-600 hover:bg-blue-700 text-white border-blue-600",
    secondary: "bg-gray-600 hover:bg-gray-700 text-white border-gray-600",
    success: "bg-green-600 hover:bg-green-700 text-white border-green-600",
    warning: "bg-yellow-500 hover:bg-yellow-600 text-white border-yellow-500"
  };

  const sizes = {
    small: 'px-3 py-1 text-sm',
    medium: 'px-4 py-2 text-base',
    large: 'px-6 py-3 text-lg'
  };

  return (
    <button onClick={onClick} disabled={disabled}
      className={cls(
        "font-medium rounded-lg border transition-colors duration-200 shadow-sm",
        variants[variant],
        sizes[size],
        disabled && "opacity-50 cursor-not-allowed hover:bg-gray-600"
      )}>
      {children}
    </button>
  );
}

/* ---------- Countdown ---------- */
export function Countdown({ targetMs, muted }: { targetMs:number; muted:boolean }) {
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

export function MuteToggle({ room }: { room: RoomState }) {
  const toggle = async () => {
    await update(ref(db, `rooms/${room.code}`), { themeMuted: !room.themeMuted });
  };
  return (
    <button onClick={toggle}
            className={cls(
              "px-3 py-1 rounded-lg text-xs font-medium border transition-colors",
              room.themeMuted
                ? "bg-red-100 text-red-800 border-red-200"
                : "bg-green-100 text-green-800 border-green-200"
            )}>
      {room.themeMuted ? "Sound: Off" : "Sound: On"}
    </button>
  );
}

/* ---------- Confetti & Retro Effects (no deps, honors reduced motion) ---------- */
export function ConfettiCSS() {
  return (
    <style>{`
      @keyframes fall { to { transform: translateY(110vh) rotate(720deg); opacity: 0.9; } }
      @keyframes shimmer { 0%,100%{opacity:.8} 50%{opacity:1} }

      .animate-shimmer { animation: shimmer 1.5s ease-in-out infinite; }

      @media (prefers-reduced-motion: reduce) {
        .confetti-piece { animation: none !important; }
        .animate-shimmer { animation: none !important; }
      }
    `}</style>
  );
}

export function ConfettiOverlay() {
  const pieces = 120;
  const colors = ["#FFD700","#FFC0CB","#87CEEB","#90EE90","#DDA0DD","#F0E68C","#98FB98","#FFB6C1"];
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {Array.from({length: pieces}).map((_, i)=> {
        const left = Math.random()*100;
        const delay = Math.random()*0.6;
        const duration = 2 + Math.random()*2.5;
        const size = 6 + Math.random()*8;
        const color = colors[i % colors.length];
        const style: React.CSSProperties = {
          position: "absolute",
          top: "-10vh",
          left: `${left}%`,
          width: size, height: size*0.6,
          background: color,
          opacity: 0.85,
          transform: `translateY(-10vh) rotate(${Math.random()*360}deg)`,
          animation: `fall ${duration}s ${delay}s linear infinite`,
          borderRadius: 2,
        };
        return <span key={i} className="confetti-piece" style={style} />;
      })}
    </div>
  );
}