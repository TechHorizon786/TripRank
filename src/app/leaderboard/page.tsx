"use client";

import { useEffect, useState } from "react";
import { useProfile, useUnit } from "@/lib/client/profile";
import { formatSpeed } from "@/lib/metrics";

type Entry = { rank: number; userId: string; username: string; country: string; car: string | null; topSpeedKmh: number };
type Resp = { backend: "redis" | "postgres"; country: string; total: number; entries: Entry[] };

export default function LeaderboardPage() {
  const { profile } = useProfile();
  const [unit] = useUnit();
  const [scope, setScope] = useState<"global" | "country">("global");
  const [result, setResult] = useState<{ country?: string; data: Resp } | null>(null);

  const country = scope === "country" && profile?.country && profile.country !== "Global" ? profile.country : undefined;
  const data = result && result.country === country ? result.data : null;

  useEffect(() => {
    let alive = true;
    const qs = country ? `?country=${encodeURIComponent(country)}` : "";
    const load = () =>
      fetch(`/api/leaderboard${qs}`)
        .then((r) => r.json())
        .then((d: Resp) => alive && setResult({ country, data: d }));
    load();
    const id = setInterval(load, 10000); // near-real-time refresh
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [country]);

  const podium = data?.entries.slice(0, 3) ?? [];
  const rest = data?.entries.slice(3) ?? [];
  const order = [podium[1], podium[0], podium[2]];

  return (
    <div className="leaderboard-page px-4 pt-5">
      <header className="leaderboard-header">
        <div>
          <h1 className="section-brand">TRIP<span>RANK</span></h1>
          <p className="text-xs text-muted">TOP SPEED · {data ? `${data.total} DRIVERS RANKED` : "LOADING RANKS…"}</p>
        </div>
        {data && (
          <span className="rounded-full border border-line px-2 py-1 text-[9px] font-semibold tracking-widest text-muted uppercase">
            {data.backend === "redis" ? "LIVE RANKS" : "RANKS"}
          </span>
        )}
      </header>

      <div className="scope-switch mt-5 grid grid-cols-2 text-sm font-semibold">
        <button aria-pressed={scope === "global"} onClick={() => setScope("global")} className="py-2">
          Global
        </button>
        <button
          aria-pressed={scope === "country"}
          onClick={() => setScope("country")}
          disabled={!profile || profile.country === "Global"}
          className="py-2 text-muted disabled:opacity-40"
        >
          {profile?.country && profile.country !== "Global" ? profile.country : "My Country"}
        </button>
      </div>

      {!data ? (
        <div className="mt-10 text-center text-muted">Loading ranks…</div>
      ) : data.entries.length === 0 ? (
        <div className="card mt-6 p-8 text-center text-muted">No trips yet. Be the first to set a record!</div>
      ) : (
        <>
          <section className="podium-grid mt-7 grid grid-cols-3 items-end">
            {order.map((e, i) =>
              e ? (
                <div key={e.userId} className="podium-person">
                  <div className={`podium-avatar podium-avatar-${e.rank}`}>
                    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="currentColor" aria-hidden="true">
                      <circle cx="12" cy="8" r="4" />
                      <path d="M4.5 21a7.5 7.5 0 0 1 15 0z" />
                    </svg>
                  </div>
                  <div className="max-w-full truncate text-sm font-semibold">@{e.username}</div>
                  {e.car && <div className="max-w-full truncate text-[10px] text-muted">{e.car}</div>}
                  <div className="podium-speed tabular">{formatSpeed(e.topSpeedKmh, unit)}</div>
                  <div
                    className={`podium-block podium-block-${e.rank} ${e.userId === profile?.id ? "border-danger" : ""}`}
                    style={{ height: i === 1 ? 116 : i === 0 ? 86 : 66 }}
                  >
                    {e.rank === 1 ? "1st" : e.rank === 2 ? "2nd" : "3rd"}
                  </div>
                </div>
              ) : (
                <div key={i} />
              )
            )}
          </section>
          <ol className="rank-list card mt-4 divide-y divide-white/5 overflow-hidden">
            {rest.map((e) => (
              <li key={e.userId} className={`rank-list-item flex items-center gap-3 px-4 py-3 ${e.userId === profile?.id ? "rank-list-item-current" : ""}`}>
                <span className="w-7 text-center text-sm font-bold text-muted tabular">{e.rank}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">@{e.username}</div>
                  <div className="truncate text-xs text-muted">
                    {e.country}
                    {e.car ? ` · ${e.car}` : ""}
                  </div>
                </div>
                <span className="font-bold text-neon tabular">{formatSpeed(e.topSpeedKmh, unit)}</span>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
