"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { RESTAURANT_NAME, TABLE_COUNT } from "@/lib/restaurant";

const TIPS = [0, 10, 15];
const mxn = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

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
  const [splitMode, setSplitMode] = useState(!restaurant);
  const [names, setNames] = useState<string[]>(["", "", ""]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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

  const input =
    "mt-1 w-full rounded-xl border border-neutral-700 bg-transparent px-4 py-3 outline-none focus:border-emerald-500";
  const chip = (active: boolean) =>
    `rounded-xl border px-4 py-2 text-sm font-medium ${
      active ? "border-emerald-500 bg-emerald-600 text-white" : "border-neutral-700 hover:border-emerald-500"
    }`;

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-5 py-10">
      <Link href="/" className="text-sm text-neutral-400 hover:underline">
        ← {RESTAURANT_NAME}
      </Link>
      <p className="mt-6 text-sm font-semibold uppercase tracking-widest text-emerald-500">
        {restaurant ? RESTAURANT_NAME : "Entre amigos"}
      </p>
      <h1 className="mt-1 text-4xl font-bold tracking-tight">{restaurant ? "Cobrar mesa" : "Divide la cuenta"}</h1>
      <p className="mt-3 text-neutral-400">
        Cada quien paga desde su banco escaneando un QR CoDi. La pantalla se actualiza sola.
      </p>

      <form onSubmit={submit} className="mt-8 space-y-6">
        {restaurant ? (
          <label className="block">
            <span className="text-sm font-medium">Mesa</span>
            <select className={input} value={table} onChange={(e) => setTable(Number(e.target.value))}>
              {Array.from({ length: TABLE_COUNT }, (_, i) => (
                <option key={i + 1} value={i + 1} className="bg-neutral-900">
                  Mesa {i + 1}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="block">
            <span className="text-sm font-medium">Concepto</span>
            <input className={input} placeholder="Cena de viernes" value={concept} onChange={(e) => setConcept(e.target.value)} />
          </label>
        )}

        <label className="block">
          <span className="text-sm font-medium">Consumo (MXN)</span>
          <input
            className={`${input} text-2xl`}
            type="number"
            step="0.01"
            min="0.01"
            inputMode="decimal"
            placeholder="0.00"
            value={subtotal}
            onChange={(e) => setSubtotal(e.target.value)}
            required
          />
        </label>

        <div>
          <span className="text-sm font-medium">Propina</span>
          <div className="mt-2 flex flex-wrap gap-2">
            {TIPS.map((t) => (
              <button type="button" key={t} className={chip(tip === t)} onClick={() => setTip(t)}>
                {t === 0 ? "Sin propina" : `${t}%`}
              </button>
            ))}
            <button type="button" className={chip(tip === -1)} onClick={() => setTip(-1)}>
              Otra
            </button>
            {tip === -1 && (
              <input
                className="w-24 rounded-xl border border-neutral-700 bg-transparent px-3 py-2 text-sm outline-none focus:border-emerald-500"
                type="number"
                min="0"
                max="100"
                placeholder="%"
                value={customTip}
                onChange={(e) => setCustomTip(e.target.value)}
              />
            )}
          </div>
        </div>

        <div>
          <span className="text-sm font-medium">¿Cómo pagan?</span>
          <div className="mt-2 flex gap-2">
            <button type="button" className={chip(!splitMode)} onClick={() => setSplitMode(false)}>
              Una persona paga todo
            </button>
            <button type="button" className={chip(splitMode)} onClick={() => setSplitMode(true)}>
              Dividir la cuenta
            </button>
          </div>
        </div>

        {splitMode && (
          <div>
            <span className="text-sm font-medium">Personas</span>
            <div className="mt-2 space-y-2">
              {names.map((n, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    className="w-full rounded-xl border border-neutral-700 bg-transparent px-4 py-3 outline-none focus:border-emerald-500"
                    placeholder={`Persona ${i + 1}`}
                    value={n}
                    onChange={(e) => setNames(names.map((x, j) => (j === i ? e.target.value : x)))}
                  />
                  {names.length > 2 && (
                    <button
                      type="button"
                      aria-label="Quitar"
                      className="rounded-xl border border-neutral-700 px-4 text-neutral-400 hover:text-red-500"
                      onClick={() => setNames(names.filter((_, j) => j !== i))}
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
            {names.length < 20 && (
              <button
                type="button"
                className="mt-3 text-sm font-medium text-emerald-500 hover:underline"
                onClick={() => setNames([...names, ""])}
              >
                + Agregar persona
              </button>
            )}
          </div>
        )}

        {base > 0 && (
          <div className="rounded-2xl border border-neutral-800 p-4 text-sm">
            <div className="flex justify-between text-neutral-400">
              <span>Consumo</span>
              <span>{mxn.format(base)}</span>
            </div>
            <div className="flex justify-between text-neutral-400">
              <span>Propina ({tipPct}%)</span>
              <span>{mxn.format(total - base)}</span>
            </div>
            <div className="mt-2 flex justify-between text-lg font-semibold">
              <span>Total</span>
              <span>{mxn.format(total)}</span>
            </div>
            {people > 1 && (
              <p className="mt-1 text-right text-neutral-400">≈ {mxn.format(total / people)} por persona</p>
            )}
          </div>
        )}

        {error && <p className="rounded-xl bg-red-950 px-4 py-3 text-red-300">{error}</p>}

        <button
          disabled={loading}
          className="w-full rounded-xl bg-emerald-600 px-4 py-4 text-lg font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {loading ? "Generando cobros..." : "Generar cobro"}
        </button>
      </form>
    </main>
  );
}

export default function CobrarPage() {
  return (
    <Suspense fallback={<p className="p-10 text-neutral-500">Cargando...</p>}>
      <CobrarForm />
    </Suspense>
  );
}
