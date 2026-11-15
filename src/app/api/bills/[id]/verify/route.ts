import { NextResponse } from "next/server";
import { claimTransaction, getBill, getPushes, markPaid } from "@/lib/store";
import { getQrTransactions, getTransaction, type PeyTransaction } from "@/lib/pey";

export const dynamic = "force-dynamic";

// Asks pey directly for every unpaid share. If a webhook was late or lost, the
// payment is still found here. Safe to call many times.
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const bill = await getBill(id);
  if (!bill) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  if (bill.demo) return NextResponse.json({ checked: 0, found: 0 });

  const pending = bill.participants.filter((p) => !bill.payments[p.numRef]);
  let found = 0;
  await Promise.all(
    pending.map(async (p) => {
      let hit: { tx: PeyTransaction; via: "qr" | "pn" } | null = null;
      const qrTx = (await getQrTransactions(p.qrId)).find((t) => t.status === "PAID" && t.amount >= p.amount - 0.005);
      if (qrTx) hit = { tx: qrTx, via: "qr" };
      if (!hit) {
        for (const txId of await getPushes(id, p.numRef)) {
          const t = await getTransaction(txId);
          if (t && t.status === "PAID" && t.amount >= p.amount - 0.005) {
            hit = { tx: t, via: "pn" };
            break;
          }
        }
      }
      if (!hit) return;
      await claimTransaction(hit.tx.id);
      const ok = await markPaid(id, p.numRef, {
        paidAt: (hit.tx.datePaid ?? Date.now() / 1000) * 1000,
        transactionId: hit.tx.id,
        amount: hit.tx.amount,
        via: hit.via,
        source: "consulta",
      });
      if (ok) found++;
    })
  );
  return NextResponse.json({ checked: pending.length, found });
}
