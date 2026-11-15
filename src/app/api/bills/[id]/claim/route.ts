import { NextResponse } from "next/server";
import { claimSeat, getBill, releaseSeat } from "@/lib/store";
import { isWaiter } from "@/lib/pin";

export const dynamic = "force-dynamic";

// A guest takes a seat on their own phone ("en proceso"), or lets it go.
// Body: { numRef, release?: true }. The phone is identified by the x-guest-token header.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { numRef, release } = (await req.json()) as { numRef?: string; release?: boolean };
  const token = req.headers.get("x-guest-token");
  const bill = await getBill(id);
  if (!bill) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  const p = bill.participants.find((x) => x.numRef === numRef);
  if (!p) return NextResponse.json({ error: "Lugar no encontrado" }, { status: 404 });

  if (release) {
    await releaseSeat(id, p.numRef, token, isWaiter(req));
    return NextResponse.json({ ok: true });
  }
  if (!token || token.length < 16) return NextResponse.json({ error: "Falta el identificador del celular" }, { status: 400 });
  if (bill.payments[p.numRef]) return NextResponse.json({ error: "Este lugar ya está pagado" }, { status: 409 });
  if (!(await claimSeat(id, p.numRef, token))) {
    return NextResponse.json({ error: "Alguien más está pagando este lugar" }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
