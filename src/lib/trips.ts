import "server-only";
import { db } from "@/db";
import { trips, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { rankForScore } from "@/lib/leaderboard";
import { isTripMode } from "@/lib/modes";

const UUID_RE = /^[0-9a-f-]{36}$/i;

export async function getTripDetail(id: string) {
  if (!UUID_RE.test(id)) return null;
  const rows = await db
    .select({ trip: trips, user: users })
    .from(trips)
    .innerJoin(users, eq(users.id, trips.userId))
    .where(eq(trips.id, id));
  const row = rows[0];
  if (!row) return null;
  const [globalRank, countryRank] = isTripMode(row.trip.mode) && row.trip.mode === "sports"
    ? await Promise.all([
        rankForScore(row.trip.topSpeedKmh),
        rankForScore(row.trip.topSpeedKmh, row.user.country),
      ])
    : [null, null];
  return { ...row, globalRank, countryRank };
}

export type TripDetail = NonNullable<Awaited<ReturnType<typeof getTripDetail>>>;
