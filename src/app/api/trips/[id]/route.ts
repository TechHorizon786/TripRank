import { getTripDetail } from "@/lib/trips";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: RouteContext<"/api/trips/[id]">) {
  const { id } = await ctx.params;
  const detail = await getTripDetail(id);
  if (!detail) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(detail);
}
