"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useProfile, useUnit } from "@/lib/client/profile";
import { formatDistance, formatDuration, formatSpeed } from "@/lib/metrics";
import Onboarding from "@/components/Onboarding";
import ActivityIcon from "@/components/ActivityIcon";
import { isTripMode, TRIP_MODE_DETAILS, type TripMode } from "@/lib/modes";

type TripRow = {
  id: string;
  startedAt: string;
  durationSec: number;
  distanceKm: number;
  topSpeedKmh: number;
  avgSpeedKmh: number;
  maxGForce: number;
  isSimulated: number;
  mode: string;
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

  const sportsTrips = trips?.filter((trip) => !isTripMode(trip.mode) || trip.mode === "sports") ?? [];
  const best = sportsTrips.reduce((m, t) => Math.max(m, t.topSpeedKmh), 0);
  const totalKm = trips?.reduce((m, t) => m + t.distanceKm, 0) ?? 0;
  const bestG = sportsTrips.reduce((m, t) => Math.max(m, t.maxGForce), 0);

  return (
    <div className="garage-page space-y-4 px-4 pt-5">
      <header className="garage-hero">
        <svg className="garage-hero-car" viewBox="0 0 320 100" fill="none" aria-hidden="true">
          <path d="M19 67h18l17-22c5-7 12-11 22-13l66-13c10-2 20-1 29 3l42 19 43 8c12 2 21 9 27 18h15c7 0 12 6 12 13v7H17v-9c0-6 1-11 2-11Z" stroke="currentColor" strokeWidth="3" />
          <path d="m75 43 79-15c12-2 23-1 34 4l34 17H62l13-6Z" stroke="currentColor" strokeWidth="2" />
          <path d="M53 77a18 18 0 1 0 36 0m126 0a18 18 0 1 0 36 0" stroke="currentColor" strokeWidth="4" />
          <path d="M17 70h27m226 0h31" stroke="#ff5a54" strokeWidth="4" />
        </svg>
        <div className="garage-driver">
          <div className="garage-avatar">{profile.username.slice(0, 1).toUpperCase()}</div>
          <div className="min-w-0 flex-1">
            <h1 className="garage-username truncate">@{profile.username}</h1>
            <p className="garage-car-name truncate">{profile.car || profile.country}</p>
            <p className="garage-car-name truncate">{profile.car ? profile.country : "TRIPRANK DRIVER"}</p>
          </div>
          <div className="garage-unit-switch flex rounded-full border border-line bg-panel p-1 text-[10px] font-bold">
            {(["kmh", "mph"] as const).map((u) => (
              <button key={u} onClick={() => setUnit(u)} className={`rounded-full px-2 py-1 ${unit === u ? "bg-danger text-white" : "text-muted"}`}>
                {u === "kmh" ? "KM/H" : "MPH"}
              </button>
            ))}
          </div>
        </div>
      </header>

      <section className="garage-stats">
        <div className="garage-stat"><div className="garage-stat-label">Sports PB</div><div className="garage-stat-value text-danger">{formatSpeed(best, unit)}</div></div>
        <div className="garage-stat"><div className="garage-stat-label">Total distance</div><div className="garage-stat-value">{formatDistance(totalKm, unit)}</div></div>
        <div className="garage-stat"><div className="garage-stat-label">Peak G-force</div><div className="garage-stat-value">{bestG.toFixed(2)} G</div></div>
      </section>

      <div className="garage-history-heading pt-2"><h2>Trip History</h2><span className="text-xs text-muted">{trips?.length ?? "—"} trips</span></div>
      {trips === null ? (
        <p className="text-muted">Loading…</p>
      ) : trips.length === 0 ? (
        <div className="card p-8 text-center text-muted">
          No trips yet. <Link href="/" className="text-neon">Start your first drive →</Link>
        </div>
      ) : (
        <ul className="garage-trip-list">
          {trips.map((t) => {
            const mode: TripMode = isTripMode(t.mode) ? t.mode : "sports";
            const details = TRIP_MODE_DETAILS[mode];
            return (
              <li key={t.id} className="garage-trip-item">
                <Link href={`/trip/${t.id}`} className="garage-trip-card transition hover:border-danger/50">
                  <div className="garage-trip-top">
                    <div className="garage-date-tile text-[9px] text-muted">
                    <span className="text-sm leading-none font-bold text-white">{new Date(t.startedAt).getDate()}</span>
                    {new Date(t.startedAt).toLocaleString(undefined, { month: "short" })}
                  </div>
                    <ActivityIcon mode={mode} className="garage-trip-icon h-6 w-6" />
                    <div className="min-w-0">
                      <div className="garage-trip-mode">{details.label}</div>
                      <div className="garage-trip-meta">{formatDistance(t.distanceKm, unit)} · {formatDuration(t.durationSec)}</div>
                    </div>
                  </div>
                  <div className="garage-trip-speed">
                    <span className="font-bold tabular">{formatSpeed(t.topSpeedKmh, unit)} max</span>
                    {t.isSimulated === 1 && <span className="rounded bg-danger/20 px-1.5 py-0.5 text-[9px] font-bold text-danger">DEMO</span>}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <button
        onClick={() => {
          if (confirm("Sign out of this driver profile on this device?")) save(null);
        }}
        className="switch-driver-button"
      >
        ↔ &nbsp; Switch driver
      </button>
    </div>
  );
}
