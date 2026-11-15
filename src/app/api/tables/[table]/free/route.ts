import { NextResponse } from "next/server";
import { clearTableBill } from "@/lib/store";
import { TABLE_COUNT } from "@/lib/restaurant";

export const dynamic = "force-dynamic";

// Frees a table once its bill is settled (or to discard a test bill).
export async function POST(_req: Request, { params }: { params: Promise<{ table: string }> }) {
  const n = Number((await params).table);
  if (!Number.isInteger(n) || n < 1 || n > TABLE_COUNT) return NextResponse.json({ error: "Mesa no válida" }, { status: 400 });
  await clearTableBill(n);
  return NextResponse.json({ ok: true });
}
