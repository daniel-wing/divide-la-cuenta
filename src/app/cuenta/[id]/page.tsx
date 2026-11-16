"use client";

import Link from "next/link";
import { use, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import type { BillView, Participant, PaymentMethod } from "@/lib/types";
import SeatMap, { Check, PaidStamp, tableRatio } from "@/components/SeatMap";
import { money } from "@/lib/format";
import { VERIFY_FAST_MS, VERIFY_SLOW_MS } from "@/lib/timing";
import { RESTAURANT_NAME, seatLetter } from "@/lib/restaurant";
import { PinForm, useWaiter } from "@/components/Waiter";

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

// A drawing of a QR, not a real one: the real code only opens, large, when its seat is tapped,
// so nobody scans the neighbor's code by mistake.
function QrGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <path d="M14 14h3v3h-3zM20 14v.01M14 20v.01M17 20h4M20 17v.01" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Short payment chimes made with Web Audio, no files needed.
let audioCtx: AudioContext | null = null;
function unlockAudio() {
  try {
    if (!audioCtx) audioCtx = new AudioContext();
    if (audioCtx.state === "suspended") audioCtx.resume();
  } catch {}
}
function chime(notes: number[]) {
  try {
    unlockAudio();
    const ctx = audioCtx;
    if (!ctx) return;
    notes.forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = f;
      const t0 = ctx.currentTime + i * 0.1;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.8);
      o.connect(g).connect(ctx.destination);
      o.start(t0);
      o.stop(t0 + 0.9);
    });
  } catch {}
}

