"use client";

import { Suspense, useEffect, useState } from "react";
import type { TableSummary } from "../api/tables/route";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { RESTAURANT_NAME, seatsFor } from "@/lib/restaurant";
import SeatMap, { tableRatio } from "@/components/SeatMap";
import { money } from "@/lib/format";
import { PinForm, useWaiter } from "@/components/Waiter";


function Segmented<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex rounded-[10px] bg-surface-2 p-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded-[8px] px-1.5 py-2 text-[15px] transition-colors sm:px-3 ${
            value === o.value ? "bg-surface font-medium text-fg shadow-[var(--shadow)]" : "text-muted hover:text-fg"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex items-baseline gap-2 ${strong ? "text-fg" : "text-muted"}`}>
      <span className={strong ? "text-[17px] font-semibold" : "text-[15px]"}>{label}</span>
      <span className="mb-1 flex-1 border-b border-dotted border-line" />
      <span className={`money ${strong ? "text-[32px] font-semibold" : "text-[15px]"}`}>{value}</span>
    </div>
  );
}

function CobrarForm() {
  const router = useRouter();
  const params = useSearchParams();
  const initialTable = Number(params.get("mesa")) || 0;
  const restaurant = initialTable > 0;

  const table = initialTable || 1;
  const capacity = seatsFor(table);
  const [seats, setSeats] = useState<number[]>([]); // seat positions that will pay, in tap order
  const [seatNames, setSeatNames] = useState<Record<number, string>>({});
  const [concept, setConcept] = useState("");
  const [subtotal, setSubtotal] = useState("");
  const [tip, setTip] = useState<number | null>(null); // the waiter must choose, nothing is preselected
  const [customTip, setCustomTip] = useState("");
  const [mode, setMode] = useState<"uno" | "dividir">(restaurant ? "uno" : "dividir");
  const [names, setNames] = useState<string[]>(["", "", ""]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { ready, waiter, unlock, headers } = useWaiter();

  // An occupied table already has its consumption and seated guests: bring them in.
  useEffect(() => {
    if (!restaurant) return;
    let alive = true;
    fetch("/api/tables", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((all: TableSummary[]) => {
        const t = all.find((x) => x.table === table);
        if (!alive || !t || t.live || t.status !== "ocupada") return;
        if (t.amount) setSubtotal((v) => v || String(t.amount));
        const occupied = t.seats.map((st, i) => (st === "occupied" ? i : -1)).filter((i) => i >= 0);
        setSeats((v) => (v.length ? v : occupied));
        if (occupied.length > 1) setMode("dividir");
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [restaurant, table]);

  const splitMode = mode === "dividir";
  const tipPct = tip === null ? 0 : tip === -1 ? Number(customTip) || 0 : tip;
  const base = Number(subtotal) || 0;
  const total = Math.round(base * (1 + tipPct / 100) * 100) / 100;
  const bySeat = restaurant && splitMode;
  const sortedSeats = [...seats].sort((a, b) => a - b);
  const people = !splitMode ? 1 : bySeat ? seats.length : names.length;
  const canSubmit = base > 0 && tip !== null && (!bySeat || seats.length >= 2);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const finalNames = !splitMode
        ? ["Cliente"]
        : bySeat
          ? sortedSeats.map((x) => seatNames[x]?.trim() || `Lugar ${x + 1}`)
          : names.map((n, i) => n.trim() || `Persona ${i + 1}`);
      const res = await fetch("/api/bills", {
        method: "POST",
        headers: headers({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          concept: restaurant ? `${RESTAURANT_NAME} - Mesa ${table}` : concept,
          subtotal: base,
          tipPct,
          table: restaurant ? table : undefined,
          names: finalNames,
          seats: bySeat ? sortedSeats : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Algo salió mal");
      router.push(`/cuenta/${data.id}`);
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  const label = "text-[13px] text-muted";

  if (ready && !waiter) {
    return (
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col items-center px-5 pt-16">
        <PinForm onUnlock={unlock} title={restaurant ? `Cobrar mesa ${table}` : "Dividir entre amigos"} />
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-[920px] flex-1 px-5 pt-6 pb-32 md:pb-0">
      <Link href="/" className="text-[15px] text-muted hover:text-fg">
        ← Mesas
      </Link>
      <h1 className="mt-4 text-[36px] font-extrabold">{restaurant ? `Cobrar mesa ${table}` : "Dividir entre amigos"}</h1>

      <form onSubmit={submit} className="mt-8 grid gap-10 md:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-8">
        {!restaurant && (
          <label className="block">
            <span className={label}>Concepto</span>
            <input
              className="mt-2 block w-full rounded-[10px] border border-line bg-surface px-4 py-3 text-[17px] outline-none focus:border-fg"
              placeholder="Cena de viernes"
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
            />
          </label>
        )}

        <label className="block">
          <span className={label}>Consumo</span>
          <div className="mt-1 flex items-baseline gap-2 border-b border-line focus-within:border-fg">
            <span className="money text-[40px] text-faint">$</span>
            <input
              className="money w-full bg-transparent py-2 text-[56px] font-semibold outline-none placeholder:text-faint"
              type="number"
              step="0.01"
              min="0.01"
              inputMode="decimal"
              placeholder="0.00"
              value={subtotal}
              onChange={(e) => setSubtotal(e.target.value)}
              required
            />
          </div>
        </label>

        <div>
          <span className={label}>Propina{tip === null ? " (elige una opción)" : ""}</span>
          <div className="mt-2">
            <Segmented
              value={tip ?? -99}
              onChange={(v: number) => setTip(v)}
              options={[
                { value: 0, label: "Sin propina" },
                { value: 10, label: "10%" },
                { value: 15, label: "15%" },
                { value: -1, label: "Otra" },
              ]}
            />
          </div>
          {tip === -1 && (
            <div className="mt-3 flex items-center gap-2">
              <input
                className="money w-24 rounded-[10px] border border-line bg-surface px-3 py-2 text-[17px] outline-none focus:border-fg"
                type="number"
                min="0"
                max="100"
                placeholder="0"
                value={customTip}
                onChange={(e) => setCustomTip(e.target.value)}
              />
              <span className="text-muted">%</span>
            </div>
          )}
        </div>

        <div>
          <span className={label}>¿Quién paga?</span>
          <div className="mt-2">
            <Segmented
              value={mode}
              onChange={setMode}
              options={[
                { value: "uno", label: "Uno solo" },
                { value: "dividir", label: "Cada quien su parte" },
              ]}
            />
          </div>
        </div>

        {bySeat && (
          <div>
            <span className={label}>¿Quiénes pagan? Toca los lugares ocupados</span>
            <div className="mt-4 flex flex-col items-center">
              <SeatMap
                capacity={capacity}
                gap={10}
                spread
                surfaceClassName="rounded-[18px] border-2 border-fg bg-surface shadow-[var(--shadow)]"
                surfaceStyle={{ height: 120, width: 120 * tableRatio(capacity) }}
                renderSeat={(i) => {
                  const on = seats.includes(i);
                  return (
                    <button
                      type="button"
                      aria-pressed={on}
                      aria-label={`Lugar ${i + 1}`}
                      onClick={() => setSeats(on ? seats.filter((x) => x !== i) : [...seats, i])}
                      className={`display flex h-12 w-12 items-center justify-center rounded-full text-[17px] font-bold transition-colors ${
                        on ? "bg-cobrando text-white" : "border-2 border-dashed border-faint text-faint hover:border-fg hover:text-fg"
                      }`}
                    >
                      {i + 1}
                    </button>
                  );
                }}
              >
                <span className="display text-[40px] font-extrabold leading-none">{table}</span>
                <span className="text-[13px] text-muted">{seats.length} de {capacity}</span>
              </SeatMap>
              <p className="mt-3 rounded-full bg-surface-2 px-3 py-1 text-[13px] text-muted">Tú estás aquí, abajo de la pantalla</p>
            </div>
            {seats.length > 0 && (
              <div className="card mt-5 divide-y divide-line">
                {sortedSeats.map((x) => (
                  <div key={x} className="flex items-center gap-3 px-4">
                    <span className="display flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-cobrando text-[13px] font-bold text-white">
                      {x + 1}
                    </span>
                    <input
                      className="w-full bg-transparent py-3 text-[17px] outline-none placeholder:text-faint"
                      placeholder={`Lugar ${x + 1} (nombre opcional)`}
                      value={seatNames[x] ?? ""}
                      onChange={(e) => setSeatNames({ ...seatNames, [x]: e.target.value })}
                    />
                  </div>
                ))}
              </div>
            )}
            {seats.length === 1 && <p className="mt-2 text-[13px] text-muted">Elige al menos dos lugares, o cambia a Uno solo.</p>}
          </div>
        )}

        {splitMode && !bySeat && (
          <div>
            <span className={label}>Personas</span>
            <div className="card mt-2 divide-y divide-line">
              {names.map((n, i) => (
                <div key={i} className="flex items-center gap-3 px-4">
                  <input
                    className="w-full bg-transparent py-3 text-[17px] outline-none placeholder:text-faint"
                    placeholder={`Persona ${i + 1}`}
                    value={n}
                    onChange={(e) => setNames(names.map((x, j) => (j === i ? e.target.value : x)))}
                  />
                  {names.length > 2 && (
                    <button
                      type="button"
                      className="text-[13px] text-muted hover:text-danger"
                      onClick={() => setNames(names.filter((_, j) => j !== i))}
                    >
                      Quitar
                    </button>
                  )}
                </div>
              ))}
            </div>
            {names.length < 20 && (
              <button
                type="button"
                className="mt-3 text-[15px] font-medium text-fg underline underline-offset-4"
                onClick={() => setNames([...names, ""])}
              >
                Agregar persona
              </button>
            )}
          </div>
        )}

        </div>

        <aside className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-bg p-4 md:sticky md:top-6 md:self-start md:rounded-[16px] md:border md:p-6 md:shadow-[var(--shadow)]">
          <div className="hidden space-y-2 md:block">
            <Row label="Consumo" value={money(base)} />
            <Row label={tip === null ? "Propina" : `Propina ${tipPct}%`} value={tip === null ? "por elegir" : money(total - base)} />
            <Row label="Total" value={money(total)} strong />
          </div>
          <div className="flex items-baseline justify-between md:mt-4">
            <span className="text-[15px] text-muted md:hidden">Total {money(total)}</span>
            {people > 1 && (
              <span className="money text-[17px] font-semibold md:ml-auto">{money(total / people)} por persona</span>
            )}
          </div>
          {error && <p className="mt-3 rounded-[10px] bg-surface-2 px-4 py-3 text-[15px] text-danger">{error}</p>}
          <button
            disabled={loading || !canSubmit}
            className="mt-3 h-14 w-full rounded-[12px] bg-accent text-[17px] font-semibold text-on-accent transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {loading
              ? "Generando cobros..."
              : base > 0 && tip === null
                ? "Elige la propina"
                : !canSubmit
                ? "Generar cobros"
                : people > 1
                  ? `Generar cobros de ${money(total / people)} c/u`
                  : `Generar cobro de ${money(total)}`}
          </button>
          <p className="mt-2 hidden text-center text-[13px] text-muted md:block">Un QR de CoDi por persona, sin comisión por cobro</p>
        </aside>
      </form>
    </main>
  );
}

export default function CobrarPage() {
  return (
    <Suspense fallback={<p className="p-10 text-muted">Cargando...</p>}>
      <CobrarForm />
    </Suspense>
  );
}
