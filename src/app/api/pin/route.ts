import { NextResponse } from "next/server";
import { DEMO_PIN, isWaiterPin, usingDemoPin } from "@/lib/pin";
import { demoMode } from "@/lib/pey";

export const dynamic = "force-dynamic";

// Tells the unlock screen whether this is a demo (and shows the demo PIN).
export async function GET() {
  // `real` says whether charges go to pey for real, so the screen can suggest testing with cents.
  return NextResponse.json(usingDemoPin ? { demo: true, hint: DEMO_PIN, real: !demoMode } : { demo: false, real: !demoMode });
}

export async function POST(req: Request) {
  const { pin } = (await req.json().catch(() => ({}))) as { pin?: string };
  if (!isWaiterPin(pin)) return NextResponse.json({ error: "Código incorrecto" }, { status: 401 });
  return NextResponse.json({ ok: true });
}
