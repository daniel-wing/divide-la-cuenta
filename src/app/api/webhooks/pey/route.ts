import { NextResponse } from "next/server";
import { Webhook } from "standardwebhooks";
import { billIdForRef, claimTransaction, getBill, markPaid } from "@/lib/store";

export const dynamic = "force-dynamic";

type QrPaymentEvent = {
  type: string;
  amount: number;
  codiQrId: string;
  numRef: string;
  transactionId: string;
  datePaid: number; // unix seconds
};

// pey calls this when a CoDi QR is paid. Payment is confirmed here on the
// server, never in the browser.
export async function POST(req: Request) {
  const raw = await req.text();
  const secret = process.env.PEY_WEBHOOK_SECRET;

  let event: QrPaymentEvent;
  try {
    if (secret) {
      const headers = {
        "webhook-id": req.headers.get("webhook-id") ?? "",
        "webhook-timestamp": req.headers.get("webhook-timestamp") ?? "",
        "webhook-signature": req.headers.get("webhook-signature") ?? "",
      };
      event = new Webhook(secret).verify(raw, headers) as QrPaymentEvent;
    } else {
      console.warn("PEY_WEBHOOK_SECRET not set: webhook signature NOT verified");
      event = JSON.parse(raw);
    }
  } catch (err) {
    console.error("Invalid webhook signature", err);
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  console.log("pey webhook", event.type, event.numRef, event.transactionId);
  if (event.type !== "codi.qr.payment_received") return NextResponse.json({ ignored: true });

  const billId = await billIdForRef(String(event.numRef));
  if (!billId) return NextResponse.json({ ignored: "unknown numRef" });
  const bill = await getBill(billId);
  const p = bill?.participants.find((x) => x.numRef === String(event.numRef));
  if (!bill || !p) return NextResponse.json({ ignored: "unknown participant" });

  // Same payment delivered twice? Process it only once.
  if (!(await claimTransaction(event.transactionId))) return NextResponse.json({ duplicate: true });

  await markPaid(billId, p.numRef, {
    paidAt: (event.datePaid ?? Date.now() / 1000) * 1000,
    transactionId: event.transactionId,
    amount: event.amount,
    receivedAt: Date.now(),
  });
  return NextResponse.json({ ok: true });
}
