"use client";

import { toUnit, unitLabel, type Unit } from "@/lib/metrics";

type Props = { speedKmh: number; maxKmh: number; unit: Unit; active: boolean; sportsMode?: boolean };

const SIZE = 420;
const CENTER = SIZE / 2;
const R = 184;
const SWEEP = 0.75;
const CIRCUMFERENCE = 2 * Math.PI * R;
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const stableCoord = (value: number) => Number(value.toFixed(3));

function pointAt(radius: number, fraction: number) {
  const angle = ((135 + clamp01(fraction) * 270) * Math.PI) / 180;
  return {
    x: stableCoord(CENTER + radius * Math.cos(angle)),
    y: stableCoord(CENTER + radius * Math.sin(angle)),
  };
}

export default function SpeedDial({ speedKmh, maxKmh, unit, active, sportsMode = true }: Props) {
  const value = toUnit(speedKmh, unit);
  const peak = toUnit(maxKmh, unit);
  const base = unit === "mph" ? 200 : 300;
  const scale = Math.max(base, Math.ceil(Math.max(value, peak) / 50) * 50);
  const fraction = clamp01(value / scale);
  const peakFraction = clamp01(peak / scale);
  const arcLength = CIRCUMFERENCE * SWEEP;
  const markerRadius = R - 2;
  const speedMarker = pointAt(markerRadius, fraction);
  const ticks = Array.from({ length: 61 }, (_, index) => index);
  const accent = sportsMode ? "#ff3b32" : "#19e6e6";
  const endpointAccent = sportsMode ? "#ff7147" : "#7ef3ff";

  return (
    <div className="speed-dial">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="speed-dial-svg"
        role="img"
        aria-label={`${Math.round(value)} ${unitLabel(unit)}, maximum scale ${scale}`}
      >
        <defs>
          <radialGradient id="dialFace">
            <stop offset="0%" stopColor="#111316" />
            <stop offset="72%" stopColor="#0b0c0e" />
            <stop offset="100%" stopColor="#17181a" />
          </radialGradient>
          <linearGradient id="dialTrack" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor={accent} />
            <stop offset="55%" stopColor={accent} />
            <stop offset="100%" stopColor={endpointAccent} />
          </linearGradient>
          <filter id="dialGlow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <circle cx={CENTER} cy={CENTER} r="202" fill="url(#dialFace)" stroke="#292b2e" strokeWidth="2" />
        <circle cx={CENTER} cy={CENTER} r="196" fill="none" stroke="#55585b" strokeOpacity=".52" strokeWidth="1" />
        <circle cx={CENTER} cy={CENTER} r="190" fill="none" stroke="#ff4a35" strokeOpacity=".13" strokeWidth="1" />
        <circle cx={CENTER} cy={CENTER} r="174" fill="none" stroke="#282a2d" strokeWidth="12" strokeDasharray={`${arcLength} ${CIRCUMFERENCE}`} transform={`rotate(135 ${CENTER} ${CENTER})`} />
        {fraction > 0 && (
          <circle
            cx={CENTER}
            cy={CENTER}
            r="174"
            fill="none"
            stroke="url(#dialTrack)"
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={`${arcLength * fraction} ${CIRCUMFERENCE}`}
            transform={`rotate(135 ${CENTER} ${CENTER})`}
            filter="url(#dialGlow)"
            className="speed-dial-progress"
          />
        )}
        <circle cx={CENTER} cy={CENTER} r="151" fill="none" stroke="#35373a" strokeWidth="1.2" />
        <circle cx={CENTER} cy={CENTER} r="126" fill="none" stroke="#ff4935" strokeOpacity=".52" strokeWidth="1" />
        <circle cx={CENTER} cy={CENTER} r="119" fill="none" stroke="#ffffff" strokeOpacity=".05" strokeWidth="1" />

        {ticks.map((index) => {
          const tickFraction = index / 60;
          const major = index % 6 === 0;
          const medium = index % 3 === 0;
          const innerRadius = major ? 147 : medium ? 153 : 159;
          const outerRadius = 168;
          const inner = pointAt(innerRadius, tickFraction);
          const outer = pointAt(outerRadius, tickFraction);
          const passed = tickFraction <= fraction;
          const tickColor = passed ? (sportsMode ? "#ff6951" : "#32e8dc") : major ? "#d9dadd" : "#73767a";

          return (
            <g key={index}>
              {passed && major && (
                <line
                  x1={inner.x}
                  y1={inner.y}
                  x2={outer.x}
                  y2={outer.y}
                  stroke={tickColor}
                  strokeWidth="5"
                  opacity=".28"
                  filter="url(#dialGlow)"
                />
              )}
              <line
                x1={inner.x}
                y1={inner.y}
                x2={outer.x}
                y2={outer.y}
                stroke={tickColor}
                strokeWidth={major ? 2.6 : medium ? 1.5 : 0.8}
                strokeOpacity={passed || major ? 0.95 : medium ? 0.65 : 0.42}
              />
              {major && (
                <text
                  x={pointAt(132, tickFraction).x}
                  y={pointAt(132, tickFraction).y + 5}
                  textAnchor="middle"
                  className={`speed-dial-label${passed ? " speed-dial-label-active" : ""}`}
                >
                  {Math.round(tickFraction * scale)}
                </text>
              )}
            </g>
          );
        })}

        {peakFraction > 0 && (() => {
          const marker = pointAt(markerRadius, peakFraction);
          return <circle cx={marker.x} cy={marker.y} r="4" fill="#ffd15a" stroke="#fff1b1" strokeWidth="1" filter="url(#dialGlow)" />;
        })()}

        <circle
          cx={speedMarker.x}
          cy={speedMarker.y}
          r="8"
          fill={accent}
          opacity=".35"
          filter="url(#dialGlow)"
          className="speed-dial-marker-glow"
        />
        <circle
          cx={speedMarker.x}
          cy={speedMarker.y}
          r="4.5"
          fill={endpointAccent}
          stroke="#fff1e8"
          strokeWidth="1.2"
          filter="url(#dialGlow)"
          className="speed-dial-marker"
        />
      </svg>

      <div className="speed-dial-readout" aria-hidden="true">
        <span className="speed-dial-unit">{unitLabel(unit)}</span>
        <span className={`speed-dial-value${active ? " speed-dial-value-active" : ""}`}>{Math.round(value)}</span>
        <span className={`speed-dial-status${sportsMode ? " speed-dial-status-sports" : ""}`}>{active ? "LIVE" : "TRIPRANK"}</span>
      </div>
    </div>
  );
}
