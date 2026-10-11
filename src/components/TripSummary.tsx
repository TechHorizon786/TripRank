"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { toBlob } from "html-to-image";
import SpeedChart from "@/components/SpeedChart";
import RouteMap from "@/components/RouteMap";
import VideoOverlay from "@/components/VideoOverlay";
import { useProfile, useUnit } from "@/lib/client/profile";
import {
  EXPECTED_AVG_KMH,
  SPEED_COLORS,
  formatDiff,
  formatDistance,
  formatDuration,
  formatSpeed,
  ordinal,
  speedBuckets,
  toUnit,
  unitLabel,
} from "@/lib/metrics";

export type TripView = {
  id: string;
  startedAt: string;
  durationSec: number;
  distanceKm: number;
  topSpeedKmh: number;
  avgSpeedKmh: number;
  maxGForce: number;
  zeroToHundredSec: number | null;
  zeroToSixtySec: number | null;
  speedArray: number[];
  samples: { lat: number; lng: number; speed: number }[];
  isSimulated: boolean;
  user: { id: string; username: string; country: string; car: string | null };
  globalRank: number;
  countryRank: number;
};

const Icon = {
  nav: <path d="M3 11l18-8-8 18-2-8z" />,
  gauge: <path d="M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18zM12 12l4-4M7 13h.01M8.5 8.5h.01M12 7h.01" />,
  dial: <path d="M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18zM12 12V7M8 16h8" />,
  trophy: <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" />,
};

