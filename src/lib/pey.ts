// Minimal client for the pey CoDi API. Docs: https://docs.pey.mx
const PEY_BASE = process.env.PEY_BASE_URL || "https://api.pey.mx"; // override only for local tests

export const demoMode = !process.env.PEY_API_KEY || process.env.DEMO_MODE === "1";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** fetch with a time limit, so a slow pey never leaves a request hanging. */
async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal, cache: "no-store" });
  } finally {
    clearTimeout(t);
  }
}

/**
 * GET against pey with a time limit and retries. Only for reads: a read can be repeated
 * without side effects. Retries on network errors, timeouts, 429 and 5xx.
 * Returns null on 404. Throws if pey could not be reached after all attempts.
 */
const READ_TIMEOUT_MS = 5000;
const READ_BACKOFF_MS = [300, 1000]; // waits between attempts: 3 attempts in total
async function peyGet<T>(path: string): Promise<T | null> {
  let lastError = "";
  for (let attempt = 0; attempt <= READ_BACKOFF_MS.length; attempt++) {
    if (attempt > 0) await sleep(READ_BACKOFF_MS[attempt - 1]);
    try {
      const res = await fetchWithTimeout(`${PEY_BASE}${path}`, { headers: auth() }, READ_TIMEOUT_MS);
      if (res.ok) return (await res.json()) as T;
      if (res.status === 404) return null;
      lastError = `pey respondió ${res.status}`;
      if (res.status !== 429 && res.status < 500) break; // 400, 401, 403: repeating will not help
    } catch (err) {
      lastError = err instanceof Error && err.name === "AbortError" ? "pey no respondió a tiempo" : String(err);
    }
  }
  throw new Error(`${lastError} (${path})`);
}

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
  // Creating a charge is not retried automatically: repeating a POST could create two charges.
  const res = await fetchWithTimeout(`${PEY_BASE}/codi/qr`, {
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
  }, 10000);
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
  const res = await fetchWithTimeout(`${PEY_BASE}/codi/pn`, {
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
  }, 10000);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`pey respondió ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = (await res.json()) as { transactionId: string };
  return { transactionId: data.transactionId };
}

export type PeyTransaction = { id: string; status: "PENDING" | "PAID"; amount: number; datePaid?: number };

/**
 * Transactions of one CoDi QR (GET /transaction/codi/qr/:id). Used to re-check a payment if a
 * webhook is late or lost. Throws if pey could not be asked, so the caller knows it was not a "no".
 */
export async function getQrTransactions(qrId: string): Promise<PeyTransaction[]> {
  if (demoMode) return [];
  const data = await peyGet<{ items?: PeyTransaction[] }>(`/transaction/codi/qr/${encodeURIComponent(qrId)}`);
  return data?.items ?? [];
}

/** One transaction by id (GET /transaction/:id). Used to re-check push charges. Throws like above. */
export async function getTransaction(id: string): Promise<PeyTransaction | null> {
  if (demoMode) return null;
  return peyGet<PeyTransaction>(`/transaction/${encodeURIComponent(id)}`);
}
