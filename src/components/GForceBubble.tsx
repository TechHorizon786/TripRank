"use client";

import { useEffect, useRef, useState } from "react";
import type { GVector } from "@/lib/client/useTripTracker";

const SIZE = 150;
const R = 64;
const MAX_G = 1.5;

export default function GForceBubble({ g, maxG, compact = false }: { g: GVector; maxG: number; compact?: boolean }) {
  const clamp = (v: number) => Math.max(-MAX_G, Math.min(MAX_G, v));
  // lateral → x, longitudinal (accel pushes you back) → y
  const px = SIZE / 2 + (clamp(g.x) / MAX_G) * R;
  const py = SIZE / 2 + (clamp(g.y) / MAX_G) * R;
  const [trail, setTrail] = useState<{ x: number; y: number }[]>([]);
  const last = useRef(0);

  useEffect(() => {
    const now = performance.now();
    if (now - last.current < 120) return;
    last.current = now;
    setTrail((t) => [...t.slice(-14), { x: px, y: py }]);
  }, [px, py]);

  const hot = g.total > 0.6;

  return (
    <div className={compact ? "gforce-bubble-compact" : "flex flex-col items-center"}>
      <svg
        width={compact ? "100%" : SIZE}
        height={compact ? "100%" : SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
      >
        <defs>
          <radialGradient id="bubbleBg">
            <stop offset="0%" stopColor="#0f2a2a" />
            <stop offset="100%" stopColor="#0a0c0f" />
          </radialGradient>
          <radialGradient id="dot">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="45%" stopColor={hot ? "#ff9f1a" : "#39ff88"} />
            <stop offset="100%" stopColor={hot ? "#ff3b4f00" : "#19e6e600"} />
          </radialGradient>
          <filter id="gforceGlow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <circle cx={SIZE / 2} cy={SIZE / 2} r={R + 6} fill="url(#bubbleBg)" stroke="#1f242b" />
        {[0.5, 1, 1.5].map((r) => (
          <circle key={r} cx={SIZE / 2} cy={SIZE / 2} r={(r / MAX_G) * R} fill="none" stroke={r === 1 ? "#19e6e655" : "#ffffff14"} strokeDasharray={r === 1 ? "0" : "3 4"} />
        ))}
        <line x1={SIZE / 2 - R} y1={SIZE / 2} x2={SIZE / 2 + R} y2={SIZE / 2} stroke="#ffffff10" />
        <line x1={SIZE / 2} y1={SIZE / 2 - R} x2={SIZE / 2} y2={SIZE / 2 + R} stroke="#ffffff10" />
        {trail.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={2 + i * 0.25} fill="#19e6e6" opacity={(i + 1) / trail.length / 3} />
        ))}
        <circle cx={px} cy={py} r="16" fill="url(#dot)" filter="url(#gforceGlow)" style={{ transition: "cx 80ms linear, cy 80ms linear" }} />
        <circle cx={px} cy={py} r="4" fill={hot ? "#ff9f1a" : "#39ff88"} stroke="#eafff1" strokeWidth="1.5" style={{ transition: "cx 80ms linear, cy 80ms linear" }} />
        {!compact && (
          <>
            <text x={SIZE / 2} y={14} textAnchor="middle" fontSize="8" fill="#6b717c">BRAKE</text>
            <text x={SIZE / 2} y={SIZE - 6} textAnchor="middle" fontSize="8" fill="#6b717c">ACCEL</text>
          </>
        )}
      </svg>
      {!compact && (
        <div className="mt-1 text-center">
          <div className="text-2xl font-bold tabular">
            {g.total.toFixed(2)}
            <span className="ml-0.5 text-sm text-neon">G</span>
          </div>
          <div className="text-[10px] tracking-widest text-muted uppercase">
            Peak {maxG.toFixed(2)}G · X {g.x.toFixed(2)} · Y {g.y.toFixed(2)} · Z {g.z.toFixed(2)}
          </div>
        </div>
      )}
    </div>
  );
}
