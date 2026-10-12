"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import SpeedDial from "@/components/SpeedDial";
import GForceBubble from "@/components/GForceBubble";
import Onboarding from "@/components/Onboarding";
import { useTripTracker } from "@/lib/client/useTripTracker";
import { useProfile, useTripMode, useUnit } from "@/lib/client/profile";
import { formatDistance, formatDuration, formatSpeed } from "@/lib/metrics";
import { paceLabel, TRIP_MODE_DETAILS, TRIP_MODES, type TripMode } from "@/lib/modes";

export default function DriveScreen() {
  const router = useRouter();
  const { profile, ready } = useProfile();
  const [unit, setUnit] = useUnit();
  const [mode, setMode] = useTripMode();
  const { status, stats, gforce, error, simulated, sensors, start, stop, simWarp } = useTripTracker();
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const tracking = status === "tracking";
  const sportsMode = mode === "sports";
  const pace = paceLabel(mode, stats.speedKmh);

  const selectMode = (nextMode: TripMode) => {
    setMode(nextMode);
  };

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
          mode: trip.mode,
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
          <p className="text-xs text-muted">
            {profile ? `@${profile.username} · ${profile.country}` : "Track. Rank. Flex."}
            {" · "}{TRIP_MODE_DETAILS[mode].label}
          </p>
        </div>
        <div className="flex rounded-full border border-line bg-panel p-1 text-xs font-semibold">
          {(["kmh", "mph"] as const).map((u) => (
            <button
              key={u}
              onClick={() => setUnit(u)}
              className={`rounded-full px-3 py-1.5 transition ${unit === u ? (sportsMode ? "bg-danger text-white" : "bg-neon text-black") : "text-muted"}`}
            >
              {u === "kmh" ? "KM/H" : "MPH"}
            </button>
          ))}
        </div>
      </header>

      {!tracking && (
        <section className="mt-5">
          <h2 className="mb-2 text-[10px] font-semibold tracking-[0.2em] text-muted uppercase">Choose activity</h2>
          <div className="grid grid-cols-2 gap-2">
            {TRIP_MODES.map((item) => {
              const selected = mode === item;
              const details = TRIP_MODE_DETAILS[item];
              return (
                <button
                  key={item}
                  onClick={() => selectMode(item)}
                  aria-pressed={selected}
                  className={`rounded-2xl border p-3 text-left transition ${
                    selected
                      ? item === "sports"
                        ? "border-danger/70 bg-danger/15 text-white shadow-[0_0_18px_rgba(255,59,79,0.15)]"
                        : "border-neon/50 bg-neon/10 text-white"
                      : "border-line bg-panel text-muted"
                  } ${item === "sports" ? "col-span-2" : ""}`}
                >
                  <span className="mr-2">{details.icon}</span>
                  <span className="font-semibold">{details.label}</span>
                  <span className="mt-1 block text-[10px] opacity-70">{details.description}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* status chips */}
      <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-medium">
        <Chip on={tracking && sensors.gps} label={tracking ? (sensors.gps ? `GPS ${stats.gpsAccuracy ? `±${Math.round(stats.gpsAccuracy)}m` : "lock"}` : "GPS searching…") : "GPS idle"} />
        {sportsMode && <Chip on={tracking && sensors.motion} label={sensors.motion || !tracking ? "Motion sensors" : "No motion sensor"} />}
        {simulated && tracking && <span className="rounded-full bg-gold/15 px-2.5 py-1 text-gold">DEMO {simWarp}× time warp</span>}
        {tracking && (
          <span className="ml-auto flex items-center gap-1.5 rounded-full bg-danger/15 px-2.5 py-1 text-danger">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-danger" /> REC {formatDuration(stats.elapsedSec)}
          </span>
        )}
      </div>

      {/* speed dial */}
      <section className="mt-4">
        <SpeedDial speedKmh={stats.speedKmh} maxKmh={stats.maxSpeedKmh} unit={unit} active={tracking} sportsMode={sportsMode} />
      </section>
      {!sportsMode && (
        <div className="mx-auto -mt-1 mb-3 w-fit rounded-full border border-line bg-panel px-4 py-1.5 text-xs">
          Pace: <span className="font-semibold text-neon">{pace}</span>
          {(mode === "bike" || mode === "car") && <span className="ml-1 text-muted">· follow local speed limits</span>}
        </div>
      )}

      {/* live stats */}
      <section className="card mt-2 grid grid-cols-3 divide-x divide-white/5 py-4 text-center">
        <Stat label={sportsMode ? "Top" : "Peak"} value={formatSpeed(stats.maxSpeedKmh, unit)} />
        <Stat label="Average" value={formatSpeed(stats.avgSpeedKmh, unit)} />
        <Stat label="Distance" value={formatDistance(stats.distanceKm, unit)} />
      </section>

      {sportsMode ? (
        <section className="mt-3 grid grid-cols-[1fr_auto] items-center gap-3">
        <div className="card flex h-full flex-col justify-center gap-3 p-4">
          <div>
            <div className="text-[10px] tracking-widest text-muted uppercase">{accelLabel}</div>
            <div className={`text-3xl font-bold tabular ${sportsMode ? "text-danger" : "text-lime"}`}>
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
      ) : (
        <section className="card mt-3 flex items-center justify-between px-4 py-3">
          <span className="text-sm text-muted">Elapsed</span>
          <span className="font-bold tabular">{formatDuration(stats.elapsedSec)}</span>
        </section>
      )}

      {(error || saveErr) && (
        <p className="mt-4 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{error || saveErr}</p>
      )}

      {/* CTA */}
      <section className="mt-6 flex flex-col items-center gap-3">
        {!tracking ? (
          <>
            <button
              onClick={() => start({ mode })}
              disabled={!profile || saving || status === "starting"}
              className={`pulse-ring relative h-20 w-full rounded-full text-xl font-black tracking-[0.25em] uppercase transition active:scale-[0.98] disabled:opacity-50 ${
                sportsMode
                  ? "pulse-ring-sports bg-linear-to-r from-red-600 via-rose-500 to-orange-400 text-white shadow-[0_0_28px_rgba(255,59,79,0.3)]"
                  : "neon-glow bg-linear-to-r from-lime via-neon to-cyan-300 text-black"
              }`}
            >
              {saving ? "Saving trip…" : status === "starting" ? "Starting…" : `Start ${TRIP_MODE_DETAILS[mode].label}`}
            </button>
            <button
              onClick={() => start({ simulate: true, mode })}
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
          Mount your phone securely. Never interact with the app while moving. Follow local speed limits; use Sports comparisons only on a closed course.
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
