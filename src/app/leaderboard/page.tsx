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
    <div className="px-4 pt-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Leaderboard</h1>
          <p className="text-xs text-muted">Top speed · {data ? `${data.total} drivers ranked` : "loading…"}</p>
        </div>
        {data && (
          <span className="rounded-full border border-line px-2 py-1 text-[10px] font-semibold tracking-widest text-muted uppercase">
            {data.backend === "redis" ? "⚡ Redis ZSET" : "PG fallback"}
          </span>
        )}
      </header>

      <div className="mt-4 grid grid-cols-2 rounded-full border border-line bg-panel p-1 text-sm font-semibold">
        <button onClick={() => setScope("global")} className={`rounded-full py-2 ${scope === "global" ? "bg-neon text-black" : "text-muted"}`}>
          Global
        </button>
        <button
          onClick={() => setScope("country")}
          disabled={!profile || profile.country === "Global"}
          className={`rounded-full py-2 disabled:opacity-40 ${scope === "country" ? "bg-neon text-black" : "text-muted"}`}
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
          <section className="mt-8 grid grid-cols-3 items-end gap-2">
            {order.map((e, i) =>
              e ? (
                <div key={e.userId} className="flex flex-col items-center">
                  <div className={`mb-2 flex h-14 w-14 items-center justify-center rounded-full text-xl font-black ${e.rank === 1 ? "bg-gold text-black" : e.rank === 2 ? "bg-zinc-300 text-black" : "bg-amber-700 text-white"}`}>
                    {e.username.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="max-w-full truncate text-sm font-semibold">@{e.username}</div>
                  <div className="text-xs text-neon tabular">{formatSpeed(e.topSpeedKmh, unit)}</div>
                  <div
                    className={`card mt-2 flex w-full items-start justify-center rounded-b-none pt-2 text-2xl font-black ${e.userId === profile?.id ? "border-neon/50" : ""}`}
                    style={{ height: i === 1 ? 110 : i === 0 ? 80 : 60 }}
                  >
                    <span className={e.rank === 1 ? "text-gold" : "text-white/70"}>{e.rank}</span>
                  </div>
                </div>
              ) : (
                <div key={i} />
              )
            )}
          </section>
          <ol className="card divide-y divide-white/5 overflow-hidden">
            {rest.map((e) => (
              <li key={e.userId} className={`flex items-center gap-3 px-4 py-3 ${e.userId === profile?.id ? "bg-neon/10" : ""}`}>
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
