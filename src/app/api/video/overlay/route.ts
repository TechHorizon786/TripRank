import { writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { db } from "@/db";
import { videoRenders } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getTripDetail } from "@/lib/trips";
import { ensureStorage, renderOverlay, STORAGE_DIR } from "@/lib/video";
import { formatDistance, formatSpeed, ordinal, toUnit, unitLabel, type Unit } from "@/lib/metrics";
import { isTripMode, TRIP_MODE_DETAILS } from "@/lib/modes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BYTES = 150 * 1024 * 1024;

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  if (!form) return Response.json({ error: "multipart form expected" }, { status: 400 });
  const tripId = String(form.get("tripId") ?? "");
  const unit: Unit = form.get("unit") === "mph" ? "mph" : "kmh";
  const file = form.get("video");
  if (!(file instanceof File) || file.size === 0)
    return Response.json({ error: "video file is required" }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "video too large (max 150MB)" }, { status: 413 });
  if (!file.type.startsWith("video/"))
    return Response.json({ error: "file must be a video" }, { status: 415 });

  const detail = await getTripDetail(tripId);
  if (!detail) return Response.json({ error: "trip not found" }, { status: 404 });

  await ensureStorage();
  const [job] = await db.insert(videoRenders).values({ tripId }).returning();
  const ext = path.extname(file.name).replace(/[^.\w]/g, "") || ".mp4";
  const input = path.join(STORAGE_DIR, "uploads", `${job.id}${ext}`);
  const output = path.join(STORAGE_DIR, "renders", `${job.id}.mp4`);
  await writeFile(input, Buffer.from(await file.arrayBuffer()));

  const { trip, user, countryRank, globalRank } = detail;
  const mode = isTripMode(trip.mode) ? trip.mode : "sports";
  const rankLine = mode !== "sports"
    ? `${TRIP_MODE_DETAILS[mode].label} · ${formatSpeed(trip.avgSpeedKmh, unit)} average`
    : user.country && user.country !== "Global"
      ? `${ordinal(countryRank ?? 0)} fastest in ${user.country}`
      : `${ordinal(globalRank ?? 0)} fastest worldwide`;

  // Fire-and-forget background job; the client polls GET /api/video/:id
  void (async () => {
    try {
      await renderOverlay(input, output, {
        topSpeed: formatSpeed(trip.topSpeedKmh, unit),
        avgSpeed: formatSpeed(trip.avgSpeedKmh, unit),
        maxG: `${trip.maxGForce.toFixed(2)} G`,
        distance: formatDistance(trip.distanceKm, unit),
        rankLine,
        username: user.username,
        unitLabel: unitLabel(unit),
        speedSeries: trip.speedArray.map((v) => toUnit(v, unit)),
      });
      await db.update(videoRenders).set({ status: "done", outputPath: output }).where(eq(videoRenders.id, job.id));
    } catch (e) {
      console.error("[video] render failed", e);
      await db
        .update(videoRenders)
        .set({ status: "failed", error: (e as Error).message.slice(0, 2000) })
        .where(eq(videoRenders.id, job.id));
    } finally {
      unlink(input).catch(() => {});
    }
  })();

  return Response.json({ renderId: job.id, status: "processing" }, { status: 202 });
}
