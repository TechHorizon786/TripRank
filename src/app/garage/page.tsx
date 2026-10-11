"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useProfile, useUnit } from "@/lib/client/profile";
import { formatDistance, formatDuration, formatSpeed } from "@/lib/metrics";
import Onboarding from "@/components/Onboarding";

type TripRow = {
  id: string;
  startedAt: string;
  durationSec: number;
  distanceKm: number;
  topSpeedKmh: number;
  avgSpeedKmh: number;
  maxGForce: number;
  isSimulated: number;
};

export default function GaragePage() {
  const { profile, ready, save } = useProfile();
  const [unit, setUnit] = useUnit();
  const [trips, setTrips] = useState<TripRow[] | null>(null);

  useEffect(() => {
    if (!profile) return;
    fetch(`/api/users/${profile.id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setTrips(d.trips))
      .catch(() => setTrips([]));
  }, [profile]);

  if (ready && !profile) return <Onboarding onDone={() => {}} />;
  if (!profile) return null;

  const best = trips?.reduce((m, t) => Math.max(m, t.topSpeedKmh), 0) ?? 0;
  const totalKm = trips?.reduce((m, t) => m + t.distanceKm, 0) ?? 0;
  const bestG = trips?.reduce((m, t) => Math.max(m, t.maxGForce), 0) ?? 0;

  return (
    <div className="space-y-4 px-4 pt-6">
      <header className="flex items-center gap-4">
        <div className="neon-glow flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-lime to-neon text-2xl font-black text-black">
          {profile.username.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-extrabold">@{profile.username}</h1>
          <p className="truncate text-sm text-muted">
            {profile.country}
            {profile.car ? ` · ${profile.car}` : ""}
          </p>
        </div>
      </header>

      <section className="card grid grid-cols-3 divide-x divide-white/5 py-4 text-center">
        <div><div className="text-lg font-bold text-neon tabular">{formatSpeed(best, unit)}</div><div className="text-[10px] tracking-widest text-muted uppercase">PB Speed</div></div>
        <div><div className="text-lg font-bold tabular">{formatDistance(totalKm, unit)}</div><div className="text-[10px] tracking-widest text-muted uppercase">Total</div></div>
        <div><div className="text-lg font-bold tabular">{bestG.toFixed(2)} G</div><div className="text-[10px] tracking-widest text-muted uppercase">Peak G</div></div>
      </section>

      <section className="card flex items-center justify-between px-4 py-3">
        <span className="text-sm">Units</span>
        <div className="flex rounded-full border border-line bg-panel-2 p-1 text-xs font-semibold">
          {(["kmh", "mph"] as const).map((u) => (
            <button key={u} onClick={() => setUnit(u)} className={`rounded-full px-3 py-1 ${unit === u ? "bg-neon text-black" : "text-muted"}`}>
              {u === "kmh" ? "KM/H" : "MPH"}
            </button>
          ))}
        </div>
      </section>

      <h2 className="pt-2 text-sm font-semibold tracking-widest text-muted uppercase">Trip History</h2>
      {trips === null ? (
        <p className="text-muted">Loading…</p>
      ) : trips.length === 0 ? (
        <div className="card p-8 text-center text-muted">
          No trips yet. <Link href="/" className="text-neon">Start your first drive →</Link>
        </div>
      ) : (
        <ul className="space-y-2">
          {trips.map((t) => (
            <li key={t.id}>
              <Link href={`/trip/${t.id}`} className="card flex items-center gap-3 px-4 py-3 transition hover:border-neon/40">
                <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl bg-panel-2 text-[10px] text-muted">
                  <span className="text-base leading-none font-bold text-white">{new Date(t.startedAt).getDate()}</span>
                  {new Date(t.startedAt).toLocaleString(undefined, { month: "short" })}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">
                    {formatDistance(t.distanceKm, unit)} · {formatDuration(t.durationSec)}
                    {t.isSimulated === 1 && <span className="ml-2 rounded bg-gold/15 px-1.5 py-0.5 text-[10px] text-gold">DEMO</span>}
                  </div>
                  <div className="text-xs text-muted">avg {formatSpeed(t.avgSpeedKmh, unit)} · {t.maxGForce.toFixed(2)} G</div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-neon tabular">{formatSpeed(t.topSpeedKmh, unit)}</div>
                  <div className="text-[10px] text-muted">top</div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <button
        onClick={() => {
          if (confirm("Sign out of this driver profile on this device?")) save(null);
        }}
        className="w-full py-4 text-sm text-muted hover:text-danger"
      >
        Switch driver
      </button>
    </div>
  );
}
