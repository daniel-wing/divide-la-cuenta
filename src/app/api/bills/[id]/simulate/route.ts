import { NextResponse } from "next/server";
import { getBill, markPaid } from "@/lib/store";

export const dynamic = "force-dynamic";

// Only for bills created in demo mode (no pey key): pretends a payment arrived.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { numRef } = (await req.json()) as { numRef: string };
  const bill = await getBill(id);
  if (!bill) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  if (!bill.demo) return NextResponse.json({ error: "Solo disponible en modo demo" }, { status: 403 });
  const p = bill.participants.find((x) => x.numRef === numRef);
  if (!p) return NextResponse.json({ error: "Persona no encontrada" }, { status: 404 });
  await markPaid(id, numRef, { paidAt: Date.now(), transactionId: `demo-${numRef}`, amount: p.amount });
  return NextResponse.json({ ok: true });
}