export default function TripSummary({ trip }: { trip: TripView }) {
  const [unit, setUnit] = useUnit();
  const { profile } = useProfile();
  const reportRef = useRef<HTMLDivElement>(null);
  const [sharing, setSharing] = useState(false);
  const [shareMessage, setShareMessage] = useState("");
  const isOwner = profile?.id === trip.user.id;

  const buckets = speedBuckets(trip.topSpeedKmh);
  const u = (v: number) => Math.round(toUnit(v, unit));
  const expectedSec = (trip.distanceKm / EXPECTED_AVG_KMH) * 3600;
  const diff = expectedSec - trip.durationSec;
  const faster = diff >= 0;
  const hasCountry = trip.user.country && trip.user.country !== "Global";
  const rank = hasCountry ? trip.countryRank : trip.globalRank;
  const rankSub = hasCountry ? `fastest in ${trip.user.country}` : "fastest worldwide";
  const accel = unit === "mph" ? trip.zeroToSixtySec : trip.zeroToHundredSec;

  const share = async () => {
    if (!reportRef.current || sharing) return;
    setSharing(true);
    setShareMessage("");

    try {
      const options = { backgroundColor: "#050607", cacheBust: true, pixelRatio: 2 };
      let blob: Blob | null = null;
      try {
        blob = await toBlob(reportRef.current, options);
      } catch (error) {
        console.warn("[trip-share] Retrying image capture without external map tiles:", error);
      }
      if (!blob) {
        blob = await toBlob(reportRef.current, {
          ...options,
          filter: (node) => !(node.tagName === "IMG" && node.getAttribute("src")?.includes("tile.openstreetmap.de")),
        });
      }
      if (!blob) throw new Error("The trip report image could not be generated.");

      const file = new File([blob], `triprank-${trip.id.slice(0, 8)}.png`, { type: "image/png" });
      const text = `${formatSpeed(trip.topSpeedKmh, unit)} top speed · ${ordinal(rank)} ${rankSub} on TripRank`;

      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "TripRank trip report", text });
        setShareMessage("Trip report image shared.");
      } else {
        const downloadUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = downloadUrl;
        link.download = file.name;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 60_000);
        setShareMessage("Trip image saved. Open it from Downloads or Photos to share.");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.error("[trip-share] Could not share trip image:", error);
      setShareMessage("Couldn't create the trip image. Please try again.");
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="pb-4">
      <div className="flex items-center justify-between px-4 pt-6">
        <Link href="/" className="text-sm text-muted hover:text-white">← Drive</Link>
        <div className="flex rounded-full border border-line bg-panel p-1 text-[11px] font-semibold">
          {(["kmh", "mph"] as const).map((x) => (
            <button key={x} onClick={() => setUnit(x)} className={`rounded-full px-2.5 py-1 ${unit === x ? "bg-neon text-black" : "text-muted"}`}>
              {x === "kmh" ? "KM/H" : "MPH"}
            </button>
          ))}
        </div>
      </div>

      <div ref={reportRef} className="space-y-4 bg-ink px-4 pt-6 pb-2">
        <section className="pt-2 pb-2 text-center">
          <h1 className="wordmark text-5xl">TripRank</h1>
          <p className="mt-2 text-xs text-muted">
            @{trip.user.username}
            {trip.user.car ? ` · ${trip.user.car}` : ""} · {new Date(trip.startedAt).toLocaleDateString()}
            {trip.isSimulated && <span className="ml-2 rounded bg-gold/15 px-1.5 py-0.5 text-[10px] text-gold">DEMO</span>}
          </p>
        </section>

        <section className="card grid grid-cols-2 gap-y-8 px-4 py-7">
          <Metric icon={Icon.nav} value={formatDistance(trip.distanceKm, unit)} label="Distance" />
          <Metric icon={Icon.gauge} value={formatSpeed(trip.avgSpeedKmh, unit)} label="Avg Speed" />
          <Metric icon={Icon.dial} value={formatSpeed(trip.topSpeedKmh, unit)} label="Max Speed" />
          <Metric icon={Icon.trophy} value={ordinal(rank)} label={rankSub} gold />
        </section>

        <section className="card grid grid-cols-3 divide-x divide-white/5 py-4 text-center">
          <Mini value={formatDuration(trip.durationSec)} label="Duration" />
          <Mini value={`${trip.maxGForce.toFixed(2)} G`} label="Max G-Force" />
          <Mini value={accel ? `${accel.toFixed(2)}s` : "—"} label={unit === "mph" ? "0-60 mph" : "0-100 km/h"} />
        </section>

        <section className="card px-4 pt-5 pb-3">
          <h2 className="mb-2 font-semibold">Speed Over Time</h2>
          <SpeedChart speeds={trip.speedArray} unit={unit} durationLabel={formatDuration(trip.durationSec)} />
        </section>

        <RouteMap points={trip.samples} buckets={buckets} />

        <section className="card px-5 py-5">
          <h2 className="mb-3 font-semibold">Speed Ranges</h2>
          <ul className="space-y-2.5 text-sm text-white/85">
            {[
              `< ${u(buckets[0])} ${unitLabel(unit)}`,
              `${u(buckets[0])}-${u(buckets[1])} ${unitLabel(unit)}`,
              `${u(buckets[1]) + 1}-${u(buckets[2])} ${unitLabel(unit)}`,
              `> ${u(buckets[2])} ${unitLabel(unit)}`,
            ].map((label, i) => (
              <li key={i} className="flex items-center gap-4">
                <span className="h-1.5 w-14 rounded-full" style={{ background: SPEED_COLORS[i] }} />
                {label}
              </li>
            ))}
          </ul>
        </section>

        <section className="card px-5 py-5">
          <h2 className="mb-3 font-semibold">Travel Time Comparison</h2>
          <div className="grid grid-cols-3 items-center text-center">
            <div>
              <div className="text-3xl font-bold tabular">{formatDuration(expectedSec)}</div>
              <div className="text-xs text-muted">Expected</div>
            </div>
            <div className={faster ? "text-lime" : "text-danger"}>
              <div className="text-sm font-bold">{faster ? "▼" : "▲"} {formatDiff(diff)}</div>
              <div className="text-xs">{faster ? "Faster" : "Slower"}</div>
            </div>
            <div>
              <div className="text-3xl font-bold tabular">{formatDuration(trip.durationSec)}</div>
              <div className="text-xs text-muted">Actual</div>
            </div>
          </div>
          <p className="mt-3 text-center text-[10px] text-white/30">Expected assumes a typical {Math.round(toUnit(EXPECTED_AVG_KMH, unit))} {unitLabel(unit)} average.</p>
        </section>

      </div>

      <div className="space-y-2 px-4 pt-2">
        <div className="flex gap-2">
          <button
            onClick={share}
            disabled={sharing}
            className="flex-1 rounded-full bg-linear-to-r from-lime to-neon py-4 font-bold tracking-widest text-black uppercase disabled:opacity-60"
          >
            {sharing ? "Preparing image…" : "Share Trip"}
          </button>
          <Link href="/leaderboard" className="flex items-center rounded-full border border-line px-5 text-sm font-semibold text-white/80">
            #{trip.globalRank} global
          </Link>
        </div>
        {shareMessage && <p role="status" className="text-center text-xs text-muted">{shareMessage}</p>}
      </div>

      {isOwner && <VideoOverlay tripId={trip.id} unit={unit} />}
    </div>
  );
}

function Metric({ icon, value, label, gold }: { icon: React.ReactNode; value: string; label: string; gold?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={gold ? "#ffc21a" : "#19e6e6"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {icon}
      </svg>
      <div className={`text-2xl font-bold tabular ${gold ? "text-gold" : ""}`}>{value}</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );
}

function Mini({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="text-lg font-bold tabular">{value}</div>
      <div className="text-[10px] tracking-widest text-muted uppercase">{label}</div>
    </div>
  );
}
