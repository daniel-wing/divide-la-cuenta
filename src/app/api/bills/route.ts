import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createCodiQr, demoMode } from "@/lib/pey";
import { reserveNumRef, saveBill } from "@/lib/store";
import type { Bill, Participant } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Split a total into equal parts in cents; leftover cents go to the first people. */
function split(total: number, n: number): number[] {
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / n);
  const rest = cents - base * n;
  return Array.from({ length: n }, (_, i) => (base + (i < rest ? 1 : 0)) / 100);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { concept?: string; total?: number; names?: string[] };
    const concept = (body.concept ?? "").trim() || "Cuenta compartida";
    const total = Number(body.total);
    const names = (body.names ?? []).map((n) => n.trim()).filter(Boolean);

    if (!Number.isFinite(total) || total <= 0) {
      return NextResponse.json({ error: "El total debe ser mayor a 0" }, { status: 400 });
    }
    if (names.length < 2 || names.length > 20) {
      return NextResponse.json({ error: "Agrega entre 2 y 20 personas" }, { status: 400 });
    }
    const amounts = split(total, names.length);
    if (amounts.some((a) => a < 0.01)) {
      return NextResponse.json({ error: "Cada persona debe pagar al menos $0.01" }, { status: 400 });
    }

    const id = randomUUID().slice(0, 8);
    const participants: Participant[] = await Promise.all(
      names.map(async (name, i) => {
        const numRef = await reserveNumRef(id);
        const qr = await createCodiQr({
          amount: amounts[i],
          concept: `${concept} - ${name}`,
          numRef,
          metadata: { billId: id, name },
        });
        return { name, amount: amounts[i], numRef, qrId: qr.id, qrString: qr.qrString };
      })
    );

    const bill: Bill = { id, concept, total, createdAt: Date.now(), demo: demoMode, participants };
    await saveBill(bill);
    return NextResponse.json({ id });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
