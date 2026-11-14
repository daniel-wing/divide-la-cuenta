"use client";

import { use, useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import type { BillView, Participant } from "@/lib/types";

const mxn = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

export default function CuentaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [bill, setBill] = useState<BillView | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [zoom, setZoom] = useState<Participant | null>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      const res = await fetch(`/api/bills/${id}`, { cache: "no-store" });
      if (!alive) return;
      if (res.status === 404) return setNotFound(true);
      if (res.ok) setBill(await res.json());
    }
    load();
    const t = setInterval(load, 2000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [id]);

  // Close the enlarged QR automatically once that person pays.
  useEffect(() => {
    if (zoom && bill?.payments[zoom.numRef]) setZoom(null);
  }, [bill, zoom]);

  if (notFound) return <p className="p-10 text-center text-neutral-500">Esta cuenta no existe o ya expiró.</p>;
  if (!bill) return <p className="p-10 text-center text-neutral-500">Cargando...</p>;

  const paidRefs = new Set(Object.keys(bill.payments));
  const collected = bill.participants.filter((p) => paidRefs.has(p.numRef)).reduce((s, p) => s + p.amount, 0);
  const missing = Math.max(0, bill.total - collected);
  const pct = Math.min(100, Math.round((collected / bill.total) * 100));
  const done = paidRefs.size === bill.participants.length;

  async function simulate(numRef: string) {
    await fetch(`/api/bills/${id}/simulate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ numRef }),
    });
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-emerald-600">Divide la cuenta</p>
          <h1 className="mt-1 text-4xl font-bold tracking-tight">{bill.concept}</h1>
        </div>
        <div className="text-right">
          <p className="text-sm text-neutral-500">Total</p>
          <p className="text-3xl font-bold">{mxn.format(bill.total)}</p>
        </div>
      </div>

      {bill.demo && (
        <p className="mt-4 rounded-xl bg-amber-50 px-4 py-2 text-sm text-amber-800">
          Modo demo: los QR no son reales. Usa &quot;Simular pago&quot; para probar.
        </p>
      )}

      <div className="mt-8">
        <div className="flex justify-between text-sm font-medium">
          <span>Recaudado {mxn.format(collected)}</span>
          <span className="text-neutral-500">Falta {mxn.format(missing)}</span>
        </div>
        <div className="mt-2 h-4 overflow-hidden rounded-full bg-neutral-200">
          <div className="h-full rounded-full bg-emerald-500 transition-all duration-700" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-2 text-sm text-neutral-500">
          {paidRefs.size} de {bill.participants.length} personas han pagado
        </p>
      </div>

      {done && (
        <div className="pop mt-8 rounded-3xl bg-emerald-600 px-6 py-10 text-center text-white">
          <p className="text-5xl font-bold">Cuenta saldada</p>
          <p className="mt-2 text-emerald-100">Todos pagaron. Nadie tuvo que cobrar ni revisar capturas.</p>
        </div>
      )}

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {bill.participants.map((p) => {
          const pay = bill.payments[p.numRef];
          return (
            <div
              key={p.numRef}
              className={`rounded-3xl border p-5 transition-colors duration-500 ${
                pay ? "border-emerald-500 bg-emerald-50 text-emerald-950" : "border-neutral-200"
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xl font-semibold">{p.name}</p>
                  <p className="text-2xl font-bold">{mxn.format(p.amount)}</p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    pay ? "bg-emerald-600 text-white" : "bg-neutral-100 text-neutral-600"
                  }`}
                >
                  {pay ? "Pagado" : "Pendiente"}
                </span>
              </div>

              {pay ? (
                <div className="pop mt-4 flex h-44 flex-col items-center justify-center rounded-2xl bg-emerald-600 text-white">
                  <svg viewBox="0 0 24 24" className="h-16 w-16" fill="none" stroke="currentColor" strokeWidth={3}>
                    <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <p className="mt-1 text-sm">
                    {new Date(pay.paidAt).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              ) : (
                <button
                  onClick={() => setZoom(p)}
                  className="mt-4 flex w-full justify-center rounded-2xl bg-white p-3"
                  title="Toca para agrandar"
                >
                  <QRCodeSVG value={p.qrString} size={160} />
                </button>
              )}

              {!pay && bill.demo && (
                <button
                  onClick={() => simulate(p.numRef)}
                  className="mt-3 w-full rounded-xl border border-amber-400 py-2 text-sm text-amber-700 hover:bg-amber-50"
                >
                  Simular pago
                </button>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-10 text-center text-sm text-neutral-400">
        Escanea tu QR con la app de tu banco (CoDi). El pago se confirma en el servidor de forma automática.
      </p>

      {zoom && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
          onClick={() => setZoom(null)}
        >
          <div className="rounded-3xl bg-white p-8 text-center text-neutral-900" onClick={(e) => e.stopPropagation()}>
            <p className="text-2xl font-semibold">{zoom.name}</p>
            <p className="mb-4 text-3xl font-bold">{mxn.format(zoom.amount)}</p>
            <QRCodeSVG value={zoom.qrString} size={360} />
            <button onClick={() => setZoom(null)} className="mt-6 text-neutral-500 hover:underline">
              Cerrar
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
