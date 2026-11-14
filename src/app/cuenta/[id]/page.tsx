"use client";

import Link from "next/link";
import { use, useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import type { BillView, Participant, PaymentMethod } from "@/lib/types";

const mxn = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
const METHOD_LABEL: Record<PaymentMethod, string> = { codi: "CoDi", efectivo: "Efectivo", tarjeta: "Tarjeta" };
const time = (ms: number) => new Date(ms).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
const timeS = (ms: number) =>
  new Date(ms).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
function dur(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  return `${m} min ${s % 60} s`;
}

type Toast = { key: string; text: string };

// Short "cha-ching" made with Web Audio, no files needed.
let audioCtx: AudioContext | null = null;
function unlockAudio() {
  try {
    if (!audioCtx) audioCtx = new AudioContext();
    if (audioCtx.state === "suspended") audioCtx.resume();
  } catch {}
}
function playPaid() {
  try {
    unlockAudio();
    const ctx = audioCtx;
    if (!ctx) return;
    [1318.5, 1975.5].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = f;
      const t0 = ctx.currentTime + i * 0.09;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.9);
      o.connect(g).connect(ctx.destination);
      o.start(t0);
      o.stop(t0 + 1);
    });
  } catch {}
}

export default function CuentaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [bill, setBill] = useState<BillView | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [zoom, setZoom] = useState<Participant | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [justPaid, setJustPaid] = useState<Set<string>>(new Set());
  const seen = useRef<Set<string> | null>(null);

  async function load() {
    const res = await fetch(`/api/bills/${id}`, { cache: "no-store" });
    if (res.status === 404) return setNotFound(true);
    if (!res.ok) return;
    const b: BillView = await res.json();
    const refs = Object.keys(b.payments);
    if (seen.current) {
      const fresh = refs.filter((r) => !seen.current!.has(r));
      if (fresh.length) {
        playPaid();
        if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.([80, 60, 120]);
        const items = fresh.map((r) => {
          const p = b.participants.find((x) => x.numRef === r);
          const pay = b.payments[r];
          return {
            key: `${r}-${Date.now()}`,
            text: `${p?.name ?? "Alguien"} pagó ${mxn.format(p?.amount ?? pay.amount)} ${
              (pay.method ?? "codi") === "codi" ? "con CoDi" : `en ${METHOD_LABEL[pay.method!].toLowerCase()}`
            }`,
          };
        });
        setToasts((t) => [...t, ...items]);
        setJustPaid((s) => new Set([...s, ...fresh]));
        setTimeout(() => setToasts((t) => t.filter((x) => !items.some((i) => i.key === x.key))), 4300);
        setTimeout(() => setJustPaid((s) => new Set([...s].filter((r) => !fresh.includes(r)))), 1700);
      }
    }
    seen.current = new Set(refs);
    setBill(b);
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (zoom && bill?.payments[zoom.numRef]) setZoom(null);
  }, [bill, zoom]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setZoom(null);
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", unlockAudio);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", unlockAudio);
    };
  }, []);

  if (notFound) return <p className="p-10 text-center text-muted">Esta cuenta no existe o ya expiró.</p>;
  if (!bill) return <p className="p-10 text-center text-muted">Cargando...</p>;

  const paidRefs = new Set(Object.keys(bill.payments));
  const collected = bill.participants.filter((p) => paidRefs.has(p.numRef)).reduce((s, p) => s + p.amount, 0);
  const missing = Math.max(0, bill.total - collected);
  const pct = Math.min(100, Math.round((collected / bill.total) * 100));
  const done = paidRefs.size === bill.participants.length;
  const single = bill.participants.length === 1;
  const subtotal = bill.subtotal ?? bill.total;
  const tipPct = bill.tipPct ?? 0;

  async function post(path: string, body: object) {
    await fetch(`/api/bills/${id}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    load();
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 pt-6">
      {bill.table && (
        <Link href="/" className="text-[15px] text-muted hover:text-fg">
          ← Mesas
        </Link>
      )}

      <section
        className={`mt-4 rounded-[14px] transition-colors duration-500 ${done ? "bg-pagada-tint px-6 py-6" : ""}`}
      >
        <h1 className={`text-[32px] font-semibold ${done ? "text-pagada" : ""}`}>
          {done ? (bill.table ? "Mesa pagada" : "Cuenta saldada") : bill.table ? `Mesa ${bill.table}` : bill.concept}
        </h1>
        {done ? (
          <p className="mt-1 text-[17px] text-muted">
            {bill.table ? `Mesa ${bill.table} · ` : ""}
            <span className="money">{mxn.format(bill.total)}</span> cobrados. Sin capturas ni perseguir a nadie.
          </p>
        ) : (
          <>
            <p className="money mt-2 text-[40px] font-semibold leading-tight md:text-[48px]">
              {mxn.format(collected)} <span className="text-muted">de {mxn.format(bill.total)}</span>
            </p>
            <p className="mt-1 text-[15px] text-muted">
              Consumo <span className="money">{mxn.format(subtotal)}</span> + propina {tipPct}%
            </p>
            <div className="mt-5 h-2 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full bg-pagada transition-all duration-700" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-2 text-[15px] text-muted">
              {single ? "Esperando pago" : `${paidRefs.size} de ${bill.participants.length} pagaron`} · Falta{" "}
              <span className="money">{mxn.format(missing)}</span>
            </p>
          </>
        )}
      </section>

      {bill.demo && (
        <p className="mt-4 rounded-[10px] bg-cobrando-tint px-4 py-2 text-[15px] text-cobrando">
          Modo demo: los QR no son reales. Usa &quot;Simular pago&quot; para probar.
        </p>
      )}

      <div className={`mt-8 grid gap-3 ${single ? "mx-auto max-w-sm grid-cols-1" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"}`}>
        {bill.participants.map((p) => {
          const pay = bill.payments[p.numRef];
          return (
            <div
              key={p.numRef}
              className={`flex flex-col rounded-[14px] border p-5 transition-colors duration-[400ms] ${
                pay ? "border-pagada/30 bg-pagada-tint" : "border-line bg-surface shadow-[var(--shadow)]"
              } ${justPaid.has(p.numRef) ? "paid-pop" : ""}`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <p className="truncate text-[17px] font-semibold">{p.name}</p>
                <p className="money text-[22px]">{mxn.format(p.amount)}</p>
              </div>

              <div className="mt-4 flex h-[192px] items-center justify-center">
                {pay ? (
                  <div className="flex flex-col items-center text-center">
                    <svg viewBox="0 0 24 24" className="check-draw h-12 w-12 text-pagada" fill="none" stroke="currentColor" strokeWidth={2.5}>
                      <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <p className="mt-2 text-[28px] font-semibold text-pagada">Pagado</p>
                    <p className="money mt-1 text-[15px] text-muted">
                      {METHOD_LABEL[pay.method ?? "codi"]} · {time(pay.paidAt)}
                    </p>
                  </div>
                ) : (
                  <button
                    onClick={() => setZoom(p)}
                    title="Toca para agrandar"
                    className="rounded-[8px] border border-line bg-white p-3 transition-transform hover:scale-[1.02]"
                  >
                    <QRCodeSVG value={p.qrString} size={single ? 168 : 156} marginSize={2} bgColor="#FFFFFF" fgColor="#111110" />
                  </button>
                )}
              </div>

              {!pay && (
                <div className="mt-4">
                  <p className="text-[13px] text-muted">Cobrar sin CoDi</p>
                  <div className="mt-2 flex gap-2">
                    {(["efectivo", "tarjeta"] as const).map((m) => (
                      <button
                        key={m}
                        onClick={() => post("manual", { numRef: p.numRef, method: m })}
                        className="h-10 flex-1 rounded-[10px] bg-surface-2 text-[15px] font-medium transition-colors hover:bg-line"
                      >
                        {METHOD_LABEL[m]}
                      </button>
                    ))}
                  </div>
                  {bill.demo && (
                    <button
                      onClick={() => post("simulate", { numRef: p.numRef })}
                      className="mt-2 h-10 w-full rounded-[10px] bg-cobrando-tint text-[15px] text-cobrando"
                    >
                      Simular pago CoDi
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <section className="mt-10">
        <h2 className="text-[17px] font-semibold">Bitácora de la mesa</h2>
        <ol className="mt-3 space-y-2 border-l-2 border-line pl-4">
          <li className="text-[15px]">
            <span className="money text-muted">{timeS(bill.createdAt)}</span> · Cuenta creada:{" "}
            {bill.participants.length === 1 ? "1 código QR" : `${bill.participants.length} códigos QR`} de CoDi generados con pey
          </li>
          {bill.participants
            .filter((p) => bill.payments[p.numRef])
            .map((p) => ({ p, pay: bill.payments[p.numRef] }))
            .sort((a, b) => a.pay.paidAt - b.pay.paidAt)
            .map(({ p, pay }) => {
              const codi = (pay.method ?? "codi") === "codi";
              const lag = pay.receivedAt ? pay.receivedAt - pay.paidAt : null;
              return (
                <li key={p.numRef} className="text-[15px]">
                  <span className="money text-muted">{timeS(pay.paidAt)}</span> · {p.name} pagó{" "}
                  <span className="money">{mxn.format(p.amount)}</span>{" "}
                  {codi ? "con CoDi" : `en ${METHOD_LABEL[pay.method!].toLowerCase()}, marcado por el mesero`}
                  {codi && (
                    <span className="text-muted">
                      {" "}
                      · {dur(pay.paidAt - bill.createdAt)} después de generar su QR
                      {bill.demo
                        ? " · pago simulado (modo demo)"
                        : lag !== null && lag >= 0 && lag < 120000
                          ? ` · pey avisó en ${dur(lag)}`
                          : " · confirmado por webhook de pey"}
                    </span>
                  )}
                </li>
              );
            })}
          {done && (
            <li className="text-[15px] font-semibold text-pagada">
              Mesa cobrada en{" "}
              {dur(Math.max(...Object.values(bill.payments).map((x) => x.paidAt)) - bill.createdAt)}
            </li>
          )}
        </ol>
      </section>

      <p className="mt-10 text-center text-[15px] text-muted">Escanea tu QR con la app de tu banco. El pago se confirma solo.</p>

      {toasts.length > 0 && (
        <div className="pointer-events-none fixed left-1/2 top-5 z-[60] flex w-[min(92vw,560px)] -translate-x-1/2 flex-col gap-2">
          {toasts.map((t) => (
            <div
              key={t.key}
              className="toast relative left-1/2 rounded-[14px] bg-pagada px-6 py-4 text-center text-[20px] font-semibold text-white shadow-lg"
            >
              {t.text}
            </div>
          ))}
        </div>
      )}

      {zoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={() => setZoom(null)}>
          <div className="rounded-[14px] bg-white p-8 text-center text-[#1a1915]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-baseline justify-between gap-6">
              <p className="text-[22px] font-semibold">{zoom.name}</p>
              <p className="money text-[28px] font-semibold">{mxn.format(zoom.amount)}</p>
            </div>
            <div className="mt-4 flex justify-center">
              <QRCodeSVG
                value={zoom.qrString}
                marginSize={4}
                bgColor="#FFFFFF"
                fgColor="#111110"
                style={{ width: "min(80vw, 60vh)", height: "min(80vw, 60vh)" }}
              />
            </div>
            <button onClick={() => setZoom(null)} className="mt-4 text-[15px] text-[#6b675e] hover:underline">
              Cerrar
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