export default function CuentaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { waiter, lock, unlock, headers } = useWaiter();
  const [askPin, setAskPin] = useState(false);
  const [bill, setBill] = useState<BillView | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [zoom, setZoom] = useState<Participant | null>(null);
  const [phone, setPhone] = useState("");
  const [push, setPush] = useState<{ state: "idle" | "sending" | "sent" | "error"; msg?: string }>({ state: "idle" });
  const [checking, setChecking] = useState(false);
  const [thanks, setThanks] = useState<Participant | null>(null);
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
        const allDone = refs.length === b.participants.length;
        const anyCodi = fresh.some((r) => (b.payments[r].method ?? "codi") === "codi");
        // CoDi gets the sound; cash and card are marked quietly by the waiter.
        if (allDone) chime([1046.5, 1318.5, 1568]);
        else if (anyCodi) chime([1318.5, 1975.5]);
        if (anyCodi && typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.([80, 60, 120]);
        const items = fresh.map((r) => {
          const p = b.participants.find((x) => x.numRef === r);
          const pay = b.payments[r];
          return {
            key: `${r}-${Date.now()}`,
            text: `${p?.name ?? "Alguien"} pagó ${money(p?.amount ?? pay.amount)} ${
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

  async function verify() {
    const res = await fetch(`/api/bills/${id}/verify`, { method: "POST" }).catch(() => null);
    if (res?.ok) load();
  }

  async function sendPush(p: Participant) {
    setPush({ state: "sending" });
    const res = await fetch(`/api/bills/${id}/push`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ numRef: p.numRef, phone }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    if (res?.ok) setPush({ state: "sent" });
    else setPush({ state: "error", msg: data.error || "No se pudo enviar. Usa el QR." });
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    // The guest who is looking at their QR gets a clear answer the moment pey confirms.
    if (zoom && bill?.payments[zoom.numRef]) {
      setThanks(zoom);
      setZoom(null);
    }
  }, [bill, zoom]);

  useEffect(() => {
    if (!thanks) return;
    const t = setTimeout(() => setThanks(null), 4500);
    return () => clearTimeout(t);
  }, [thanks]);

  useEffect(() => {
    setPush({ state: "idle" });
  }, [zoom]);

  // Safety net: besides the webhook, ask pey directly while something is unpaid. More often while
  // someone is paying (a QR is open, a charge went to a phone, or a guest holds a seat), and right
  // away when the screen comes back to the front.
  const open = bill ? !bill.demo && Object.keys(bill.payments).length < bill.participants.length : false;
  const hot = open && (zoom !== null || push.state === "sent" || Object.keys(bill?.claims ?? {}).length > 0);
  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") verify();
    }, hot ? VERIFY_FAST_MS : VERIFY_SLOW_MS);
    const onVisible = () => document.visibilityState === "visible" && verify();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, hot, id]);

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
  const n = bill.participants.length;
  const collected = bill.participants.filter((p) => paidRefs.has(p.numRef)).reduce((s, p) => s + p.amount, 0);
  const missing = Math.max(0, Math.round((bill.total - collected) * 100) / 100);
  const pct = Math.min(100, Math.round((collected / bill.total) * 100));
  const done = paidRefs.size === n;
  const single = n === 1;
  const subtotal = bill.subtotal ?? bill.total;
  const tipPct = bill.tipPct ?? 0;
  const capacity = bill.seatCount ?? 4;
  const seatMode = Boolean(bill.table) && !single && bill.participants.every((p) => typeof p.seat === "number" && p.seat < capacity);
  const bySeat = new Map(bill.participants.map((p) => [p.seat, p]));
  const codiCount = Object.values(bill.payments).filter((x) => (x.method ?? "codi") === "codi").length;
  const closedIn = done ? Math.max(...Object.values(bill.payments).map((x) => x.paidAt)) - bill.createdAt : 0;
  const title = bill.table ? `Mesa ${bill.table}` : bill.concept;

  async function post(path: string, body: object) {
    await fetch(`/api/bills/${id}/${path}`, {
      method: "POST",
      headers: headers({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    });
    load();
  }

  // In a restaurant, cash and card are for the waiter only. Among friends anyone can mark them.
  const canManage = waiter || !bill.table;
  const manualButtons = (p: Participant, big?: boolean) =>
    !canManage ? null : (
    <div className={`flex gap-2 ${big ? "" : "justify-end"}`}>
      {(["efectivo", "tarjeta"] as const).map((m) => (
        <button
          key={m}
          onClick={() => post("manual", { numRef: p.numRef, method: m })}
          className={`rounded-[10px] bg-surface-2 font-medium transition-colors hover:bg-line ${big ? "h-11 flex-1 text-[15px]" : "h-9 px-3 text-[13px]"}`}
        >
          {METHOD_LABEL[m]}
        </button>
      ))}
      {bill.demo && (
        <button
          onClick={() => post("simulate", { numRef: p.numRef })}
          className={`rounded-[10px] bg-cobrando-tint font-medium text-cobrando ${big ? "h-11 flex-1 text-[15px]" : "h-9 px-3 text-[13px]"}`}
        >
          Simular CoDi
        </button>
      )}
    </div>
  );

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 pt-6">
      {bill.table && (
        <div className="flex items-center justify-between gap-4">
          {waiter ? (
            <Link href="/" className="text-[15px] text-muted hover:text-fg">
              ← Mesas
            </Link>
          ) : (
            <span className="text-[15px] font-medium text-muted">Modo comensal</span>
          )}
          {waiter ? (
            <button onClick={lock} className="h-10 rounded-[10px] bg-fg px-4 text-[15px] font-semibold text-bg">
              Modo comensal
            </button>
          ) : (
            <button onClick={() => setAskPin(true)} className="h-10 rounded-[10px] bg-surface-2 px-4 text-[15px] font-medium hover:bg-line">
              Soy el mesero
            </button>
          )}
        </div>
      )}

      {done ? (
        <section className="maiz-flash mt-4 rounded-[18px] bg-pagada px-6 py-7 text-white">
          <div className="flex items-center gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white text-pagada">
              <Check className="check-draw h-8 w-8" />
            </span>
            <div>
              <h1 className="text-[28px] font-extrabold leading-tight sm:text-[36px] md:text-[44px]">
                {bill.table ? `Mesa ${bill.table} pagada` : "Cuenta saldada"}
              </h1>
              <p className="text-[17px] text-white/85">
                <span className="money font-semibold text-white">{money(bill.total)}</span> en {dur(closedIn)} · {codiCount} de {n} con CoDi
              </p>
            </div>
          </div>
        </section>
      ) : (
        <section className="mt-4">
          <h1 className="text-[28px] font-bold">{title}</h1>
          <p className="money mt-1 text-[48px] font-extrabold leading-none md:text-[60px]">
            <span className="text-[22px] font-semibold text-muted md:text-[26px]">Falta </span>
            {money(missing)}
          </p>
          <p className="mt-2 text-[15px] text-muted">
            de <span className="money">{money(bill.total)}</span> · consumo <span className="money">{money(subtotal)}</span> {tipPct ? `+ propina ${tipPct}%` : "sin propina"} ·{" "}
            {single ? "esperando pago" : `${paidRefs.size} de ${n} pagaron`}
          </p>
          {!seatMode && (
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full bg-pagada transition-all duration-700" style={{ width: `${pct}%` }} />
            </div>
          )}
        </section>
      )}

      {bill.table && !done && waiter && (
        <p className="mt-4 text-[14px] text-muted">
          Los comensales también pueden pagar desde su celular con el QR impreso de la Mesa {bill.table}.
        </p>
      )}

      {bill.table && !done && (
        <p className="mt-4 rounded-[12px] border border-pagada/25 bg-pagada-tint px-4 py-3 text-[15px] text-fg">
          <span className="font-semibold text-pagada">Paga con CoDi y apoya a este lugar.</span> Con tarjeta, el restaurante paga comisión por
          cada cobro.
        </p>
      )}

      {bill.demo && (
        <p className="mt-4 rounded-[10px] bg-cobrando-tint px-4 py-2 text-[15px] text-cobrando">
          Modo demo: los QR no son reales. Usa &quot;Simular CoDi&quot; para probar.
        </p>
      )}

      {seatMode ? (
        <div className="mt-8 grid items-start gap-10 lg:grid-cols-[auto_minmax(0,1fr)]">
          <div className="flex flex-col items-center">
            <SeatMap
              capacity={capacity}
              gap={10}
              surfaceClassName={`rounded-[22px] transition-colors duration-700 ${
                done ? "bg-pagada text-white" : "border-2 border-fg bg-surface shadow-[var(--shadow)]"
              } h-[150px] sm:h-[190px] ${capacity <= 4 ? "w-[150px] sm:w-[190px]" : capacity <= 6 ? "w-[170px] sm:w-[285px]" : "w-[170px] sm:w-[380px]"}`}
              renderSeat={(i) => {
                const p = bySeat.get(i);
                const box = "h-[84px] w-[84px] sm:h-[128px] sm:w-[128px]";
                if (!p) return <div className={`${box} rounded-[14px] border-2 border-dashed border-line`} />;
                const pay = bill.payments[p.numRef];
                return (
                  <div className="flex flex-col items-center">
                    {pay ? (
                      <div
                        className={`${box} flex items-center justify-center rounded-[14px] border-2 border-pagada bg-pagada-tint ${
                          justPaid.has(p.numRef) ? "paid-pop" : ""
                        }`}
                      >
                        <span className="sm:hidden">
                          <PaidStamp size="sm" animate={justPaid.has(p.numRef)} />
                        </span>
                        <span className="hidden sm:block">
                          <PaidStamp method={METHOD_LABEL[pay.method ?? "codi"]} animate={justPaid.has(p.numRef)} />
                        </span>
                      </div>
                    ) : (
                      <button
                        onClick={() => setZoom(p)}
                        aria-label={`Ver el QR de ${p.name}`}
                        className={`${box} flex flex-col items-center justify-center gap-1 rounded-[14px] border-2 border-cobrando bg-cobrando-tint text-cobrando transition-transform hover:scale-[1.03]`}
                      >
                        <QrGlyph className="h-9 w-9 sm:h-14 sm:w-14" />
                        <span className="text-[12px] font-semibold sm:text-[15px]">Ver mi QR</span>
                      </button>
                    )}
                    <p className="mt-1 max-w-[84px] truncate text-[12px] font-medium text-muted sm:max-w-[128px] sm:text-[13px]">
                      {p.name} · <span className="money">{money(p.amount)}</span>
                    </p>
                    {!pay && bill.claims?.[p.numRef] && (
                      <p className="text-[11px] font-semibold text-cobrando sm:text-[12px]">En proceso en un celular</p>
                    )}
                  </div>
                );
              }}
            >
              {done ? (
                <Check className="h-14 w-14" />
              ) : (
                <>
                  <span className="display text-[44px] font-extrabold leading-none">{bill.table}</span>
                  <span className="mt-1 text-[13px] text-muted">
                    {paidRefs.size} de {n}
                  </span>
                </>
              )}
            </SeatMap>
            {!done && (
            <p className="mt-4 rounded-full bg-surface-2 px-3 py-1 text-[13px] text-muted">
              {waiter ? "Mesero: tú estás aquí, abajo. Toca un lugar para abrir su QR." : "Toca tu lugar para ver tu QR y escanéalo con la app de tu banco."}
            </p>
            )}
          </div>

          <div className="card divide-y divide-line">
            {[...bill.participants]
              .sort((a, b) => Number(Boolean(bill.payments[a.numRef])) - Number(Boolean(bill.payments[b.numRef])) || (a.seat ?? 0) - (b.seat ?? 0))
              .map((p) => {
                const pay = bill.payments[p.numRef];
                return (
                  <div key={p.numRef} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                    <span
                      className={`display flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-white ${
                        pay ? "bg-pagada" : "bg-cobrando"
                      }`}
                    >
                      {pay ? <Check className="h-4 w-4" /> : seatLetter(p.seat ?? 0)}
                    </span>
                    <span className="min-w-[96px] flex-1 truncate text-[17px] font-medium">{p.name}</span>
                    <span className="money text-[17px] font-semibold">{money(p.amount)}</span>
                    {pay ? (
                      <span className="w-full text-[13px] font-semibold text-pagada sm:w-auto">
                        PAGADO · {METHOD_LABEL[pay.method ?? "codi"]} · {time(pay.paidAt)}
                      </span>
                    ) : (
                      <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
                        {bill.claims?.[p.numRef] && (
                          <span className="text-[13px] font-semibold text-cobrando">
                            En proceso en un celular
                            {waiter && (
                              <button onClick={() => post("claim", { numRef: p.numRef, release: true })} className="ml-2 font-medium text-muted underline">
                                Soltar
                              </button>
                            )}
                          </span>
                        )}
                        {manualButtons(p)}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      ) : (
        <div className={`mt-8 grid gap-3 ${single ? "mx-auto max-w-sm grid-cols-1" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"}`}>
          {bill.participants.map((p) => {
            const pay = bill.payments[p.numRef];
            return (
              <div
                key={p.numRef}
                className={`flex flex-col rounded-[14px] border-2 p-5 transition-colors duration-[400ms] ${
                  pay ? "border-pagada bg-pagada-tint" : "border-line bg-surface shadow-[var(--shadow)]"
                } ${justPaid.has(p.numRef) ? "paid-pop" : ""}`}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <p className="truncate text-[17px] font-semibold">{p.name}</p>
                  <p className="money text-[24px] font-bold">{money(p.amount)}</p>
                </div>
                <div className={`mt-4 flex items-center justify-center ${pay ? "h-[120px]" : "h-[192px]"}`}>
                  {pay ? (
                    <PaidStamp size="lg" method={`${METHOD_LABEL[pay.method ?? "codi"]} · ${time(pay.paidAt)}`} animate={justPaid.has(p.numRef)} />
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
                    <p className="mb-2 text-[13px] text-muted">Paga con CoDi desde la app de tu banco{canManage ? ", o cobra sin CoDi:" : "."}</p>
                    {manualButtons(p, true)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <section className="mt-10">
        <h2 className="text-[20px] font-bold">Bitácora</h2>
        <ol className="mt-3 space-y-2 border-l-2 border-line pl-4">
          <li className="text-[15px]">
            <span className="money text-muted">{timeS(bill.createdAt)}</span> · Cuenta creada: {n === 1 ? "1 código QR" : `${n} códigos QR`} de CoDi
            generados con pey
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
                  <span className="money text-muted">{timeS(pay.paidAt)}</span> · {p.name} pagó <span className="money">{money(p.amount)}</span>{" "}
                  {codi ? (pay.via === "pn" ? "con CoDi, cobro enviado a su celular" : "con CoDi") : `en ${METHOD_LABEL[pay.method!].toLowerCase()}, marcado por el mesero`}
                  {codi && (
                    <span className="text-muted">
                      {" "}
                      · {dur(pay.paidAt - bill.createdAt)} después de generar su cobro
                      {bill.demo
                        ? " · pago simulado (modo demo)"
                        : pay.source === "consulta"
                          ? " · confirmado al consultar a pey"
                          : lag !== null && lag >= 0 && lag < 120000
                            ? ` · pey avisó por webhook en ${dur(lag)}`
                            : " · confirmado por webhook de pey"}
                    </span>
                  )}
                </li>
              );
            })}
          {done && <li className="text-[15px] font-semibold text-pagada">{bill.table ? "Mesa cobrada" : "Cuenta cobrada"} en {dur(closedIn)}</li>}
        </ol>
      </section>

      {waiter && !done && !bill.demo && (
        <div className="mt-8 text-center">
          <button
            disabled={checking}
            onClick={async () => {
              setChecking(true);
              await verify();
              setChecking(false);
            }}
            className="h-11 rounded-[10px] bg-surface-2 px-5 text-[15px] font-medium transition-colors hover:bg-line disabled:opacity-50"
          >
            {checking ? "Consultando a pey..." : "Verificar pagos con pey"}
          </button>
        </div>
      )}

      {bill.table && waiter && (done || bill.demo) && (
        <div className="mt-8 text-center">
          <button
            onClick={async () => {
              await fetch(`/api/tables/${bill.table}/free`, { method: "POST", headers: headers() });
              router.push("/");
            }}
            className="h-11 rounded-[10px] bg-surface-2 px-5 text-[15px] font-medium transition-colors hover:bg-line"
          >
            Liberar mesa {bill.table}
          </button>
        </div>
      )}

      {!done && <p className="mt-10 text-center text-[15px] text-muted">El pago se confirma solo, sin recargar la página.</p>}

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

      {askPin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={() => setAskPin(false)}>
          <div className="w-full max-w-[420px] rounded-[18px] bg-bg p-8" onClick={(e) => e.stopPropagation()}>
            <PinForm
              title="Desbloquear"
              onUnlock={async (v) => {
                const ok = await unlock(v);
                if (ok) setAskPin(false);
                return ok;
              }}
            />
          </div>
        </div>
      )}

      {thanks && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={() => setThanks(null)}>
          <div className="w-full max-w-[420px] rounded-[18px] bg-pagada p-8 text-center text-white">
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white text-pagada">
              <Check className="check-draw h-9 w-9" />
            </span>
            <p className="display mt-4 text-[30px] font-extrabold leading-tight">Pago recibido</p>
            <p className="mt-1 text-[17px] text-white/90">
              {thanks.name} · <span className="money font-semibold">{money(thanks.amount)}</span>
            </p>
            <p className="mt-3 text-[13px] text-white/75">Confirmado por tu banco y pey. Gracias.</p>
          </div>
        </div>
      )}

      {zoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={() => setZoom(null)}>
          <div className="w-full max-w-[560px] rounded-[18px] bg-white p-6 text-center text-[#14171f]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-baseline justify-between gap-6">
              <div className="text-left">
                <p className="text-[13px] text-[#5b6474]">
                  {bill.table ? `${RESTAURANT_NAME} · Mesa ${bill.table}` : bill.concept}
                </p>
                <p className="display text-[24px] font-bold leading-tight">{zoom.name}</p>
              </div>
              <p className="money text-[32px] font-extrabold">{money(zoom.amount)}</p>
            </div>
            <div className="mt-3 flex justify-center">
              <QRCodeSVG
                value={zoom.qrString}
                marginSize={4}
                bgColor="#FFFFFF"
                fgColor="#111110"
                style={{ width: "min(78vw, 56vh)", height: "min(78vw, 56vh)" }}
              />
            </div>
            <p className="mt-2 text-[15px] text-[#5b6474]">
              Abre la app de tu banco, entra a <span className="font-semibold text-[#14171f]">CoDi</span> y escanea este código.
            </p>
            <div className="mt-4 rounded-[12px] bg-[#f3f4f6] p-3 text-left">
              <p className="text-[13px] font-medium text-[#14171f]">¿Sin escanear? Recibe el cobro en la app de tu banco</p>
              {push.state === "sent" ? (
                <p className="mt-2 text-[15px] font-semibold text-pagada">Cobro enviado. Abre la app de tu banco y acéptalo.</p>
              ) : (
                <form
                  className="mt-2 flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    sendPush(zoom);
                  }}
                >
                  <input
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    placeholder="Tu celular, 10 dígitos"
                    aria-label="Tu celular, 10 dígitos"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                    className="h-11 min-w-0 flex-1 rounded-[10px] border border-[#d5d8de] bg-white px-3 text-[17px] text-[#14171f] outline-none focus:border-[#1e3fae]"
                  />
                  <button
                    disabled={phone.length !== 10 || push.state === "sending"}
                    className="h-11 shrink-0 rounded-[10px] bg-[#1e3fae] px-4 text-[15px] font-semibold text-white disabled:opacity-40"
                  >
                    {push.state === "sending" ? "Enviando..." : "Enviar"}
                  </button>
                </form>
              )}
              {push.state === "error" && <p className="mt-2 text-[13px] text-[#b42318]">{push.msg}</p>}
              <p className="mt-2 text-[12px] text-[#5b6474]">Tu número solo se usa para enviar este cobro y no se guarda.</p>
            </div>
            {canManage && <div className="mt-3 [&_button]:text-[#14171f]">{manualButtons(zoom, true)}</div>}
            <button onClick={() => setZoom(null)} className="mt-3 text-[15px] text-[#5b6474] hover:underline">
              Cerrar
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
