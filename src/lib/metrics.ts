export type Unit = "kmh" | "mph";

export const KMH_PER_MPH = 1.609344;
export const G = 9.80665;

export function toUnit(kmh: number, unit: Unit): number {
  return unit === "mph" ? kmh / KMH_PER_MPH : kmh;
}

export function unitLabel(unit: Unit): string {
  return unit === "mph" ? "mph" : "km/h";
}

export function formatSpeed(kmh: number, unit: Unit, digits = 0): string {
  return `${toUnit(kmh, unit).toFixed(digits)} ${unitLabel(unit)}`;
}

export function formatDistance(km: number, unit: Unit): string {
  const v = unit === "mph" ? km / KMH_PER_MPH : km;
  return `${v.toFixed(1)} ${unit === "mph" ? "mi" : "km"}`;
}

/** HH:MM for long trips, MM:SS for short ones. */
export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (h > 0) return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

export function formatDiff(sec: number): string {
  const s = Math.abs(Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}min`;
  if (m > 0) return `${m}min ${s % 60}s`;
  return `${s}s`;
}

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** Great-circle distance in km. */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Finds the quickest run from (near) standstill to `targetKmh` in a 1Hz speed array.
 * A run starts at the last sample <= 3 km/h before crossing the target.
 * Linear interpolation between samples gives sub-second precision.
 */
export function accelTime(speeds: number[], targetKmh: number, dtSec = 1): number | null {
  let best: number | null = null;
  let startIdx: number | null = null;
  for (let i = 0; i < speeds.length; i++) {
    const v = speeds[i];
    if (v <= 3) {
      startIdx = i;
      continue;
    }
    if (startIdx !== null && v >= targetKmh) {
      const prev = speeds[i - 1];
      const frac = v === prev ? 0 : (targetKmh - prev) / (v - prev);
      const t = (i - 1 - startIdx + frac) * dtSec;
      if (t > 0 && (best === null || t < best)) best = t;
      startIdx = null;
    }
  }
  return best === null ? null : Math.round(best * 100) / 100;
}

export const SPEED_COLORS = ["#ff3b4f", "#ff9f1a", "#22e36b", "#19e6e6"] as const;

/** Splits the trip's speed range into 4 equal-width buckets (like the TripRank map legend). */
export function speedBuckets(topKmh: number): number[] {
  const step = Math.max(10, topKmh / 5);
  return [step, step * 2, step * 3];
}

export function colorForSpeed(kmh: number, buckets: number[]): string {
  if (kmh < buckets[0]) return SPEED_COLORS[0];
  if (kmh < buckets[1]) return SPEED_COLORS[1];
  if (kmh < buckets[2]) return SPEED_COLORS[2];
  return SPEED_COLORS[3];
}

/** Assumed "normal" average speed used for the Expected vs Actual travel time comparison. */
export const EXPECTED_AVG_KMH = 98;
