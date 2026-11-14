// Minimal client for the pey CoDi API. Docs: https://docs.pey.mx
const PEY_BASE = "https://api.pey.mx";

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
