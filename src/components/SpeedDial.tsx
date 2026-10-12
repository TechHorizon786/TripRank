"use client";

import { toUnit, unitLabel, type Unit } from "@/lib/metrics";

type Props = { speedKmh: number; maxKmh: number; unit: Unit; active: boolean; sportsMode?: boolean };

const SIZE = 300;
const R = 128;
const C = 2 * Math.PI * R;
const SWEEP = 0.75; // 270°
const stableCoord = (value: number) => Number(value.toFixed(3));

export default function SpeedDial({ speedKmh, maxKmh, unit, active, sportsMode = true }: Props) {
  const v = toUnit(speedKmh, unit);
  const top = toUnit(maxKmh, unit);
  const base = unit === "mph" ? 200 : 300;
  const scale = Math.max(base, Math.ceil(Math.max(v, top) / 50) * 50);
  const frac = Math.min(1, v / scale);
  const topFrac = Math.min(1, top / scale);
  const arc = C * SWEEP;
  const ticks = Array.from({ length: 11 }, (_, i) => i);

  return (
    <div className="relative mx-auto" style={{ width: SIZE, height: SIZE }}>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="absolute inset-0">
        <defs>
          <linearGradient id="dialGrad" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor={sportsMode ? "#ff3b4f" : "#39ff88"} />
            <stop offset="60%" stopColor={sportsMode ? "#ff7043" : "#19e6e6"} />
            <stop offset="100%" stopColor={sportsMode ? "#ffb36b" : "#7ef3ff"} />
          </linearGradient>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <g transform={`rotate(135 ${SIZE / 2} ${SIZE / 2})`}>
          <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="#1b1e24" strokeWidth="16" strokeLinecap="round" strokeDasharray={`${arc} ${C}`} />
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            fill="none"
            stroke="url(#dialGrad)"
            strokeWidth="16"
            strokeLinecap="round"
            strokeDasharray={`${Math.max(0.001, arc * frac)} ${C}`}
            filter="url(#glow)"
            style={{ transition: "stroke-dasharray 0.6s cubic-bezier(.2,.8,.2,1)" }}
          />
          {topFrac > 0 && (
            <circle
              cx={stableCoord(SIZE / 2 + R * Math.cos(topFrac * SWEEP * 2 * Math.PI))}
              cy={stableCoord(SIZE / 2 + R * Math.sin(topFrac * SWEEP * 2 * Math.PI))}
              r="5"
              fill="#ffc21a"
            />
          )}
        </g>
        {ticks.map((i) => {
          const ang = ((135 + (i / 10) * 270) * Math.PI) / 180;
          const r1 = R - 22;
          const r2 = R - (i % 5 === 0 ? 34 : 28);
          const cx = SIZE / 2;
          const x1 = stableCoord(cx + r1 * Math.cos(ang));
          const y1 = stableCoord(cx + r1 * Math.sin(ang));
          const x2 = stableCoord(cx + r2 * Math.cos(ang));
          const y2 = stableCoord(cx + r2 * Math.sin(ang));
          return (
            <g key={i}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={i / 10 <= frac ? (sportsMode ? "#ff7043" : "#19e6e6") : "#3a3f48"} strokeWidth="2" />
              {i % 2 === 0 && (
                <text x={stableCoord(cx + (R - 50) * Math.cos(ang))} y={stableCoord(cx + (R - 50) * Math.sin(ang) + 4)} textAnchor="middle" fontSize="11" fill="#6b717c" className="tabular">
                  {Math.round((i / 10) * scale)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className={`text-[84px] leading-none font-extrabold tabular tracking-tight ${active ? "text-white text-glow" : "text-white/80"}`}>
          {Math.round(v)}
        </div>
        <div className={`mt-1 text-sm font-semibold tracking-[0.3em] uppercase ${sportsMode ? "text-danger" : "text-neon"}`}>{unitLabel(unit)}</div>
      </div>
    </div>
  );
}
