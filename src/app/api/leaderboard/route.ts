import { getTop, leaderboardBackend, totalRanked } from "@/lib/leaderboard";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const country = url.searchParams.get("country") || undefined;
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit")) || 50));
  const [entries, total] = await Promise.all([getTop(limit, country), totalRanked(country)]);
  return Response.json({ backend: leaderboardBackend(), country: country ?? "Global", total, entries });
}
