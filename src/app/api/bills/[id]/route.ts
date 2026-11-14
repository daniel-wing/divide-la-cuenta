import { NextResponse } from "next/server";
import { getBill } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const bill = await getBill(id);
  if (!bill) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  return NextResponse.json(bill, { headers: { "Cache-Control": "no-store" } });
}
