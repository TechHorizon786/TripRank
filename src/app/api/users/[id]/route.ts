import { db } from "@/db";
import { trips, users } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f-]{36}$/i;

export async function GET(_req: Request, ctx: RouteContext<"/api/users/[id]">) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return Response.json({ error: "not found" }, { status: 404 });
  const [user] = await db.select().from(users).where(eq(users.id, id));
  if (!user) return Response.json({ error: "not found" }, { status: 404 });
  const history = await db
    .select({
      id: trips.id,
      startedAt: trips.startedAt,
      durationSec: trips.durationSec,
      distanceKm: trips.distanceKm,
      topSpeedKmh: trips.topSpeedKmh,
      avgSpeedKmh: trips.avgSpeedKmh,
      maxGForce: trips.maxGForce,
      isSimulated: trips.isSimulated,
      mode: trips.mode,
    })
    .from(trips)
    .where(eq(trips.userId, id))
    .orderBy(desc(trips.startedAt))
    .limit(100);
  return Response.json({ user, trips: history });
}
