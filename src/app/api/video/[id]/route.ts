import { db } from "@/db";
import { videoRenders } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: RouteContext<"/api/video/[id]">) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "not found" }, { status: 404 });
  const [job] = await db.select().from(videoRenders).where(eq(videoRenders.id, id));
  if (!job) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({
    id: job.id,
    status: job.status,
    error: job.error,
    url: job.status === "done" ? `/api/video/${job.id}/file` : null,
  });
}
