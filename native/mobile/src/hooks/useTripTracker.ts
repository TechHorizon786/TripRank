/**
 * Expo / React Native version of the trip tracker hook.
 * Deps: expo-location, expo-sensors, expo-keep-awake
 *
 *   npx expo install expo-location expo-sensors expo-keep-awake
 *
 * Same 1Hz aggregation logic as the web build (src/lib/client/useTripTracker.ts).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import * as Location from "expo-location";
import { DeviceMotion, Accelerometer } from "expo-sensors";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";

const G = 9.80665;
const KMH_PER_MPH = 1.609344;

export type Sample = { t: number; lat: number; lng: number; speed: number; g: number };
export type GVector = { x: number; y: number; z: number; total: number };
export type LiveStats = {
  speedKmh: number;
  maxSpeedKmh: number;
  avgSpeedKmh: number;
  distanceKm: number;
  elapsedSec: number;
  maxG: number;
  zeroTo100: number | null;
  zeroTo60mph: number | null;
};

const EMPTY: LiveStats = { speedKmh: 0, maxSpeedKmh: 0, avgSpeedKmh: 0, distanceKm: 0, elapsedSec: 0, maxG: 0, zeroTo100: null, zeroTo60mph: null };

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function useTripTracker() {
  const [tracking, setTracking] = useState(false);
  const [stats, setStats] = useState<LiveStats>(EMPTY);
  const [gforce, setGforce] = useState<GVector>({ x: 0, y: 0, z: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);

  const fix = useRef<{ lat: number; lng: number; speedKmh: number; acc: number } | null>(null);
  const peakG = useRef(0);
  const samples = useRef<Sample[]>([]);
  const speeds = useRef<number[]>([]);
  const agg = useRef({ startedAt: 0, max: 0, maxG: 0, dist: 0, z100: null as number | null, z60: null as number | null, runStart: null as number | null, hit60: false });
  const subs = useRef<{ remove: () => void }[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const tick = useCallback(() => {
    const f = fix.current;
    if (!f) return;
    const a = agg.current;
    const idx = speeds.current.length;
    const speed = Math.round(f.speedKmh * 10) / 10;
    const g = Math.round(peakG.current * 100) / 100;
    peakG.current = 0;
    const last = samples.current[samples.current.length - 1];
    if (last && f.acc < 50) a.dist += haversineKm(last, f);
    samples.current.push({ t: idx * 1000, lat: f.lat, lng: f.lng, speed, g });
    speeds.current.push(speed);
    a.max = Math.max(a.max, speed);
    a.maxG = Math.max(a.maxG, g);

    // 0-60 mph / 0-100 km/h detection from standstill with linear interpolation
    if (speed <= 3) { a.runStart = idx; a.hit60 = false; }
    else if (a.runStart !== null) {
      const prev = speeds.current[idx - 1] ?? 0;
      const at = (target: number) => idx - 1 - a.runStart! + (speed === prev ? 0 : (target - prev) / (speed - prev));
      if (!a.hit60 && speed >= 60 * KMH_PER_MPH) { const t = at(60 * KMH_PER_MPH); if (a.z60 === null || t < a.z60) a.z60 = t; a.hit60 = true; }
      if (speed >= 100) { const t = at(100); if (a.z100 === null || t < a.z100) a.z100 = t; a.runStart = null; }
    }
    const moving = speeds.current.filter((v) => v > 2);
    setStats({
      speedKmh: speed,
      maxSpeedKmh: a.max,
      avgSpeedKmh: moving.length ? moving.reduce((x, y) => x + y, 0) / moving.length : 0,
      distanceKm: a.dist,
      elapsedSec: speeds.current.length,
      maxG: a.maxG,
      zeroTo100: a.z100,
      zeroTo60mph: a.z60,
    });
  }, []);

  const start = useCallback(async () => {
    setError(null);
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return setError("Location permission is required to track trips.");

    samples.current = []; speeds.current = []; fix.current = null;
    agg.current = { startedAt: Date.now(), max: 0, maxG: 0, dist: 0, z100: null, z60: null, runStart: null, hit60: false };
    setStats(EMPTY);
    await activateKeepAwakeAsync("trip");

    // GPS — BestForNavigation uses the Doppler speed from the GNSS chipset (m/s)
    const locSub = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 500, distanceInterval: 0 },
      (loc) => {
        const { latitude, longitude, speed, accuracy } = loc.coords;
        const prev = fix.current;
        let kmh = speed !== null && speed >= 0 ? speed * 3.6 : prev?.speedKmh ?? 0;
        if (kmh < 1.5) kmh = 0;
        const smoothed = prev ? prev.speedKmh + 0.6 * (kmh - prev.speedKmh) : kmh;
        fix.current = { lat: latitude, lng: longitude, speedKmh: smoothed, acc: accuracy ?? 99 };
      }
    );
    subs.current.push(locSub);

    // Motion — DeviceMotion.acceleration has gravity removed by the OS (m/s²)
    DeviceMotion.setUpdateInterval(50);
    const available = await DeviceMotion.isAvailableAsync();
    if (available) {
      subs.current.push(
        DeviceMotion.addListener(({ acceleration }) => {
          if (!acceleration) return;
          const x = acceleration.x / G, y = acceleration.y / G, z = acceleration.z / G;
          const total = Math.sqrt(x * x + y * y + z * z);
          peakG.current = Math.max(peakG.current, total);
          setGforce({ x, y, z, total });
        })
      );
    } else {
      // Fallback: raw accelerometer (in g) with a high-pass filter to strip gravity
      const grav = { x: 0, y: 0, z: 0 };
      Accelerometer.setUpdateInterval(50);
      subs.current.push(
        Accelerometer.addListener((a) => {
          grav.x = 0.9 * grav.x + 0.1 * a.x; grav.y = 0.9 * grav.y + 0.1 * a.y; grav.z = 0.9 * grav.z + 0.1 * a.z;
          const x = a.x - grav.x, y = a.y - grav.y, z = a.z - grav.z;
          const total = Math.sqrt(x * x + y * y + z * z);
          peakG.current = Math.max(peakG.current, total);
          setGforce({ x, y, z, total });
        })
      );
    }
    timer.current = setInterval(tick, 1000);
    setTracking(true);
  }, [tick]);

  const stop = useCallback(() => {
    subs.current.forEach((s) => s.remove());
    subs.current = [];
    if (timer.current) clearInterval(timer.current);
    deactivateKeepAwake("trip");
    setTracking(false);
    if (speeds.current.length < 2) return null;
    return {
      startedAt: agg.current.startedAt,
      durationSec: speeds.current.length,
      speedArray: [...speeds.current],
      samples: [...samples.current],
      topSpeed: agg.current.max,
      maxG: agg.current.maxG,
    };
  }, []);

  useEffect(() => () => { subs.current.forEach((s) => s.remove()); if (timer.current) clearInterval(timer.current); }, []);

  return { tracking, stats, gforce, error, start, stop };
}
