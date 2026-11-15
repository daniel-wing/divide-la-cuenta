import { NextResponse } from "next/server";
import { getTableBill } from "@/lib/store";
import { TABLE_COUNT } from "@/lib/restaurant";

export const dynamic = "force-dynamic";

// The printed QR on each table opens /mesa/N. This tells that page which bill is open there, if any.
export async function GET(_req: Request, ctx: { params: Promise<{ table: string }> }) {
  const { table } = await ctx.params;
  const n = Math.round(Number(table));
  if (!(n >= 1 && n <= TABLE_COUNT)) return NextResponse.json({ error: "Mesa no válida" }, { status: 404 });
  const bill = await getTableBill(n);
  return NextResponse.json({ table: n, billId: bill?.id ?? null }, { headers: { "Cache-Control": "no-store" } });
}
