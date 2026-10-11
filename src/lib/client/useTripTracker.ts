"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { G, KMH_PER_MPH, haversineKm } from "@/lib/metrics";

export type Sample = { t: number; lat: number; lng: number; speed: number; g: number };
export type Status = "idle" | "starting" | "tracking";

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
  /** live run timer while accelerating from standstill */
  runTimer: number | null;
  gpsAccuracy: number | null;
};

export type FinishedTrip = {
  startedAt: number;
  durationSec: number;
  speedArray: number[];
  samples: Sample[];
  topSpeed: number;
  maxG: number;
  simulated: boolean;
};

const EMPTY: LiveStats = {
  speedKmh: 0,
  maxSpeedKmh: 0,
  avgSpeedKmh: 0,
  distanceKm: 0,
  elapsedSec: 0,
  maxG: 0,
  zeroTo100: null,
  zeroTo60mph: null,
  runTimer: null,
  gpsAccuracy: null,
};

const SIM_WARP = 4; // demo drive runs 4x real time

type Fix = { lat: number; lng: number; speedKmh: number; ts: number; accuracy: number };

/**
 * Aggregates GPS + motion sensors into 1Hz trip samples.
 *
 *  - GPS: navigator.geolocation.watchPosition (high accuracy). Uses the chipset's Doppler
 *    speed when available, otherwise derives speed from consecutive fixes (haversine / dt).
 *  - Motion: DeviceMotionEvent. Prefers `acceleration` (gravity removed by the OS);
 *    falls back to a high-pass filter on `accelerationIncludingGravity`.
 *  - Every second: pushes a sample, updates max/avg speed, distance, and detects
 *    0-100 km/h and 0-60 mph runs from a standstill (≤3 km/h), interpolated between samples.
 */
