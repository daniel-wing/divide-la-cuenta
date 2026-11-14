"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { RESTAURANT_NAME } from "@/lib/restaurant";
import type { TableSummary } from "./api/tables/route";

const mxn = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

const STYLE: Record<TableSummary["status"], { label: string; card: string; badge: string }> = {
  libre: { label: "Libre", card: "border-neutral-800", badge: "bg-neutral-800 text-neutral-300" },
  ocupada: { label: "Ocupada", card: "border-neutral-700", badge: "bg-sky-900 text-sky-200" },
  cobrando: { label: "Cobrando", card: "border-amber-500", badge: "bg-amber-500 text-black" },
  pagada: { label: "Pagada", card: "border-emerald-600 bg-emerald-950/40", badge: "bg-emerald-600 text-white" },
};

export default function Home() {
  const [tables, setTables] = useState<TableSummary[] | null>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      const res = await fetch("/api/tables", { cache: "no-store" });
      if (alive && res.ok) setTables(await res.json());
    }
    load();
    const t = setInterval(load, 3000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-emerald-500">Cobros CoDi con pey</p>
          <h1 className="mt-1 text-4xl font-bold tracking-tight">{RESTAURANT_NAME}</h1>
          <p className="mt-2 text-neutral-400">Mesas del turno. Toca una mesa para cobrar o ver su cuenta.</p>
        </div>
        <Link href="/cobrar" className="text-sm font-medium text-emerald-500 hover:underline">
          ¿Sin restaurante? Dividir entre amigos
        </Link>
      </div>

      {!tables ? (
        <p className="mt-10 text-neutral-500">Cargando mesas...</p>
      ) : (
        <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
          {tables.map((t) => {
            const s = STYLE[t.status];
            const inner = (
              <>
                <div className="flex items-start justify-between">
                  <p className="text-2xl font-bold">Mesa {t.table}</p>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${s.badge}`}>{s.label}</span>
                </div>
                <div className="mt-6 text-sm text-neutral-400">
                  {t.amount !== undefined && <p className="text-xl font-semibold text-current">{mxn.format(t.amount)}</p>}
                  {t.guests !== undefined && (
                    <p>
                      {t.live && t.paidCount !== undefined
                        ? `${t.paidCount} de ${t.guests} pagaron`
                        : `${t.guests} ${t.guests === 1 ? "persona" : "personas"}`}
                    </p>
                  )}
                  {t.status === "libre" && <p>Disponible</p>}
                </div>
                {t.live && t.status === "cobrando" && (
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-neutral-800">
                    <div
                      className="h-full bg-amber-500 transition-all"
                      style={{ width: `${Math.round(((t.paidCount ?? 0) / (t.guests ?? 1)) * 100)}%` }}
                    />
                  </div>
                )}
              </>
            );
            const cls = `block min-h-40 rounded-3xl border p-5 transition-colors ${s.card}`;
            if (t.live && t.billId) {
              return (
                <Link key={t.table} href={`/cuenta/${t.billId}`} className={`${cls} hover:border-emerald-400`}>
                  {inner}
                </Link>
              );
            }
            if (t.status === "libre" || t.status === "ocupada") {
              return (
                <Link key={t.table} href={`/cobrar?mesa=${t.table}`} className={`${cls} hover:border-emerald-400`}>
                  {inner}
                </Link>
              );
            }
            return (
              <div key={t.table} className={cls}>
                {inner}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
