/**
 * Express API entrypoint (reference implementation for a standalone Node backend).
 *   npm i express ioredis pg multer zod ffmpeg-static && npm i -D @types/express @types/multer
 */
import express from "express";
import multer from "multer";
import { z } from "zod";
import { pool } from "./db/pool";
import { getLeaderboard, getMyRank, recordTopSpeed, rankFor } from "./controllers/leaderboard.controller";
import { renderOverlay } from "./services/videoOverlay.service"; // same filtergraph as src/lib/video.ts

const app = express();
app.use(express.json({ limit: "10mb" }));

const TripSchema = z.object({
  user_id: z.string().uuid(),
  speed_array: z.array(z.number().min(0).max(500)).min(2).max(86400),
  samples: z.array(z.object({ t: z.number(), lat: z.number(), lng: z.number(), speed: z.number(), g: z.number() })).default([]),
  top_speed: z.number(),
  max_gforce: z.number().min(0).max(8),
  timestamp: z.coerce.date(),
  duration_sec: z.number().int().positive().optional(),
});

app.post("/api/trips/save", async (req, res, next) => {
  try {
    const p = TripSchema.parse(req.body);
    const { rows: [user] } = await pool.query("select * from users where id = $1", [p.user_id]);
    if (!user) return res.status(404).json({ error: "unknown user" });

    const top = Math.max(...p.speed_array);
    if (Math.abs(top - p.top_speed) > 5) return res.status(422).json({ error: "top_speed mismatch" });
    const moving = p.speed_array.filter((v) => v > 2);
    const avg = moving.reduce((a, b) => a + b, 0) / (moving.length || 1);
    const duration = p.duration_sec ?? p.speed_array.length;
    const distance = p.speed_array.reduce((a, v) => a + v / 3600, 0);

    const { rows: [trip] } = await pool.query(
      `insert into trips (user_id, started_at, ended_at, duration_sec, distance_km, top_speed_kmh, avg_speed_kmh, max_gforce, speed_array, samples)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`,
      [user.id, p.timestamp, new Date(p.timestamp.getTime() + duration * 1000), duration, distance, top, avg, p.max_gforce,
        JSON.stringify(p.speed_array), JSON.stringify(p.samples)]
    );
    await recordTopSpeed(user, top);
    res.status(201).json({ trip, globalRank: await rankFor(user.id), countryRank: await rankFor(user.id, user.country) });
  } catch (e) {
    next(e);
  }
});

app.get("/api/leaderboard", getLeaderboard);
app.get("/api/leaderboard/me/:userId", getMyRank);

const upload = multer({ dest: "/tmp/uploads", limits: { fileSize: 150 * 1024 * 1024 } });
app.post("/api/video/overlay", upload.single("video"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "video required" });
    const out = `/tmp/renders/${req.file.filename}.mp4`;
    // In production push this to a BullMQ queue; workers run FFmpeg and upload to S3.
    await renderOverlay(req.file.path, out, req.body);
    res.download(out);
  } catch (e) {
    next(e);
  }
});

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err?.name === "ZodError") return res.status(400).json({ error: "invalid payload", issues: err.issues });
  console.error(err);
  res.status(500).json({ error: "internal error" });
});

app.listen(Number(process.env.PORT ?? 4000), () => console.log("TripRank API listening"));
