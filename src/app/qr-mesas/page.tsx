"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { RESTAURANT_NAME, TABLE_COUNT } from "@/lib/restaurant";

// Printable sheet: one QR per table. Each QR always opens /mesa/N, which shows
// whatever bill is open on that table at the moment.
export default function QrMesas() {
  const [origin, setOrigin] = useState("");
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setOrigin(window.location.origin), []);
  if (!origin) return null;
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-5 pt-8 print:pt-0">
      <div className="flex items-center justify-between print:hidden">
        <h1 className="text-[24px] font-bold">QR de las mesas</h1>
        <button onClick={() => window.print()} className="h-10 rounded-[10px] bg-fg px-4 text-[15px] font-semibold text-bg">
          Imprimir
        </button>
      </div>
      <p className="mt-2 text-[15px] text-muted print:hidden">Imprime y pega cada QR en su mesa. No cambia nunca, aunque cambie la cuenta.</p>
      <div className="mt-6 grid grid-cols-2 gap-6 sm:grid-cols-3 print:grid-cols-2">
        {Array.from({ length: TABLE_COUNT }, (_, i) => i + 1).map((n) => (
          <div key={n} className="flex break-inside-avoid flex-col items-center rounded-[14px] border border-line bg-white p-5 text-[#111110]">
            <p className="text-[13px]">{RESTAURANT_NAME}</p>
            <p className="display text-[28px] font-extrabold">Mesa {n}</p>
            <QRCodeSVG value={`${origin}/mesa/${n}`} size={160} marginSize={2} bgColor="#FFFFFF" fgColor="#111110" />
            <p className="mt-2 text-center text-[13px]">Escanea para pagar tu parte con CoDi</p>
          </div>
        ))}
      </div>
    </main>
  );
}