export function useTripTracker() {
  const [status, setStatus] = useState<Status>("idle");
  const [stats, setStats] = useState<LiveStats>(EMPTY);
  const [gforce, setGforce] = useState<GVector>({ x: 0, y: 0, z: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [simulated, setSimulated] = useState(false);
  const [sensors, setSensors] = useState({ gps: false, motion: false });

  const fixRef = useRef<Fix | null>(null);
  const gRef = useRef<GVector>({ x: 0, y: 0, z: 0, total: 0 });
  const gravityRef = useRef({ x: 0, y: 0, z: 0 });
  const peakGRef = useRef(0); // peak g within the current 1s window
  const samplesRef = useRef<Sample[]>([]);
  const speedsRef = useRef<number[]>([]);
  const aggRef = useRef({
    startedAt: 0,
    maxSpeed: 0,
    maxG: 0,
    distance: 0,
    zeroTo100: null as number | null,
    zeroTo60: null as number | null,
    runStart: null as number | null, // sample index when car left standstill
    hit60: false,
  });
  const cleanupRef = useRef<(() => void)[]>([]);
  const simRef = useRef({ lat: 48.8566, lng: 2.3522, heading: 35, v: 0, phase: 0, target: 230, turn: 0 });
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);

  // ---- motion ------------------------------------------------------------
  const onMotion = useCallback((e: DeviceMotionEvent) => {
    let x: number, y: number, z: number;
    const a = e.acceleration;
    if (a && a.x !== null && a.y !== null && a.z !== null) {
      x = a.x;
      y = a.y;
      z = a.z;
    } else {
      const ag = e.accelerationIncludingGravity;
      if (!ag || ag.x === null || ag.y === null || ag.z === null) return;
      const k = 0.9;
      const gr = gravityRef.current;
      gr.x = k * gr.x + (1 - k) * ag.x;
      gr.y = k * gr.y + (1 - k) * ag.y;
      gr.z = k * gr.z + (1 - k) * ag.z;
      x = ag.x - gr.x;
      y = ag.y - gr.y;
      z = ag.z - gr.z;
    }
    // light smoothing to kill sensor jitter
    const prev = gRef.current;
    const s = 0.25;
    const gx = prev.x + s * (x / G - prev.x);
    const gy = prev.y + s * (y / G - prev.y);
    const gz = prev.z + s * (z / G - prev.z);
    const total = Math.sqrt(gx * gx + gy * gy + gz * gz);
    gRef.current = { x: gx, y: gy, z: gz, total };
    if (total > peakGRef.current) peakGRef.current = total;
  }, []);

  // ---- GPS ---------------------------------------------------------------
  const onPosition = useCallback((pos: GeolocationPosition) => {
    const { latitude, longitude, speed, accuracy } = pos.coords;
    const prev = fixRef.current;
    let speedKmh: number;
    if (speed !== null && speed >= 0) {
      speedKmh = speed * 3.6;
    } else if (prev) {
      const dt = (pos.timestamp - prev.ts) / 1000;
      const d = haversineKm(prev.lat, prev.lng, latitude, longitude);
      speedKmh = dt > 0.2 && accuracy < 40 ? (d / dt) * 3600 : prev.speedKmh;
    } else speedKmh = 0;
    if (speedKmh < 1.5) speedKmh = 0; // stationary GPS drift
    const smoothed = prev ? prev.speedKmh + 0.6 * (speedKmh - prev.speedKmh) : speedKmh;
    fixRef.current = { lat: latitude, lng: longitude, speedKmh: smoothed, ts: pos.timestamp, accuracy };
    setSensors((s) => (s.gps ? s : { ...s, gps: true }));
  }, []);

  // ---- simulator ---------------------------------------------------------
  const simStep = useCallback(() => {
    const s = simRef.current;
    s.phase += 1;
    // occasionally pick a new target speed (traffic, braking zones, open autobahn)
    if (s.phase % 25 === 0) {
      const r = Math.random();
      s.target = r < 0.15 ? 60 + Math.random() * 40 : r < 0.3 ? 140 + Math.random() * 40 : 220 + Math.random() * 90;
    }
    const prevV = s.v;
    const vmax = 320;
    if (s.v < s.target) s.v += Math.max(0.8, 7.5 * (1 - s.v / vmax)) + Math.random() * 0.6; // km/h per s
    else s.v -= Math.min(12, (s.v - s.target) * 0.35 + 1);
    s.v = Math.max(0, s.v);
    if (s.phase % 9 === 0) s.turn = (Math.random() - 0.5) * 6;
    s.heading += s.turn * 0.3;
    const distKm = s.v / 3600;
    const rad = (s.heading * Math.PI) / 180;
    s.lat += (distKm / 111.32) * Math.cos(rad);
    s.lng += (distKm / (111.32 * Math.cos((s.lat * Math.PI) / 180))) * Math.sin(rad);
    fixRef.current = { lat: s.lat, lng: s.lng, speedKmh: s.v, ts: Date.now(), accuracy: 5 };

    const longG = (s.v - prevV) / 3.6 / G; // dv/dt over 1s
    const vMs = s.v / 3.6;
    const yawRate = ((s.turn * 0.3) * Math.PI) / 180; // rad/s
    const latG = (vMs * yawRate) / G + (Math.random() - 0.5) * 0.04;
    const total = Math.sqrt(longG * longG + latG * latG);
    gRef.current = { x: latG, y: longG, z: (Math.random() - 0.5) * 0.05, total };
    peakGRef.current = Math.max(peakGRef.current, total);
  }, []);

  // ---- 1Hz aggregator ----------------------------------------------------
  const tick = useCallback((isSim: boolean) => {
    if (isSim) simStep();
    const fix = fixRef.current;
    if (!fix) return;
    const agg = aggRef.current;
    const samples = samplesRef.current;
    const speeds = speedsRef.current;
    const idx = speeds.length;
    const speed = Math.round(fix.speedKmh * 10) / 10;
    const g = Math.round(peakGRef.current * 100) / 100;
    peakGRef.current = 0;

    const last = samples[samples.length - 1];
    if (last && fix.accuracy < 50) agg.distance += haversineKm(last.lat, last.lng, fix.lat, fix.lng);

    samples.push({ t: idx * 1000, lat: fix.lat, lng: fix.lng, speed, g });
    speeds.push(speed);
    agg.maxSpeed = Math.max(agg.maxSpeed, speed);
    agg.maxG = Math.max(agg.maxG, g);

    // acceleration run detection
    if (speed <= 3) {
      agg.runStart = idx;
      agg.hit60 = false;
    } else if (agg.runStart !== null) {
      const prev = speeds[idx - 1] ?? 0;
      const interp = (target: number) => {
        const frac = speed === prev ? 0 : (target - prev) / (speed - prev);
        return Math.round((idx - 1 - agg.runStart! + frac) * 100) / 100;
      };
      const t60 = 60 * KMH_PER_MPH;
      if (!agg.hit60 && speed >= t60) {
        const t = interp(t60);
        if (t > 0 && (agg.zeroTo60 === null || t < agg.zeroTo60)) agg.zeroTo60 = t;
        agg.hit60 = true;
      }
      if (speed >= 100) {
        const t = interp(100);
        if (t > 0 && (agg.zeroTo100 === null || t < agg.zeroTo100)) agg.zeroTo100 = t;
        agg.runStart = null;
      }
    }

    const moving = speeds.filter((v) => v > 2);
    setStats({
      speedKmh: speed,
      maxSpeedKmh: agg.maxSpeed,
      avgSpeedKmh: moving.length ? moving.reduce((a, b) => a + b, 0) / moving.length : 0,
      distanceKm: agg.distance,
      elapsedSec: speeds.length,
      maxG: agg.maxG,
      zeroTo100: agg.zeroTo100,
      zeroTo60mph: agg.zeroTo60,
      runTimer: agg.runStart !== null && speed > 3 ? idx - agg.runStart : null,
      gpsAccuracy: fix.accuracy,
    });
  }, [simStep]);

  // push G vector to UI at animation-frame rate
  useEffect(() => {
    if (status !== "tracking") return;
    let raf = 0;
    let last = 0;
    const loop = (ts: number) => {
      if (ts - last > 50) {
        setGforce({ ...gRef.current });
        last = ts;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [status]);

  const teardown = useCallback(() => {
    cleanupRef.current.forEach((fn) => fn());
    cleanupRef.current = [];
    wakeLockRef.current?.release().catch(() => {});
    wakeLockRef.current = null;
  }, []);

  useEffect(() => teardown, [teardown]);

  const reset = () => {
    fixRef.current = null;
    samplesRef.current = [];
    speedsRef.current = [];
    peakGRef.current = 0;
    gRef.current = { x: 0, y: 0, z: 0, total: 0 };
    aggRef.current = {
      startedAt: Date.now(),
      maxSpeed: 0,
      maxG: 0,
      distance: 0,
      zeroTo100: null,
      zeroTo60: null,
      runStart: null,
      hit60: false,
    };
    simRef.current = { lat: 48.8566, lng: 2.3522, heading: 35, v: 0, phase: 0, target: 250, turn: 0 };
    setStats(EMPTY);
    setGforce({ x: 0, y: 0, z: 0, total: 0 });
  };

  const requestWakeLock = async () => {
    try {
      const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
      if (nav.wakeLock) wakeLockRef.current = await nav.wakeLock.request("screen");
    } catch {
      /* not critical */
    }
  };

  /** Must be called from a user gesture (iOS motion permission). */
  const start = useCallback(
    async (opts: { simulate?: boolean } = {}) => {
      setError(null);
      reset();
      setStatus("starting");
      const isSim = !!opts.simulate;
      setSimulated(isSim);
      requestWakeLock();

      if (isSim) {
        setSensors({ gps: true, motion: true });
        const id = window.setInterval(() => tick(true), 1000 / SIM_WARP);
        cleanupRef.current.push(() => clearInterval(id));
        setStatus("tracking");
        return;
      }

      // Motion permission (iOS 13+ requires explicit request)
      const DME = typeof DeviceMotionEvent !== "undefined" ? (DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> }) : null;
      let motionOk = !!DME;
      if (DME?.requestPermission) {
        try {
          motionOk = (await DME.requestPermission()) === "granted";
        } catch {
          motionOk = false;
        }
      }
      if (motionOk) {
        window.addEventListener("devicemotion", onMotion);
        cleanupRef.current.push(() => window.removeEventListener("devicemotion", onMotion));
      }
      setSensors({ gps: false, motion: motionOk });

      if (!("geolocation" in navigator)) {
        setError("GPS is not available on this device. Try the demo drive.");
        setStatus("idle");
        teardown();
        return;
      }
      const watchId = navigator.geolocation.watchPosition(
        onPosition,
        (err) => {
          setError(
            err.code === err.PERMISSION_DENIED
              ? "Location permission denied. Enable it in settings or try the demo drive."
              : "Unable to get a GPS fix. Move to open sky or try the demo drive."
          );
          if (err.code === err.PERMISSION_DENIED) {
            teardown();
            setStatus("idle");
          }
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
      );
      cleanupRef.current.push(() => navigator.geolocation.clearWatch(watchId));
      const id = window.setInterval(() => tick(false), 1000);
      cleanupRef.current.push(() => clearInterval(id));
      setStatus("tracking");
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onMotion, onPosition, tick, teardown]
  );

  const stop = useCallback((): FinishedTrip | null => {
    teardown();
    setStatus("idle");
    const speeds = speedsRef.current;
    if (speeds.length < 2) return null;
    return {
      startedAt: aggRef.current.startedAt,
      durationSec: speeds.length,
      speedArray: [...speeds],
      samples: [...samplesRef.current],
      topSpeed: aggRef.current.maxSpeed,
      maxG: aggRef.current.maxG,
      simulated,
    };
  }, [teardown, simulated]);

  return { status, stats, gforce, error, simulated, sensors, start, stop, simWarp: SIM_WARP };
}
