import { toUnit, unitLabel, type Unit } from "@/lib/metrics";

const W = 600;
const H = 260;
const PAD = { l: 8, r: 70, t: 10, b: 22 };

function downsample(arr: number[], max: number): number[] {
  if (arr.length <= max) return arr;
  const out: number[] = [];
  const bucket = arr.length / max;
  for (let i = 0; i < max; i++) {
    const s = Math.floor(i * bucket);
    const e = Math.max(s + 1, Math.floor((i + 1) * bucket));
    // alternate max/min to preserve the "spiky" look of real data
    const slice = arr.slice(s, e);
    out.push(i % 2 === 0 ? Math.max(...slice) : Math.min(...slice));
  }
  return out;
}

export default function SpeedChart({ speeds, unit, durationLabel }: { speeds: number[]; unit: Unit; durationLabel: string }) {
  const data = downsample(speeds.map((s) => toUnit(s, unit)), 400);
  const top = Math.max(10, ...data);
  const step = top > 250 ? 50 : top > 120 ? 20 : top > 50 ? 10 : 5;
  const yMax = Math.ceil(top / step) * step;
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const x = (i: number) => PAD.l + (data.length <= 1 ? 0 : (i / (data.length - 1)) * iw);
  const y = (v: number) => PAD.t + ih - (v / yMax) * ih;
  const line = data.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(data.length - 1).toFixed(1)},${PAD.t + ih} L${PAD.l},${PAD.t + ih} Z`;
  const gridVals = Array.from({ length: yMax / step + 1 }, (_, i) => i * step);
  const labelEvery = Math.ceil(gridVals.length / 10);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      <defs>
        <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#19e6e6" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#19e6e6" stopOpacity="0.04" />
        </linearGradient>
      </defs>
      {gridVals.map((v, i) => (
        <g key={v}>
          <line x1={PAD.l} x2={PAD.l + iw} y1={y(v)} y2={y(v)} stroke="#ffffff" strokeOpacity={0.05} />
          {i % labelEvery === 0 && (
            <text x={W - PAD.r + 8} y={y(v) + 4} fontSize="13" fill="#8b919c" className="tabular">
              {v} {unitLabel(unit)}
            </text>
          )}
        </g>
      ))}
      <path d={area} fill="url(#areaFill)" />
      <path d={line} fill="none" stroke="#19e6e6" strokeWidth="2" strokeLinejoin="round" />
      <text x={PAD.l} y={H - 4} fontSize="12" fill="#6b717c">0:00</text>
      <text x={PAD.l + iw} y={H - 4} fontSize="12" fill="#6b717c" textAnchor="end">{durationLabel}</text>
    </svg>
  );
}
