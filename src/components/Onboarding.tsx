"use client";

import { useState } from "react";
import { createProfile, type LocalProfile } from "@/lib/client/profile";

const COUNTRIES = [
  "Germany", "United States", "United Kingdom", "France", "Italy", "Netherlands", "Poland", "Spain",
  "UAE", "Saudi Arabia", "India", "Japan", "Canada", "Australia", "Brazil", "Mexico", "Sweden", "Turkey", "Global",
];

export default function Onboarding({ onDone }: { onDone: (p: LocalProfile) => void }) {
  const [username, setUsername] = useState("");
  const [country, setCountry] = useState("Germany");
  const [car, setCar] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return setErr("Pick a driver name");
    setBusy(true);
    setErr(null);
    try {
      onDone(await createProfile({ username, country, car }));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-sm sm:items-center">
      <form onSubmit={submit} className="card w-full max-w-md rounded-b-none p-6 sm:rounded-b-[1.25rem]">
        <h2 className="wordmark text-center text-4xl">TripRank</h2>
        <p className="mt-2 text-center text-sm text-muted">Create your driver profile to save trips and climb the leaderboard.</p>
        <div className="mt-6 space-y-3">
          <label className="block">
            <span className="text-xs tracking-widest text-muted uppercase">Driver name</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              maxLength={24}
              placeholder="autobahn_king"
              className="mt-1 w-full rounded-xl border border-line bg-panel-2 px-4 py-3 text-white outline-none placeholder:text-white/25 focus:border-neon"
            />
          </label>
          <label className="block">
            <span className="text-xs tracking-widest text-muted uppercase">Country</span>
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="mt-1 w-full rounded-xl border border-line bg-panel-2 px-4 py-3 text-white outline-none focus:border-neon"
            >
              {COUNTRIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs tracking-widest text-muted uppercase">Car (optional)</span>
            <input
              value={car}
              onChange={(e) => setCar(e.target.value)}
              maxLength={40}
              placeholder="BMW M4 Competition"
              className="mt-1 w-full rounded-xl border border-line bg-panel-2 px-4 py-3 text-white outline-none placeholder:text-white/25 focus:border-neon"
            />
          </label>
        </div>
        {err && <p className="mt-3 text-sm text-danger">{err}</p>}
        <button
          disabled={busy}
          className="mt-6 w-full rounded-full bg-gradient-to-r from-lime to-neon py-4 font-bold tracking-widest text-black uppercase disabled:opacity-60"
        >
          {busy ? "Creating…" : "Let's drive"}
        </button>
      </form>
    </div>
  );
}
