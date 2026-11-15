import { NextResponse } from "next/server";
import { Webhook } from "standardwebhooks";
import { billIdForRef, claimTransaction, getBill, markPaid } from "@/lib/store";
import { demoMode } from "@/lib/pey";

export const dynamic = "force-dynamic";

type QrPaymentEvent = {
  type: string;
  amount: number;
  codiQrId: string;
  numRef: string;
  transactionId: string;
  datePaid: number; // unix seconds
};

// pey calls this when a CoDi charge (QR or push notification) is paid. Payment is confirmed here on the
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
    } else if (demoMode) {
      event = JSON.parse(raw); // local testing only
    } else {
      // With a real pey key we never accept an unsigned webhook.
      console.error("PEY_WEBHOOK_SECRET not set: webhook rejected");
      return NextResponse.json({ error: "webhook secret not configured" }, { status: 503 });
    }
  } catch (err) {
    console.error("Invalid webhook signature", err);
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  console.log("pey webhook", event.type, event.numRef, event.transactionId);
  // CoDi paid by scanning the QR, or by accepting the push notification in the bank app.
  const via = event.type === "codi.qr.payment_received" ? "qr" : event.type === "codi.pn.payment_received" ? "pn" : null;
  if (!via) return NextResponse.json({ ignored: true });

  const billId = await billIdForRef(String(event.numRef));
  if (!billId) return NextResponse.json({ ignored: "unknown numRef" });
  const bill = await getBill(billId);
  const p = bill?.participants.find((x) => x.numRef === String(event.numRef));
  if (!bill || !p) return NextResponse.json({ ignored: "unknown participant" });

  // The amount must cover this guest's share.
  if (Number(event.amount) < p.amount - 0.005) {
    console.error("pey webhook: amount below the share", event.amount, p.amount, event.transactionId);
    return NextResponse.json({ ignored: "amount mismatch" });
  }

  // Same payment delivered twice? Process it only once.
  if (!(await claimTransaction(event.transactionId))) return NextResponse.json({ duplicate: true });

  await markPaid(billId, p.numRef, {
    paidAt: (event.datePaid ?? Date.now() / 1000) * 1000,
    transactionId: event.transactionId,
    amount: event.amount,
    receivedAt: Date.now(),
    via,
    source: "webhook",
  });
  return NextResponse.json({ ok: true });
}
