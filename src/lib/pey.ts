// Minimal client for the pey CoDi API. Docs: https://docs.pey.mx
const PEY_BASE = process.env.PEY_BASE_URL || "https://api.pey.mx"; // override only for local tests

export const demoMode = !process.env.PEY_API_KEY || process.env.DEMO_MODE === "1";

export async function createCodiQr(input: {
  amount: number;
  concept: string;
  numRef: string;
  metadata?: Record<string, string>;
}): Promise<{ id: string; qrString: string }> {
  if (demoMode) {
    // Fake QR so the app can be built and tested without a pey key.
    return { id: `demo-${input.numRef}`, qrString: `DEMO|${input.numRef}|${input.amount}|${input.concept}` };
  }
  const res = await fetch(`${PEY_BASE}/codi/qr`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.PEY_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: input.amount,
      concept: input.concept.slice(0, 40),
      expiration: 3600, // seconds, minimum is 360
      numRef: input.numRef,
      metadata: input.metadata,
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`pey respondió ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = (await res.json()) as { id: string; qrString: string };
  return { id: data.id, qrString: data.qrString };
}

function auth() {
  return { Authorization: `Bearer ${process.env.PEY_API_KEY}`, "Content-Type": "application/json" };
}

/**
 * CoDi charge by push notification (POST /codi/pn): the payer gets the charge
 * inside their bank app, with no QR to scan. Returns pey's transaction id.
 */
export async function createCodiPush(input: {
  amount: number;
  phoneNumber: string; // 10 digits
  concept: string;
  numRef: string;
  metadata?: Record<string, string>;
}): Promise<{ transactionId: string }> {
  if (demoMode) return { transactionId: `demo-pn-${input.numRef}-${Date.now()}` };
  const res = await fetch(`${PEY_BASE}/codi/pn`, {
    method: "POST",
    headers: auth(),
    body: JSON.stringify({
      amount: input.amount,
      phoneNumber: input.phoneNumber,
      concept: input.concept.slice(0, 40),
      expiration: 3600,
      numRef: input.numRef,
      metadata: input.metadata,
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`pey respondió ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = (await res.json()) as { transactionId: string };
  return { transactionId: data.transactionId };
}

export type PeyTransaction = { id: string; status: "PENDING" | "PAID"; amount: number; datePaid?: number };

/** Transactions of one CoDi QR (GET /transaction/codi/qr/:id). Used to re-check a payment if a webhook is late or lost. */
export async function getQrTransactions(qrId: string): Promise<PeyTransaction[]> {
  if (demoMode) return [];
  const res = await fetch(`${PEY_BASE}/transaction/codi/qr/${encodeURIComponent(qrId)}`, { headers: auth(), cache: "no-store" });
  if (!res.ok) return [];
  const data = (await res.json()) as { items?: PeyTransaction[] };
  return data.items ?? [];
}

/** One transaction by id (GET /transaction/:id). Used to re-check push charges. */
export async function getTransaction(id: string): Promise<PeyTransaction | null> {
  if (demoMode) return null;
  const res = await fetch(`${PEY_BASE}/transaction/${encodeURIComponent(id)}`, { headers: auth(), cache: "no-store" });
  if (!res.ok) return null;
  return (await res.json()) as PeyTransaction;
}
