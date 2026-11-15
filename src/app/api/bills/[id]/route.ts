import { NextResponse } from "next/server";
import { getBill, getClaims } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const bill = await getBill(id);
  if (!bill) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  const token = req.headers.get("x-guest-token");
  const raw = await getClaims(bill);
  const claims: Record<string, number> = {};
  const mine: string[] = [];
  for (const [ref, c] of Object.entries(raw)) {
    if (bill.payments[ref]) continue; // a paid seat is never "en proceso"
    claims[ref] = c.until;
    if (token && c.token === token) mine.push(ref);
  }
  return NextResponse.json({ ...bill, claims, mine }, { headers: { "Cache-Control": "no-store" } });
}
