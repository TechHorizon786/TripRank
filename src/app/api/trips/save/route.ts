import { db } from "@/db";
import { trips, users, type TripSample } from "@/db/schema";
import { eq } from "drizzle-orm";
import { submitScore, rankForScore } from "@/lib/leaderboard";
import { accelTime, haversineKm, KMH_PER_MPH } from "@/lib/metrics";

export const dynamic = "force-dynamic";

const MAX_PLAUSIBLE_KMH = 500;

type Payload = {
  user_id?: string;
  speed_array?: unknown;
  samples?: unknown;
  top_speed?: number;
  max_gforce?: number;
  timestamp?: string | number; // trip start
  duration_sec?: number;
  simulated?: boolean;
};

function isNum(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Payload | null;
  if (!body) return Response.json({ error: "invalid JSON" }, { status: 400 });

  const { user_id } = body;
  if (!user_id || !/^[0-9a-f-]{36}$/i.test(user_id))
    return Response.json({ error: "user_id is required" }, { status: 400 });

  const [user] = await db.select().from(users).where(eq(users.id, user_id));
  if (!user) return Response.json({ error: "unknown user" }, { status: 404 });

  if (!Array.isArray(body.speed_array) || body.speed_array.length < 2 || !body.speed_array.every(isNum))
    return Response.json({ error: "speed_array must contain at least 2 numeric samples" }, { status: 400 });
  const speedArray = (body.speed_array as number[]).map((v) => Math.max(0, Math.min(MAX_PLAUSIBLE_KMH, v)));
  if (speedArray.length > 60 * 60 * 24)
    return Response.json({ error: "trip too long" }, { status: 400 });

  const samples: TripSample[] = Array.isArray(body.samples)
    ? (body.samples as TripSample[]).filter(
        (s) => s && isNum(s.lat) && isNum(s.lng) && isNum(s.speed) && isNum(s.t)
      ).map((s) => ({ t: s.t, lat: s.lat, lng: s.lng, speed: s.speed, g: isNum(s.g) ? s.g : 0 }))
    : [];

  // Server is the source of truth: recompute metrics from raw data instead of trusting client aggregates.
  const topSpeedKmh = Math.max(...speedArray);
  if (isNum(body.top_speed) && Math.abs(body.top_speed - topSpeedKmh) > 5) {
    return Response.json({ error: "top_speed does not match speed_array" }, { status: 422 });
  }
  const moving = speedArray.filter((v) => v > 2);
  const avgSpeedKmh = moving.length ? moving.reduce((a, b) => a + b, 0) / moving.length : 0;

  let distanceKm = 0;
  if (samples.length > 1) {
    for (let i = 1; i < samples.length; i++)
      distanceKm += haversineKm(samples[i - 1].lat, samples[i - 1].lng, samples[i].lat, samples[i].lng);
  } else {
    distanceKm = speedArray.reduce((a, v) => a + v / 3600, 0);
  }

  const maxGForce = isNum(body.max_gforce) ? Math.min(Math.max(0, body.max_gforce), 8) : 0;
  const durationSec = isNum(body.duration_sec) ? Math.round(body.duration_sec) : speedArray.length;
  const startedAt = body.timestamp ? new Date(body.timestamp) : new Date(Date.now() - durationSec * 1000);
  if (Number.isNaN(startedAt.getTime())) return Response.json({ error: "invalid timestamp" }, { status: 400 });

  const [trip] = await db
    .insert(trips)
    .values({
      userId: user.id,
      startedAt,
      endedAt: new Date(startedAt.getTime() + durationSec * 1000),
      durationSec,
      distanceKm,
      topSpeedKmh,
      avgSpeedKmh,
      maxGForce,
      zeroToHundredSec: accelTime(speedArray, 100),
      zeroToSixtySec: accelTime(speedArray, 60 * KMH_PER_MPH),
      speedArray,
      samples,
      isSimulated: body.simulated ? 1 : 0,
    })
    .returning();

  await submitScore(user.id, user.country, topSpeedKmh);
  const [globalRank, countryRank] = await Promise.all([
    rankForScore(topSpeedKmh),
    rankForScore(topSpeedKmh, user.country),
  ]);

  return Response.json({ trip: { id: trip.id }, globalRank, countryRank }, { status: 201 });
}
