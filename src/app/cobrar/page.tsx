"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { RESTAURANT_NAME, TABLE_COUNT } from "@/lib/restaurant";

const mxn = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

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
          className={`flex-1 rounded-[8px] px-3 py-2 text-[15px] transition-colors ${
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

  const [table, setTable] = useState(initialTable || 1);
  const [concept, setConcept] = useState("");
  const [subtotal, setSubtotal] = useState("");
  const [tip, setTip] = useState<number>(10);
  const [customTip, setCustomTip] = useState("");
  const [mode, setMode] = useState<"uno" | "dividir">(restaurant ? "uno" : "dividir");
  const [names, setNames] = useState<string[]>(["", "", ""]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const splitMode = mode === "dividir";
  const tipPct = tip === -1 ? Number(customTip) || 0 : tip;
  const base = Number(subtotal) || 0;
  const total = Math.round(base * (1 + tipPct / 100) * 100) / 100;
  const people = splitMode ? names.length : 1;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const finalNames = splitMode ? names.map((n, i) => n.trim() || `Persona ${i + 1}`) : ["Cliente"];
      const res = await fetch("/api/bills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          concept: restaurant ? `${RESTAURANT_NAME} - Mesa ${table}` : concept,
          subtotal: base,
          tipPct,
          table: restaurant ? table : undefined,
          names: finalNames,
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

  return (
    <main className="mx-auto w-full max-w-[520px] flex-1 px-5 pt-6 pb-28 md:pb-0">
      <Link href="/" className="text-[15px] text-muted hover:text-fg">
        ← Mesas
      </Link>
      <h1 className="mt-4 text-[32px] font-semibold">{restaurant ? `Cobrar mesa ${table}` : "Dividir entre amigos"}</h1>

      <form onSubmit={submit} className="mt-8 space-y-8">
        {restaurant ? (
          <label className="block">
            <span className={label}>Mesa</span>
            <select
              className="mt-2 block w-full rounded-[10px] border border-line bg-surface px-4 py-3 text-[17px] outline-none focus:border-fg"
              value={table}
              onChange={(e) => setTable(Number(e.target.value))}
            >
              {Array.from({ length: TABLE_COUNT }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  Mesa {i + 1}
                </option>
              ))}
            </select>
          </label>
        ) : (
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
          <span className={label}>Propina</span>
          <div className="mt-2">
            <Segmented
              value={tip}
              onChange={setTip}
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
          <span className={label}>¿Cómo pagan?</span>
          <div className="mt-2">
            <Segmented
              value={mode}
              onChange={setMode}
              options={[
                { value: "uno", label: "Una persona" },
                { value: "dividir", label: "Dividir la cuenta" },
              ]}
            />
          </div>
        </div>

        {splitMode && (
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

        {base > 0 && (
          <div className="space-y-2">
            <Row label="Consumo" value={mxn.format(base)} />
            <Row label={`Propina ${tipPct}%`} value={mxn.format(total - base)} />
            <Row label="Total" value={mxn.format(total)} strong />
            {people > 1 && <p className="money text-right text-[15px] text-muted">{mxn.format(total / people)} por persona</p>}
          </div>
        )}

        {error && <p className="rounded-[10px] bg-surface-2 px-4 py-3 text-[15px] text-danger">{error}</p>}

        <div className="fixed inset-x-0 bottom-0 bg-bg p-4 md:static md:bg-transparent md:p-0">
          <button
            disabled={loading}
            className="h-14 w-full rounded-[10px] bg-accent text-[17px] font-semibold text-on-accent transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Generando QR..." : base > 0 ? `Cobrar ${mxn.format(total)}` : "Cobrar"}
          </button>
        </div>
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
