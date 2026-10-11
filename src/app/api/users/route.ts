import { db } from "@/db";
import { users } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { username?: string; country?: string; car?: string }
    | null;
  const username = body?.username?.trim().slice(0, 24);
  if (!username) return Response.json({ error: "username is required" }, { status: 400 });
  const country = body?.country?.trim().slice(0, 40) || "Global";
  const car = body?.car?.trim().slice(0, 40) || null;
  const [user] = await db.insert(users).values({ username, country, car }).returning();
  return Response.json({ user }, { status: 201 });
}
