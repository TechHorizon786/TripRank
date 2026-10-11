"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import SpeedDial from "@/components/SpeedDial";
import GForceBubble from "@/components/GForceBubble";
import Onboarding from "@/components/Onboarding";
import { useTripTracker } from "@/lib/client/useTripTracker";
import { useProfile, useUnit } from "@/lib/client/profile";
import { formatDistance, formatDuration, formatSpeed } from "@/lib/metrics";

export default function DriveScreen() {
  const router = useRouter();
  const { profile, ready } = useProfile();
  const [unit, setUnit] = useUnit();
  const { status, stats, gforce, error, simulated, sensors, start, stop, simWarp } = useTripTracker();
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const tracking = status === "tracking";

  const finish = async () => {
    const trip = stop();
    if (!trip || !profile) {
      setSaveErr("Trip too short to save — drive a little longer.");
      return;
    }
    setSaving(true);
    setSaveErr(null);
    try {
      const res = await fetch("/api/trips/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: profile.id,
          speed_array: trip.speedArray,
          samples: trip.samples,
          top_speed: trip.topSpeed,
          max_gforce: trip.maxG,
          timestamp: new Date(trip.startedAt).toISOString(),
          duration_sec: trip.durationSec,
          simulated: trip.simulated,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      router.push(`/trip/${data.trip.id}`);
    } catch (e) {
      setSaveErr((e as Error).message);
      setSaving(false);
    }
  };

  const accelLabel = unit === "mph" ? "0-60 mph" : "0-100 km/h";
  const accelValue = unit === "mph" ? stats.zeroTo60mph : stats.zeroTo100;

  return (
    <div className="relative px-5 pt-6">
      {ready && !profile && <Onboarding onDone={() => {}} />}

      {/* header */}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="wordmark text-3xl">TripRank</h1>
          <p className="text-xs text-muted">{profile ? `@${profile.username} · ${profile.country}` : "Track. Rank. Flex."}</p>
        </div>
        <div className="flex rounded-full border border-line bg-panel p-1 text-xs font-semibold">
          {(["kmh", "mph"] as const).map((u) => (
            <button
              key={u}
              onClick={() => setUnit(u)}
              className={`rounded-full px-3 py-1.5 transition ${unit === u ? "bg-neon text-black" : "text-muted"}`}
            >
              {u === "kmh" ? "KM/H" : "MPH"}
            </button>
          ))}
        </div>
      </header>

      {/* status chips */}
      <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-medium">
        <Chip on={tracking && sensors.gps} label={tracking ? (sensors.gps ? `GPS ${stats.gpsAccuracy ? `±${Math.round(stats.gpsAccuracy)}m` : "lock"}` : "GPS searching…") : "GPS idle"} />
        <Chip on={tracking && sensors.motion} label={sensors.motion || !tracking ? "Motion sensors" : "No motion sensor"} />
        {simulated && tracking && <span className="rounded-full bg-gold/15 px-2.5 py-1 text-gold">DEMO {simWarp}× time warp</span>}
        {tracking && (
          <span className="ml-auto flex items-center gap-1.5 rounded-full bg-danger/15 px-2.5 py-1 text-danger">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-danger" /> REC {formatDuration(stats.elapsedSec)}
          </span>
        )}
      </div>

      {/* speed dial */}
      <section className="mt-4">
        <SpeedDial speedKmh={stats.speedKmh} maxKmh={stats.maxSpeedKmh} unit={unit} active={tracking} />
      </section>

      {/* live stats */}
      <section className="card mt-2 grid grid-cols-3 divide-x divide-white/5 py-4 text-center">
        <Stat label="Top" value={formatSpeed(stats.maxSpeedKmh, unit)} />
        <Stat label="Average" value={formatSpeed(stats.avgSpeedKmh, unit)} />
        <Stat label="Distance" value={formatDistance(stats.distanceKm, unit)} />
      </section>

      <section className="mt-3 grid grid-cols-[1fr_auto] items-center gap-3">
        <div className="card flex h-full flex-col justify-center gap-3 p-4">
          <div>
            <div className="text-[10px] tracking-widest text-muted uppercase">{accelLabel}</div>
            <div className="text-3xl font-bold tabular text-lime">
              {accelValue !== null ? `${accelValue.toFixed(2)}s` : stats.runTimer !== null ? `${stats.runTimer}s…` : "--.--"}
            </div>
          </div>
          <div>
            <div className="text-[10px] tracking-widest text-muted uppercase">Max G-Force</div>
            <div className="text-xl font-bold tabular">{stats.maxG.toFixed(2)} G</div>
          </div>
        </div>
        <div className="card p-3">
          <GForceBubble g={gforce} maxG={stats.maxG} />
        </div>
      </section>

      {(error || saveErr) && (
        <p className="mt-4 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{error || saveErr}</p>
      )}

      {/* CTA */}
      <section className="mt-6 flex flex-col items-center gap-3">
        {!tracking ? (
          <>
            <button
              onClick={() => start()}
              disabled={!profile || saving || status === "starting"}
              className="pulse-ring neon-glow relative h-20 w-full rounded-full bg-gradient-to-r from-lime via-neon to-cyan-300 text-xl font-black tracking-[0.25em] text-black uppercase transition active:scale-[0.98] disabled:opacity-50"
            >
              {saving ? "Saving trip…" : status === "starting" ? "Starting…" : "Start Trip"}
            </button>
            <button
              onClick={() => start({ simulate: true })}
              disabled={!profile || saving}
              className="text-sm text-muted underline-offset-4 hover:text-neon hover:underline disabled:opacity-50"
            >
              No GPS here? Run a demo drive →
            </button>
          </>
        ) : (
          <button
            onClick={finish}
            className="h-20 w-full rounded-full border-2 border-danger bg-danger/10 text-xl font-black tracking-[0.25em] text-danger uppercase transition active:scale-[0.98]"
          >
            End Trip
          </button>
        )}
        <p className="max-w-xs text-center text-[11px] leading-relaxed text-white/30">
          Mount your phone securely. Never interact with the app while driving. Obey all traffic laws.
        </p>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-2">
      <div className="text-lg font-bold tabular">{value}</div>
      <div className="text-[10px] tracking-widest text-muted uppercase">{label}</div>
    </div>
  );
}

function Chip({ on, label }: { on: boolean; label: string }) {
  return (
    <span className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${on ? "border-lime/30 bg-lime/10 text-lime" : "border-line bg-panel text-muted"}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${on ? "bg-lime" : "bg-muted/50"}`} />
      {label}
    </span>
  );
}
