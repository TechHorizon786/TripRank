import { createReadStream, statSync } from "node:fs";
import { Readable } from "node:stream";
import { db } from "@/db";
import { videoRenders } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request, ctx: RouteContext<"/api/video/[id]/file">) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("not found", { status: 404 });
  const [job] = await db.select().from(videoRenders).where(eq(videoRenders.id, id));
  if (!job || job.status !== "done" || !job.outputPath) return new Response("not found", { status: 404 });

  let size: number;
  try {
    size = statSync(job.outputPath).size;
  } catch {
    return new Response("file expired", { status: 410 });
  }

  const download = new URL(req.url).searchParams.has("download");
  const baseHeaders: Record<string, string> = {
    "Content-Type": "video/mp4",
    "Accept-Ranges": "bytes",
    ...(download ? { "Content-Disposition": `attachment; filename="triprank-${id.slice(0, 8)}.mp4"` } : {}),
  };

  const range = req.headers.get("range");
  if (range) {
    const m = range.match(/bytes=(\d*)-(\d*)/);
    const start = m && m[1] ? Number(m[1]) : 0;
    const end = m && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
    if (start >= size || start > end)
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    const stream = Readable.toWeb(createReadStream(job.outputPath, { start, end })) as ReadableStream;
    return new Response(stream, {
      status: 206,
      headers: { ...baseHeaders, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) },
    });
  }
  const stream = Readable.toWeb(createReadStream(job.outputPath)) as ReadableStream;
  return new Response(stream, { headers: { ...baseHeaders, "Content-Length": String(size) } });
}
