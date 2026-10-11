// Seeds demo drivers + trips. Idempotent. Usage: node scripts/seed.mjs
import pg from "pg";
import "dotenv/config";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const hav = (a, b) => {
  const R = 6371, r = Math.PI / 180;
  const dLat = (b[0] - a[0]) * r, dLng = (b[1] - a[1]) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

function pointAlong(wps, frac) {
  const segs = [];
  let total = 0;
  for (let i = 1; i < wps.length; i++) { const d = hav(wps[i - 1], wps[i]); segs.push(d); total += d; }
  let target = frac * total;
  for (let i = 0; i < segs.length; i++) {
    if (target <= segs[i] || i === segs.length - 1) {
      const t = segs[i] ? Math.min(1, target / segs[i]) : 0;
      const wiggle = Math.sin(frac * 400) * 0.01;
      return [wps[i][0] + (wps[i + 1][0] - wps[i][0]) * t + wiggle, wps[i][1] + (wps[i + 1][1] - wps[i][1]) * t - wiggle];
    }
    target -= segs[i];
  }
  return wps[wps.length - 1];
}

function makeProfile(duration, cruise, rng = Math.random) {
  const speeds = [];
  let v = 0, target = 50;
  for (let t = 0; t < duration; t++) {
    const p = t / duration;
    if (p > 0.97) target = 0;
    else if (t < 25) { v += 5.5 + rng() * 2.5; speeds.push(Math.round(v * 10) / 10); continue; } // launch
    else if (t % 120 === 0 || t === 25) {
      const r = rng();
      target = p < 0.08 ? 40 + r * 80 : p < 0.15 ? 120 + r * 60 : r < 0.12 ? 120 + r * 300 : cruise * (0.85 + r * 0.2);
    }
    if (v < target) v += Math.max(0.6, 8 * (1 - v / (cruise * 1.25))) * (0.6 + rng() * 0.6);
    else v -= Math.min(14, (v - target) * 0.08 + 0.5);
    v = Math.max(0, v + (rng() - 0.5) * 2);
    speeds.push(Math.round(v * 10) / 10);
  }
  speeds[0] = 0;
  return speeds;
}

function accel(speeds, target) {
  let best = null, start = null;
  for (let i = 0; i < speeds.length; i++) {
    if (speeds[i] <= 3) { start = i; continue; }
    if (start !== null && speeds[i] >= target) {
      const prev = speeds[i - 1];
      const t = i - 1 - start + (target - prev) / (speeds[i] - prev || 1);
      if (best === null || t < best) best = t;
      start = null;
    }
  }
  return best === null ? null : Math.round(best * 100) / 100;
}

async function insertTrip(userId, wps, duration, cruise, maxG, daysAgo) {
  const speeds = makeProfile(duration, cruise);
  const distance = speeds.reduce((a, v) => a + v / 3600, 0);
  let acc = 0;
  const samples = [];
  for (let i = 0; i < speeds.length; i++) {
    acc += speeds[i] / 3600;
    if (i % 5 === 0 || i === speeds.length - 1) {
      const [lat, lng] = pointAlong(wps, acc / distance);
      samples.push({ t: i * 1000, lat, lng, speed: speeds[i], g: Math.round(Math.random() * maxG * 100) / 100 });
    }
  }
  const moving = speeds.filter((v) => v > 2);
  const start = new Date(Date.now() - daysAgo * 86400000 - duration * 1000);
  await pool.query(
    `insert into trips (user_id, started_at, ended_at, duration_sec, distance_km, top_speed_kmh, avg_speed_kmh, max_gforce,
      zero_to_hundred_sec, zero_to_sixty_sec, speed_array, samples, is_simulated)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,0)`,
    [userId, start, new Date(start.getTime() + duration * 1000), duration, distance, Math.max(...speeds),
      moving.reduce((a, b) => a + b, 0) / moving.length, maxG, accel(speeds, 100), accel(speeds, 96.56),
      JSON.stringify(speeds), JSON.stringify(samples)]
  );
}

const exists = await pool.query(`select 1 from users where username = 'autobahn_king' limit 1`);
if (exists.rowCount) {
  console.log("seed: already seeded");
  await pool.end();
  process.exit(0);
}

const drivers = [
  ["autobahn_king", "Germany", "BMW M4 Competition", [[48.8566, 2.3522], [50.2, 3.1], [50.85, 4.35], [50.94, 6.96], [51.51, 7.46], [52.28, 8.05], [53.08, 8.8], [53.55, 9.99]], 11340, 345, 1.21],
  ["nordschleife_nina", "Germany", "Porsche 911 GT3 RS", [[50.33, 6.94], [50.36, 6.98], [50.38, 6.93], [50.35, 6.9]], 1500, 210, 1.48],
  ["m5_marco", "Italy", "Lamborghini Huracán", [[45.46, 9.19], [45.07, 7.68]], 5400, 205, 1.12],
  ["dubai_drifter", "UAE", "Nissan GT-R Nismo", [[25.2, 55.27], [24.45, 54.38]], 3900, 225, 1.33],
  ["texas_torque", "United States", "Dodge Challenger Hellcat", [[29.76, -95.36], [30.27, -97.74]], 7200, 160, 0.98],
  ["london_launch", "United Kingdom", "Audi RS6", [[51.5, -0.12], [52.2, 0.12]], 3600, 140, 1.05],
  ["paris_pace", "France", "Alpine A110", [[48.85, 2.35], [49.44, 1.09]], 4200, 150, 1.17],
  ["polish_piston", "Poland", "Mercedes-AMG C63", [[52.23, 21.01], [51.76, 19.46]], 4800, 190, 1.02],
  ["tokyo_touge", "Japan", "Toyota GR Supra", [[35.68, 139.69], [35.36, 138.73]], 5400, 120, 1.29],
  ["dutch_dash", "Netherlands", "Tesla Model S Plaid", [[52.37, 4.9], [51.92, 4.48]], 2700, 135, 0.94],
  ["bavarian_bolt", "Germany", "Audi R8 V10", [[48.14, 11.58], [49.45, 11.08]], 3600, 245, 1.08],
  ["mumbai_missile", "India", "Mahindra Thar", [[19.07, 72.88], [18.52, 73.86]], 6000, 95, 0.81],
];

for (const [username, country, car, wps, dur, cruise, g] of drivers) {
  const { rows } = await pool.query(`insert into users (username, country, car) values ($1,$2,$3) returning id`, [username, country, car]);
  await insertTrip(rows[0].id, wps, dur, cruise, g, Math.floor(Math.random() * 10));
}
console.log(`seed: inserted ${drivers.length} drivers`);
await pool.end();
