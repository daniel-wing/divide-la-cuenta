import { NextResponse } from "next/server";
import { addPush, getBill, getClaims, getPushes } from "@/lib/store";
import { isWaiter } from "@/lib/pin";
import { createCodiPush } from "@/lib/pey";

export const dynamic = "force-dynamic";

const MAX_PUSHES = 3; // per guest, so nobody can spam a phone

// A guest asks to get their charge inside their bank app (CoDi por notificación)
// instead of scanning the QR. The phone number is sent to pey and never stored.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json()) as { numRef?: string; phone?: string };
  const phone = String(body.phone ?? "").replace(/\D/g, "");
  if (phone.length !== 10) return NextResponse.json({ error: "Escribe tu celular a 10 dígitos" }, { status: 400 });
  const bill = await getBill(id);
  if (!bill) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  const p = bill.participants.find((x) => x.numRef === body.numRef);
  if (!p) return NextResponse.json({ error: "Persona no encontrada" }, { status: 404 });
  if (bill.payments[p.numRef]) return NextResponse.json({ error: "Esta parte ya está pagada" }, { status: 409 });
  // If another phone is paying this seat, only that phone (or the waiter) can send its charge.
  const claim = (await getClaims(bill))[p.numRef];
  if (claim && claim.token !== req.headers.get("x-guest-token") && !isWaiter(req)) {
    return NextResponse.json({ error: "Alguien más está pagando este lugar" }, { status: 409 });
  }
  if ((await getPushes(id, p.numRef)).length >= MAX_PUSHES) {
    return NextResponse.json({ error: "Ya se enviaron varios cobros a este lugar. Usa el QR." }, { status: 429 });
  }
  try {
    const { transactionId } = await createCodiPush({
      amount: p.amount,
      phoneNumber: phone,
      concept: bill.participants.length > 1 ? `${bill.concept} - ${p.name}` : bill.concept,
      numRef: p.numRef,
      metadata: { billId: id, name: p.name },
    });
    await addPush(id, p.numRef, transactionId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "No se pudo enviar el cobro a ese celular. Usa el QR." }, { status: 502 });
  }
}
