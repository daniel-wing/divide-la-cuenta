import { NextResponse } from "next/server";
import { verifyBill } from "@/lib/verify";

export const dynamic = "force-dynamic";

// Asks pey directly for every unpaid share. If a webhook was late or lost, the
// payment is still found here. Safe to call many times. See lib/verify.ts.
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const result = await verifyBill(id);
    if (!result) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("verify failed", id, err);
    return NextResponse.json({ error: "No se pudo consultar a pey. Se intentará de nuevo." }, { status: 503 });
  }
}
