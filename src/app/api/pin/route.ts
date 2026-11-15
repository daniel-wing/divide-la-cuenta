import { NextResponse } from "next/server";
import { DEMO_PIN, isWaiterPin, usingDemoPin } from "@/lib/pin";

export const dynamic = "force-dynamic";

// Tells the unlock screen whether this is a demo (and shows the demo PIN).
export async function GET() {
  return NextResponse.json(usingDemoPin ? { demo: true, hint: DEMO_PIN } : { demo: false });
}

export async function POST(req: Request) {
  const { pin } = (await req.json().catch(() => ({}))) as { pin?: string };
  if (!isWaiterPin(pin)) return NextResponse.json({ error: "Código incorrecto" }, { status: 401 });
  return NextResponse.json({ ok: true });
}
