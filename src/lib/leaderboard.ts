import "server-only";
import Redis from "ioredis";
import { db } from "@/db";
import { trips, users } from "@/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";

/**
 * Redis-backed real-time leaderboard.
 *
 * Keys:
 *   lb:top_speed:global            ZSET  member=user_id  score=best top speed (km/h)
 *   lb:top_speed:country:<country> ZSET  same, partitioned by country
 *
 * When REDIS_URL is not configured (or Redis is unreachable) every operation
 * transparently falls back to an equivalent PostgreSQL aggregate query, so the
 * app keeps working in any environment.
 */

const GLOBAL_KEY = "lb:top_speed:global";
const countryKey = (c: string) => `lb:top_speed:country:${c.toLowerCase()}`;

export type LeaderboardEntry = {
  rank: number;
  userId: string;
  username: string;
  country: string;
  car: string | null;
  topSpeedKmh: number;
};

const g = globalThis as typeof globalThis & { __tripRankRedis?: Redis | null };

function getRedis(): Redis | null {
  if (g.__tripRankRedis !== undefined) return g.__tripRankRedis;
  const url = process.env.REDIS_URL;
  if (!url) {
    g.__tripRankRedis = null;
    return null;
  }
  const client = new Redis(url, {
    lazyConnect: false,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: 2000,
  });
  client.on("error", (e) => console.warn("[leaderboard] redis error:", e.message));
  g.__tripRankRedis = client;
  return client;
}

async function withRedis<T>(fn: (r: Redis) => Promise<T>): Promise<T | undefined> {
  const r = getRedis();
  if (!r || r.status !== "ready") return undefined;
  try {
    return await fn(r);
  } catch (e) {
    console.warn("[leaderboard] redis op failed, falling back to postgres:", (e as Error).message);
    return undefined;
  }
}

export function leaderboardBackend(): "redis" | "postgres" {
  const r = getRedis();
  return r && r.status === "ready" ? "redis" : "postgres";
}

/** ZADD GT — only overwrites the score when the new top speed beats the stored personal best. */
export async function submitScore(userId: string, country: string, topSpeedKmh: number) {
  await withRedis(async (r) => {
    await r
      .multi()
      .zadd(GLOBAL_KEY, "GT", topSpeedKmh, userId)
      .zadd(countryKey(country), "GT", topSpeedKmh, userId)
      .exec();
  });
}

/** Rebuilds Redis sets from Postgres when they are empty (cold start / flushed cache). */
async function ensureHydrated(r: Redis, key: string, country?: string) {
  const size = await r.zcard(key);
  if (size > 0) return;
  const rows = await bestPerUserQuery(1000, country);
  if (rows.length === 0) return;
  const args: (string | number)[] = [];
  for (const row of rows) args.push(row.topSpeedKmh, row.userId);
  await r.zadd(key, ...args);
}

function bestPerUserQuery(limit: number, country?: string) {
  const best = sql<number>`max(${trips.topSpeedKmh})`;
  const q = db
    .select({
      userId: users.id,
      username: users.username,
      country: users.country,
      car: users.car,
      topSpeedKmh: best.mapWith(Number),
    })
    .from(trips)
    .innerJoin(users, eq(users.id, trips.userId))
    .where(and(eq(trips.mode, "sports"), country ? eq(users.country, country) : undefined))
    .groupBy(users.id)
    .orderBy(desc(best))
    .limit(limit);
  return q;
}

/** Top N via ZREVRANGEBYSCORE key +inf -inf WITHSCORES LIMIT 0 N */
export async function getTop(limit = 50, country?: string): Promise<LeaderboardEntry[]> {
  const key = country ? countryKey(country) : GLOBAL_KEY;
  const fromRedis = await withRedis(async (r) => {
    await ensureHydrated(r, key, country);
    const raw = await r.zrevrangebyscore(key, "+inf", "-inf", "WITHSCORES", "LIMIT", 0, limit);
    const pairs: { userId: string; score: number }[] = [];
    for (let i = 0; i < raw.length; i += 2) pairs.push({ userId: raw[i], score: Number(raw[i + 1]) });
    if (pairs.length === 0) return [];
    const profiles = await db
      .select()
      .from(users)
      .where(sql`${users.id} in (${sql.join(pairs.map((p) => sql`${p.userId}`), sql`, `)})`);
    const byId = new Map(profiles.map((p) => [p.id, p]));
    return pairs
      .filter((p) => byId.has(p.userId))
      .map((p, i) => {
        const u = byId.get(p.userId)!;
        return {
          rank: i + 1,
          userId: p.userId,
          username: u.username,
          country: u.country,
          car: u.car,
          topSpeedKmh: p.score,
        };
      });
  });
  if (fromRedis) return fromRedis;

  const rows = await bestPerUserQuery(limit, country);
  return rows.map((r, i) => ({ rank: i + 1, ...r }));
}

/** Rank a given score would hold = 1 + number of users with a strictly higher best (ZCOUNT (score +inf). */
export async function rankForScore(topSpeedKmh: number, country?: string): Promise<number> {
  const key = country ? countryKey(country) : GLOBAL_KEY;
  const fromRedis = await withRedis(async (r) => {
    await ensureHydrated(r, key, country);
    const higher = await r.zcount(key, `(${topSpeedKmh}`, "+inf");
    return higher + 1;
  });
  if (fromRedis !== undefined) return fromRedis;

  const res = await db.execute<{ higher: string }>(sql`
    select count(*)::text as higher from (
      select t.user_id, max(t.top_speed_kmh) as best
      from trips t join users u on u.id = t.user_id
      where t.mode = 'sports' ${country ? sql`and u.country = ${country}` : sql``}
      group by t.user_id
    ) b where b.best > ${topSpeedKmh}
  `);
  return Number(res.rows[0]?.higher ?? 0) + 1;
}

export async function totalRanked(country?: string): Promise<number> {
  const key = country ? countryKey(country) : GLOBAL_KEY;
  const fromRedis = await withRedis(async (r) => {
    await ensureHydrated(r, key, country);
    return r.zcard(key);
  });
  if (fromRedis !== undefined) return fromRedis;
  const res = await db.execute<{ n: string }>(sql`
    select count(distinct t.user_id)::text as n from trips t join users u on u.id = t.user_id
    where t.mode = 'sports' ${country ? sql`and u.country = ${country}` : sql``}
  `);
  return Number(res.rows[0]?.n ?? 0);
}
