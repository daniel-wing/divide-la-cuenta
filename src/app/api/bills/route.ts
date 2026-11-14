import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createCodiQr, demoMode } from "@/lib/pey";
import { reserveNumRef, saveBill, setTableBill } from "@/lib/store";
import { TABLE_COUNT } from "@/lib/restaurant";
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
    const body = (await req.json()) as {
      concept?: string;
      subtotal?: number;
      total?: number; // older clients
      tipPct?: number;
      table?: number;
      names?: string[];
    };
    const table = body.table ? Math.round(Number(body.table)) : undefined;
    if (table !== undefined && (table < 1 || table > TABLE_COUNT)) {
      return NextResponse.json({ error: "Mesa no válida" }, { status: 400 });
    }
    const concept = (body.concept ?? "").trim() || (table ? `Mesa ${table}` : "Cuenta compartida");
    const subtotal = Number(body.subtotal ?? body.total);
    const tipPct = Math.max(0, Math.min(100, Number(body.tipPct ?? 0) || 0));
    let names = (body.names ?? []).map((n) => n.trim()).filter(Boolean);
    if (names.length === 0) names = ["Cliente"];

    if (!Number.isFinite(subtotal) || subtotal <= 0) {
      return NextResponse.json({ error: "El total debe ser mayor a 0" }, { status: 400 });
    }
    if (names.length > 20) {
      return NextResponse.json({ error: "Máximo 20 personas" }, { status: 400 });
    }
    const total = Math.round(subtotal * (1 + tipPct / 100) * 100) / 100;
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
          concept: names.length > 1 ? `${concept} - ${name}` : concept,
          numRef,
          metadata: { billId: id, name },
        });
        return { name, amount: amounts[i], numRef, qrId: qr.id, qrString: qr.qrString };
      })
    );

    const bill: Bill = {
      id,
      concept,
      subtotal,
      tipPct,
      total,
      table,
      createdAt: Date.now(),
      demo: demoMode,
      participants,
    };
    await saveBill(bill);
    if (table) await setTableBill(table, id);
    return NextResponse.json({ id });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
