import { NextResponse } from "next/server";
import { getBill, markPaid } from "@/lib/store";
import { isWaiter } from "@/lib/pin";

export const dynamic = "force-dynamic";

// Waiter marks a guest as paid outside CoDi (cash or card terminal).
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { numRef, method } = (await req.json()) as { numRef: string; method: string };
  if (method !== "efectivo" && method !== "tarjeta") {
    return NextResponse.json({ error: "Método no válido" }, { status: 400 });
  }
  const bill = await getBill(id);
  if (!bill) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  // In a restaurant only the waiter can mark cash or card.
  if (bill.table && !isWaiter(req)) return NextResponse.json({ error: "Solo el mesero puede marcar este pago" }, { status: 401 });
  const p = bill.participants.find((x) => x.numRef === numRef);
  if (!p) return NextResponse.json({ error: "Persona no encontrada" }, { status: 404 });
  const ok = await markPaid(id, numRef, {
    paidAt: Date.now(),
    transactionId: `${method}-${numRef}`,
    amount: p.amount,
    method,
  });
  return NextResponse.json({ ok, alreadyPaid: !ok });
}
