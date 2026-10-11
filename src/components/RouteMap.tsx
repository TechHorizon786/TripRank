/* eslint-disable @next/next/no-img-element */
import { colorForSpeed } from "@/lib/metrics";

type Pt = { lat: number; lng: number; speed: number };

const VIEW = 600;
const TILE = 256;

function project(lat: number, lng: number, z: number) {
  const scale = TILE * 2 ** z;
  const s = Math.sin((Math.max(-85, Math.min(85, lat)) * Math.PI) / 180);
  return {
    x: ((lng + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * scale,
  };
}

export default function RouteMap({ points, buckets }: { points: Pt[]; buckets: number[] }) {
  if (points.length < 2) {
    return (
      <div className="flex aspect-square items-center justify-center rounded-2xl bg-panel text-sm text-muted">
        No GPS path recorded
      </div>
    );
  }
  const stride = Math.max(1, Math.ceil(points.length / 1500));
  const pts = points.filter((_, i) => i % stride === 0 || i === points.length - 1);

  const lats = pts.map((p) => p.lat);
  const lngs = pts.map((p) => p.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);

  // pick the highest zoom where the route fits into ~78% of the viewport
  let z = 17;
  for (; z > 2; z--) {
    const a = project(maxLat, minLng, z);
    const b = project(minLat, maxLng, z);
    if (b.x - a.x <= VIEW * 0.78 && b.y - a.y <= VIEW * 0.78) break;
  }
  const c = project((minLat + maxLat) / 2, (minLng + maxLng) / 2, z);
  // center from the projected bbox (lat midpoint isn't linear in mercator)
  const tl = project(maxLat, minLng, z);
  const br = project(minLat, maxLng, z);
  const cx = (tl.x + br.x) / 2 || c.x;
  const cy = (tl.y + br.y) / 2 || c.y;
  const ox = cx - VIEW / 2;
  const oy = cy - VIEW / 2;

  const tiles: { x: number; y: number; left: number; top: number }[] = [];
  const n = 2 ** z;
  for (let tx = Math.floor(ox / TILE); tx <= Math.floor((ox + VIEW) / TILE); tx++) {
    for (let ty = Math.floor(oy / TILE); ty <= Math.floor((oy + VIEW) / TILE); ty++) {
      if (ty < 0 || ty >= n) continue;
      tiles.push({ x: ((tx % n) + n) % n, y: ty, left: tx * TILE - ox, top: ty * TILE - oy });
    }
  }

  const xy = pts.map((p) => {
    const q = project(p.lat, p.lng, z);
    return { x: q.x - ox, y: q.y - oy, color: colorForSpeed(p.speed, buckets) };
  });

  // group consecutive points with the same color into polylines
  const segs: { color: string; d: string }[] = [];
  let cur: { color: string; pts: string[] } | null = null;
  for (let i = 0; i < xy.length; i++) {
    const p = xy[i];
    const coord = `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    if (!cur || cur.color !== p.color) {
      if (cur) {
        cur.pts.push(coord);
        segs.push({ color: cur.color, d: cur.pts.join(" ") });
      }
      cur = { color: p.color, pts: [coord] };
    } else cur.pts.push(coord);
  }
  if (cur) segs.push({ color: cur.color, d: cur.pts.join(" ") });

  const start = xy[0];
  const end = xy[xy.length - 1];
  const pct = (v: number) => `${(v / VIEW) * 100}%`;

  return (
    <div className="relative aspect-square overflow-hidden rounded-2xl bg-[#0e0f12]">
      {tiles.map((t) => (
        <img
          key={`${t.x}-${t.y}-${t.left}`}
          src={`https://tile.openstreetmap.de/${z}/${t.x}/${t.y}.png`}
          alt=""
          className="absolute select-none"
          style={{
            left: pct(t.left),
            top: pct(t.top),
            width: pct(TILE),
            height: pct(TILE),
            filter: "invert(1) hue-rotate(180deg) brightness(0.78) contrast(0.9) saturate(0.6)",
          }}
          draggable={false}
          loading="lazy"
        />
      ))}
      <svg viewBox={`0 0 ${VIEW} ${VIEW}`} className="absolute inset-0 h-full w-full">
        {segs.map((s, i) => (
          <polyline key={i} points={s.d} fill="none" stroke={s.color} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" style={{ filter: `drop-shadow(0 0 4px ${s.color}88)` }} />
        ))}
        <circle cx={start.x} cy={start.y} r="9" fill="#22e36b" stroke="#fff" strokeWidth="3" />
        <text x={start.x + 15} y={start.y + 7} fill="#fff" fontSize="20" fontWeight="700" stroke="#000" strokeWidth="3" paintOrder="stroke">Start</text>
        <circle cx={end.x} cy={end.y} r="9" fill="#ff3b4f" stroke="#fff" strokeWidth="3" />
        <text x={end.x + 15} y={end.y + 7} fill="#fff" fontSize="20" fontWeight="700" stroke="#000" strokeWidth="3" paintOrder="stroke">End</text>
      </svg>
      <a
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noreferrer"
        className="absolute right-2 bottom-1 rounded bg-black/50 px-1.5 py-0.5 text-[9px] text-white/60"
      >
        © OpenStreetMap contributors
      </a>
    </div>
  );
}
