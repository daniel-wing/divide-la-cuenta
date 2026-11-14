"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  const [concept, setConcept] = useState("");
  const [total, setTotal] = useState("");
  const [names, setNames] = useState<string[]>(["", "", ""]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const filled = names.filter((n) => n.trim()).length;
  const perPerson = filled > 0 && Number(total) > 0 ? Number(total) / filled : 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/bills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ concept, total: Number(total), names }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Algo salió mal");
      router.push(`/cuenta/${data.id}`);
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-5 py-12">
      <p className="text-sm font-semibold uppercase tracking-widest text-emerald-600">Pagos CoDi con pey</p>
      <h1 className="mt-2 text-4xl font-bold tracking-tight">Divide la cuenta</h1>
      <p className="mt-3 text-neutral-500">
        Cada quien paga su parte desde su banco escaneando un QR. La pantalla se actualiza sola, sin pedir
        capturas.
      </p>

      <form onSubmit={submit} className="mt-10 space-y-6">
        <label className="block">
          <span className="text-sm font-medium">Concepto</span>
          <input
            className="mt-1 w-full rounded-xl border border-neutral-300 bg-transparent px-4 py-3 outline-none focus:border-emerald-500"
            placeholder="Cena de viernes"
            value={concept}
            onChange={(e) => setConcept(e.target.value)}
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium">Total (MXN)</span>
          <input
            className="mt-1 w-full rounded-xl border border-neutral-300 bg-transparent px-4 py-3 text-2xl outline-none focus:border-emerald-500"
            type="number"
            step="0.01"
            min="0.01"
            inputMode="decimal"
            placeholder="0.00"
            value={total}
            onChange={(e) => setTotal(e.target.value)}
            required
          />
        </label>

        <div>
          <span className="text-sm font-medium">Personas</span>
          <div className="mt-2 space-y-2">
            {names.map((n, i) => (
              <div key={i} className="flex gap-2">
                <input
                  className="w-full rounded-xl border border-neutral-300 bg-transparent px-4 py-3 outline-none focus:border-emerald-500"
                  placeholder={`Persona ${i + 1}`}
                  value={n}
                  onChange={(e) => setNames(names.map((x, j) => (j === i ? e.target.value : x)))}
                />
                {names.length > 2 && (
                  <button
                    type="button"
                    aria-label="Quitar"
                    className="rounded-xl border border-neutral-300 px-4 text-neutral-500 hover:text-red-600"
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
              className="mt-3 text-sm font-medium text-emerald-600 hover:underline"
              onClick={() => setNames([...names, ""])}
            >
              + Agregar persona
            </button>
          )}
        </div>

        {perPerson > 0 && (
          <p className="text-neutral-500">
            Aproximadamente <b className="text-current">${perPerson.toFixed(2)}</b> por persona
          </p>
        )}
        {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-red-700">{error}</p>}

        <button
          disabled={loading}
          className="w-full rounded-xl bg-emerald-600 px-4 py-4 text-lg font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {loading ? "Generando cobros..." : "Generar cobros"}
        </button>
      </form>
    </main>
  );
}
