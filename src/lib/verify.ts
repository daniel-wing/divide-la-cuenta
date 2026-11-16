import { claimTransaction, getBill, getPushes, markPaid, tryLock } from "./store";
import { getQrTransactions, getTransaction, type PeyTransaction } from "./pey";

/** Minimum time between two re-checks of the same bill against pey, whoever asks. */
export const VERIFY_GAP_SECONDS = 3;

export type VerifyResult = {
  checked: number; // unpaid seats asked about
  found: number; // payments found and marked now
  errors: number; // seats pey could not answer for (retried, will be asked again next time)
  skipped?: boolean; // someone else asked less than VERIFY_GAP_SECONDS ago
};

const covers = (t: PeyTransaction, amount: number) => t.status === "PAID" && t.amount >= amount - 0.005;

/**
 * Asks pey directly for every unpaid seat of a bill. If a webhook was late or lost, the payment
 * is still found here. Safe to call many times and from many phones: calls closer than
 * VERIFY_GAP_SECONDS share one check. One seat failing never stops the others.
 */
export async function verifyBill(id: string): Promise<VerifyResult | null> {
  const bill = await getBill(id);
  if (!bill) return null;
  if (bill.demo) return { checked: 0, found: 0, errors: 0 };
  const pending = bill.participants.filter((p) => !bill.payments[p.numRef]);
  if (pending.length === 0) return { checked: 0, found: 0, errors: 0 };
  if (!(await tryLock(`verify:${id}`, VERIFY_GAP_SECONDS))) return { checked: 0, found: 0, errors: 0, skipped: true };

  const results = await Promise.allSettled(
    pending.map(async (p) => {
      let hit: { tx: PeyTransaction; via: "qr" | "pn" } | null = null;
      let failure: unknown = null;
      try {
        const qrTx = (await getQrTransactions(p.qrId)).find((t) => covers(t, p.amount));
        if (qrTx) hit = { tx: qrTx, via: "qr" };
      } catch (err) {
        failure = err; // keep going: the push charges may still answer
      }
      if (!hit) {
        for (const txId of await getPushes(id, p.numRef)) {
          try {
            const t = await getTransaction(txId);
            if (t && covers(t, p.amount)) {
              hit = { tx: t, via: "pn" };
              break;
            }
          } catch (err) {
            failure = err;
          }
        }
      }
      if (!hit) {
        if (failure) throw failure;
        return false;
      }
      // Mark the seat first, then record the transaction, so a failure in between never hides a payment.
      const ok = await markPaid(id, p.numRef, {
        paidAt: (hit.tx.datePaid ?? Date.now() / 1000) * 1000,
        transactionId: hit.tx.id,
        amount: hit.tx.amount,
        via: hit.via,
        source: "consulta",
      });
      await claimTransaction(hit.tx.id);
      return ok;
    })
  );

  let found = 0;
  let errors = 0;
  for (const r of results) {
    if (r.status === "fulfilled") found += r.value ? 1 : 0;
    else {
      errors++;
      console.error("verify: pey could not be asked", id, r.reason);
    }
  }
  return { checked: pending.length, found, errors };
}
