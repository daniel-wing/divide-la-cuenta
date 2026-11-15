"use client";

import { use, useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import type { BillView, Participant } from "@/lib/types";
import { Check, PaidStamp } from "@/components/SeatMap";
import { money } from "@/lib/format";
import { seatLetter } from "@/lib/restaurant";

// The guest's own phone. They get here by scanning the QR printed on their table (/mesa/N),
// pick their seat, and pay their share. The waiter screen keeps working as before.

const TOKEN_KEY = "dividi-guest-token";
function guestToken(): string {
  try {
    let t = localStorage.getItem(TOKEN_KEY);
    if (!t) {
      t = crypto.randomUUID();
      localStorage.setItem(TOKEN_KEY, t);
    }
    return t;
  } catch {
    return "sin-almacenamiento-" + Math.random().toString(36).slice(2, 12);
  }
}

const METHOD: Record<string, string> = { codi: "CoDi", efectivo: "Efectivo", tarjeta: "Tarjeta" };
const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export default function MesaPage({ params }: { params: Promise<{ table: string }> }) {
  const { table } = use(params);
  const [token] = useState(() => (typeof window === "undefined" ? "" : guestToken()));
  const [billId, setBillId] = useState<string | null | undefined>(undefined);
  const [bill, setBill] = useState<BillView | null>(null);
  const [mine, setMine] = useState<string | null>(null); // numRef this phone is paying
  const [error, setError] = useState("");
  const [phone, setPhone] = useState("");
  const [push, setPush] = useState<{ state: "idle" | "sending" | "sent" | "error"; msg?: string }>({ state: "idle" });
  const [showQr, setShowQr] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Which bill is open on this table. Checked again every few seconds so the page
  // wakes up on its own when the waiter generates the charges.
  useEffect(() => {
    let alive = true;
    async function find() {
      const res = await fetch(`/api/mesa/${table}`, { cache: "no-store" }).catch(() => null);
      if (!alive || !res) return;
      if (res.status === 404) return setBillId(null);
      const data = (await res.json()) as { billId: string | null };
      setBillId(data.billId);
    }
    find();
    const t = setInterval(find, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [table]);

  async function load() {
    if (!billId || !token) return;
    const res = await fetch(`/api/bills/${billId}`, { cache: "no-store", headers: { "x-guest-token": token } }).catch(() => null);
    if (!res?.ok) return;
    const b = (await res.json()) as BillView;
    setBill(b);
    // Keep "my seat" in sync with the server: after paying, or if the 3 minutes ran out.
    setMine((m) => {
      if (m && b.payments[m]) return m; // stays, to show the PAGADO screen
      return b.mine?.[0] ?? null;
    });
  }

  useEffect(() => {
    if (!billId) return;
    // load() only sets state after the fetch resolves, not synchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [billId, token]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Safety net, same as the waiter screen: ask pey directly while my seat is open.
  useEffect(() => {
    if (!billId || !mine || !bill || bill.demo || bill.payments[mine]) return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") fetch(`/api/bills/${billId}/verify`, { method: "POST" }).catch(() => null);
    }, 15000);
    return () => clearInterval(t);
  }, [billId, mine, bill]);

  async function take(p: Participant) {
    setError("");
    const res = await fetch(`/api/bills/${billId}/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-guest-token": token },
      body: JSON.stringify({ numRef: p.numRef }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    if (res?.ok) {
      setMine(p.numRef);
      setPush({ state: "idle" });
      setShowQr(false);
    } else setError(data.error || "No se pudo tomar el lugar. Intenta de nuevo.");
    load();
  }

  async function letGo() {
    if (!mine) return;
    await fetch(`/api/bills/${billId}/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-guest-token": token },
      body: JSON.stringify({ numRef: mine, release: true }),
    }).catch(() => null);
    setMine(null);
    load();
  }

  async function sendPush(p: Participant) {
    setPush({ state: "sending" });
    const res = await fetch(`/api/bills/${billId}/push`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-guest-token": token },
      body: JSON.stringify({ numRef: p.numRef, phone }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    if (res?.ok) setPush({ state: "sent" });
    else setPush({ state: "error", msg: data.error || "No se pudo enviar. Usa el QR." });
  }

  async function simulate(p: Participant) {
    await fetch(`/api/bills/${billId}/simulate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ numRef: p.numRef }),
    }).catch(() => null);
    load();
  }

  const header = (
    <header className="text-center">
      <h1 className="display text-[32px] font-extrabold leading-tight">Mesa {table}</h1>
    </header>
  );

  if (billId === undefined || (billId && bill?.id !== billId)) {
    return <main className="mx-auto w-full max-w-md flex-1 px-5 pt-10">{header}<p className="mt-10 text-center text-muted">Cargando...</p></main>;
  }

  if (!billId || !bill) {
    return (
      <main className="mx-auto w-full max-w-md flex-1 px-5 pt-10">
        {header}
        <p className="mt-10 text-center text-[17px]">Todavía no hay cuenta abierta en esta mesa.</p>
        <p className="mt-2 text-center text-[15px] text-muted">Pide la cuenta a tu mesero. Esta página se actualiza sola.</p>
      </main>
    );
  }

  const paid = (ref: string) => Boolean(bill.payments[ref]);
  const n = bill.participants.length;
  const paidCount = Object.keys(bill.payments).length;
  const collected = bill.participants.filter((p) => paid(p.numRef)).reduce((s, p) => s + p.amount, 0);
  const missing = Math.max(0, Math.round((bill.total - collected) * 100) / 100);
  const done = paidCount === n;
  const me = mine ? bill.participants.find((p) => p.numRef === mine) ?? null : null;
  const sorted = [...bill.participants].sort((a, b) => (a.seat ?? 0) - (b.seat ?? 0));

  // Step 3: my part is paid.
  if (me && paid(me.numRef)) {
    const pay = bill.payments[me.numRef];
    return (
      <main className="mx-auto w-full max-w-md flex-1 px-5 pt-10">
        {header}
        <section className="mt-6 rounded-[18px] bg-pagada p-8 text-center text-white">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white text-pagada">
            <Check className="check-draw h-9 w-9" />
          </span>
          <p className="display mt-4 text-[30px] font-extrabold leading-tight">Pago recibido</p>
          <p className="mt-1 text-[17px] text-white/90">
            Lugar {seatLetter(me.seat ?? 0)} · <span className="money font-semibold">{money(me.amount)}</span> · {METHOD[pay.method ?? "codi"]}
          </p>
          <p className="mt-3 text-[13px] text-white/75">Confirmado por tu banco y pey. Gracias.</p>
        </section>
        <p className="mt-6 text-center text-[15px] text-muted">
          {done ? "La mesa ya quedó pagada." : `En la mesa van ${paidCount} de ${n}. Falta ${money(missing)}.`}
        </p>
      </main>
    );
  }

  // Step 2: paying my seat.
  if (me) {
    const until = bill.claims?.[me.numRef];
    return (
      <main className="mx-auto w-full max-w-md flex-1 px-5 pt-10">
        {header}
        <section className="card mt-6 p-5">
          <div className="flex items-baseline justify-between gap-4">
            <p className="text-[17px] font-semibold">Lugar {seatLetter(me.seat ?? 0)}</p>
            <p className="money text-[32px] font-extrabold">{money(me.amount)}</p>
          </div>
          <p className="mt-1 text-[13px] text-muted">
            Tu parte de <span className="money">{money(bill.total)}</span>, en partes iguales{bill.tipPct ? `, con propina de ${bill.tipPct}%` : ""}.
          </p>

          <div className="mt-5">
            <p className="text-[15px] font-semibold">Recibe el cobro en la app de tu banco</p>
            {push.state === "sent" ? (
              <p className="mt-2 text-[15px] font-semibold text-pagada">Cobro enviado. Abre la app de tu banco y acéptalo.</p>
            ) : (
              <form
                className="mt-2 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  sendPush(me);
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
                  className="h-12 min-w-0 flex-1 rounded-[10px] border border-line bg-surface px-3 text-[17px] outline-none focus:border-fg"
                />
                <button
                  disabled={phone.length !== 10 || push.state === "sending"}
                  className="h-12 shrink-0 rounded-[10px] bg-fg px-5 text-[15px] font-semibold text-bg disabled:opacity-40"
                >
                  {push.state === "sending" ? "Enviando..." : "Enviar"}
                </button>
              </form>
            )}
            {push.state === "error" && <p className="mt-2 text-[13px] text-danger">{push.msg}</p>}
            <p className="mt-2 text-[12px] text-muted">Tu número solo se usa para enviar este cobro y no se guarda.</p>
          </div>

          <div className="mt-5 border-t border-line pt-4">
            <button onClick={() => setShowQr((v) => !v)} className="text-[15px] font-medium underline">
              {showQr ? "Ocultar mi QR" : "Prefiero pagar con QR"}
            </button>
            {showQr && (
              <div className="mt-3 flex flex-col items-center">
                <div className="rounded-[10px] border border-line bg-white p-3">
                  <QRCodeSVG value={me.qrString} size={220} marginSize={2} bgColor="#FFFFFF" fgColor="#111110" />
                </div>
                <p className="mt-2 text-center text-[13px] text-muted">
                  Guarda una captura y ábrela desde CoDi en tu banco, o pide que alguien lo escanee.
                </p>
              </div>
            )}
          </div>

          {bill.demo && (
            <button onClick={() => simulate(me)} className="mt-5 h-11 w-full rounded-[10px] bg-cobrando-tint text-[15px] font-medium text-cobrando">
              Simular CoDi (modo demo)
            </button>
          )}
        </section>

        <div className="mt-4 flex items-center justify-between text-[13px] text-muted">
          <span>{until ? `Lugar apartado ${mmss(until - now)}` : ""}</span>
          <button onClick={letGo} className="font-medium underline">
            No es mi lugar, soltarlo
          </button>
        </div>
        <p className="mt-8 text-center text-[13px] text-muted">El pago se confirma solo, sin recargar la página.</p>
      </main>
    );
  }

  // Step 1: which seat is mine?
  return (
    <main className="mx-auto w-full max-w-md flex-1 px-5 pt-10">
      {header}
      {done ? (
        <section className="mt-6 rounded-[18px] bg-pagada p-6 text-center text-white">
          <p className="display text-[26px] font-extrabold">Mesa pagada</p>
          <p className="mt-1 text-white/85">Gracias por pagar con Dividí.</p>
        </section>
      ) : (
        <>
          <p className="money mt-6 text-center text-[44px] font-extrabold leading-none">
            <span className="text-[20px] font-semibold text-muted">Falta </span>
            {money(missing)}
          </p>
          <p className="mt-2 text-center text-[15px] text-muted">
            {paidCount} de {n} pagaron · toca tu lugar para pagar tu parte
          </p>
          <p className="mt-4 rounded-[12px] border border-pagada/25 bg-pagada-tint px-4 py-3 text-[14px]">
            <span className="font-semibold text-pagada">Paga con CoDi y apoya a este lugar.</span> Con tarjeta, el restaurante paga comisión por cada
            cobro.
          </p>
        </>
      )}
      {error && <p className="mt-4 text-center text-[14px] text-danger">{error}</p>}
      <div className="card mt-5 divide-y divide-line">
        {sorted.map((p) => {
          const pay = bill.payments[p.numRef];
          const busy = !pay && bill.claims?.[p.numRef];
          return (
            <button
              key={p.numRef}
              disabled={Boolean(pay || busy)}
              onClick={() => take(p)}
              className="flex w-full items-center gap-3 px-4 py-4 text-left disabled:cursor-default"
            >
              <span
                className={`display flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[15px] font-bold text-white ${
                  pay ? "bg-pagada" : busy ? "bg-faint" : "bg-cobrando"
                }`}
              >
                {pay ? <Check className="h-5 w-5" /> : seatLetter(p.seat ?? 0)}
              </span>
              <span className="flex-1">
                <span className="block text-[17px] font-medium">{p.seat !== undefined ? `Lugar ${seatLetter(p.seat)}` : p.name}</span>
                <span className="block text-[13px] text-muted">
                  {pay ? `Pagado · ${METHOD[pay.method ?? "codi"]}` : busy ? "En proceso en otro celular" : "Toca para pagar"}
                </span>
              </span>
              {pay ? <PaidStamp size="sm" /> : <span className="money text-[17px] font-semibold">{money(p.amount)}</span>}
            </button>
          );
        })}
      </div>
    </main>
  );
}
