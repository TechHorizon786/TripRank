/**
 * Redis Leaderboard Controller (Express + ioredis)
 *
 * Data model
 *   ZSET lb:top_speed:global                 member=user_id score=personal-best top speed (km/h)
 *   ZSET lb:top_speed:country:<country>      same, per country
 *   HASH user:<id>                           cached profile {username,country,car} (avoids a PG hit per row)
 *
 * Complexity: ZADD O(log N), ZREVRANGEBYSCORE O(log N + M), ZREVRANK O(log N)
 */
import type { Request, Response, NextFunction } from "express";
import Redis from "ioredis";
import { pool } from "../db/pool";

export const redis = new Redis(process.env.REDIS_URL ?? "redis://127.0.0.1:6379", {
  maxRetriesPerRequest: 2,
  enableAutoPipelining: true,
});

const GLOBAL = "lb:top_speed:global";
const byCountry = (c: string) => `lb:top_speed:country:${c.toLowerCase()}`;

/** Called by the trips controller after a trip is persisted. ZADD GT keeps only personal bests. */
export async function recordTopSpeed(user: { id: string; username: string; country: string; car: string | null }, topSpeedKmh: number) {
  await redis
    .multi()
    .zadd(GLOBAL, "GT", topSpeedKmh, user.id)
    .zadd(byCountry(user.country), "GT", topSpeedKmh, user.id)
    .hset(`user:${user.id}`, { username: user.username, country: user.country, car: user.car ?? "" })
    .exec();
}

export async function rankFor(userId: string, country?: string) {
  const r = await redis.zrevrank(country ? byCountry(country) : GLOBAL, userId);
  return r === null ? null : r + 1;
}

/** GET /api/leaderboard?country=Germany&limit=50 */
export async function getLeaderboard(req: Request, res: Response, next: NextFunction) {
  try {
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 50));
    const country = typeof req.query.country === "string" && req.query.country ? req.query.country : undefined;
    const key = country ? byCountry(country) : GLOBAL;

    // Top N, highest score first
    const raw = await redis.zrevrangebyscore(key, "+inf", "-inf", "WITHSCORES", "LIMIT", 0, limit);

    const ids: string[] = [];
    const scores: number[] = [];
    for (let i = 0; i < raw.length; i += 2) {
      ids.push(raw[i]);
      scores.push(Number(raw[i + 1]));
    }

    // Hydrate profiles from the Redis hash cache in one pipeline
    const pipe = redis.pipeline();
    ids.forEach((id) => pipe.hgetall(`user:${id}`));
    const profiles = ((await pipe.exec()) ?? []).map(([, v]) => v as Record<string, string>);

    // Cache misses → fall back to Postgres
    const missing = ids.filter((_, i) => !profiles[i]?.username);
    if (missing.length) {
      const { rows } = await pool.query("select id, username, country, car from users where id = any($1)", [missing]);
      for (const row of rows) {
        const i = ids.indexOf(row.id);
        profiles[i] = row;
        redis.hset(`user:${row.id}`, { username: row.username, country: row.country, car: row.car ?? "" });
      }
    }

    const entries = ids.map((id, i) => ({
      rank: i + 1,
      userId: id,
      username: profiles[i]?.username ?? "unknown",
      country: profiles[i]?.country ?? "Global",
      car: profiles[i]?.car || null,
      topSpeedKmh: scores[i],
    }));

    const total = await redis.zcard(key);
    res.set("Cache-Control", "public, max-age=5").json({ country: country ?? "Global", total, entries });
  } catch (e) {
    next(e);
  }
}

/** GET /api/leaderboard/me/:userId — personal global + country rank */
export async function getMyRank(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = req.params;
    const country = await redis.hget(`user:${userId}`, "country");
    const [global, local, best] = await Promise.all([
      rankFor(userId),
      country ? rankFor(userId, country) : Promise.resolve(null),
      redis.zscore(GLOBAL, userId),
    ]);
    res.json({ userId, globalRank: global, countryRank: local, country, bestKmh: best ? Number(best) : null });
  } catch (e) {
    next(e);
  }
}

/** Rebuild sorted sets from Postgres (run on deploy / after FLUSHALL). */
export async function rebuildLeaderboards() {
  const { rows } = await pool.query(
    `select u.id, u.username, u.country, u.car, max(t.top_speed_kmh) as best
     from trips t join users u on u.id = t.user_id group by u.id`
  );
  const pipe = redis.pipeline();
  pipe.del(GLOBAL);
  for (const r of rows) {
    pipe.zadd(GLOBAL, r.best, r.id);
    pipe.zadd(byCountry(r.country), r.best, r.id);
    pipe.hset(`user:${r.id}`, { username: r.username, country: r.country, car: r.car ?? "" });
  }
  await pipe.exec();
  return rows.length;
}
