import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getTripDetail } from "@/lib/trips";
import TripSummary, { type TripView } from "@/components/TripSummary";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: PageProps<"/trip/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const d = await getTripDetail(id);
  if (!d) return { title: "Trip not found · TripRank" };
  return {
    title: `${Math.round(d.trip.topSpeedKmh)} km/h · @${d.user.username} · TripRank`,
    description: `${d.trip.distanceKm.toFixed(1)} km · avg ${Math.round(d.trip.avgSpeedKmh)} km/h · #${d.globalRank} global`,
  };
}

export default async function TripPage(props: PageProps<"/trip/[id]">) {
  const { id } = await props.params;
  const d = await getTripDetail(id);
  if (!d) notFound();
  const { trip, user } = d;
  const view: TripView = {
    id: trip.id,
    startedAt: trip.startedAt.toISOString(),
    durationSec: trip.durationSec,
    distanceKm: trip.distanceKm,
    topSpeedKmh: trip.topSpeedKmh,
    avgSpeedKmh: trip.avgSpeedKmh,
    maxGForce: trip.maxGForce,
    zeroToHundredSec: trip.zeroToHundredSec,
    zeroToSixtySec: trip.zeroToSixtySec,
    speedArray: trip.speedArray,
    samples: trip.samples.map((s) => ({ lat: s.lat, lng: s.lng, speed: s.speed })),
    isSimulated: trip.isSimulated === 1,
    user: { id: user.id, username: user.username, country: user.country, car: user.car },
    globalRank: d.globalRank,
    countryRank: d.countryRank,
  };
  return <TripSummary trip={view} />;
}
