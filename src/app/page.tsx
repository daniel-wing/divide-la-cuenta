"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { TableSummary } from "./api/tables/route";

const mxn = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

const STATUS: Record<TableSummary["status"], { label: string; dot: string; text: string }> = {
  libre: { label: "Libre", dot: "bg-faint", text: "text-faint" },
  ocupada: { label: "Ocupada", dot: "bg-fg", text: "text-fg" },
  cobrando: { label: "Cobrando", dot: "bg-cobrando", text: "text-cobrando" },
  pagada: { label: "Pagada", dot: "bg-pagada", text: "text-pagada" },
};

function Tile({ t }: { t: TableSummary }) {
  const s = STATUS[t.status];
  const base =
    "relative flex min-h-[148px] flex-col justify-between overflow-hidden rounded-[14px] border p-5 transition-[transform,border-color] active:scale-[.99]";
  const look =
    t.status === "libre"
      ? "border-line bg-transparent"
      : t.status === "pagada"
        ? "border-line bg-pagada-tint"
        : "card";
  const clickable = t.live || t.status === "libre" || t.status === "ocupada";
  const inner = (
    <>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[13px] text-muted">Mesa</p>
          <p className={`text-[40px] font-semibold leading-none ${t.status === "libre" ? "text-faint" : ""}`}>{t.table}</p>
        </div>
        <span className={`flex items-center gap-2 text-[13px] font-medium ${s.text}`}>
          <span className={`h-2 w-2 rounded-full ${s.dot}`} />
          {s.label}
        </span>
      </div>
      {t.amount !== undefined && (
        <div className="mt-4">
          <p className="money text-[22px]">{mxn.format(t.amount)}</p>
          <p className="text-[15px] text-muted">
            {t.live && t.paidCount !== undefined
              ? `${t.paidCount} de ${t.guests} pagaron`
              : `${t.guests} ${t.guests === 1 ? "persona" : "personas"}`}
          </p>
        </div>
      )}
      {t.status === "cobrando" && (
        <div className="absolute inset-x-0 bottom-0 h-1 bg-cobrando-tint">
          <div
            className="h-full bg-cobrando transition-all duration-500"
            style={{ width: `${Math.max(8, Math.round(((t.paidCount ?? 0) / (t.guests ?? 1)) * 100))}%` }}
          />
        </div>
      )}
    </>
  );
  if (!clickable) return <div className={`${base} ${look}`}>{inner}</div>;
  const href = t.live && t.billId ? `/cuenta/${t.billId}` : `/cobrar?mesa=${t.table}`;
  return (
    <Link href={href} className={`${base} ${look} hover:border-fg`}>
      {inner}
    </Link>
  );
}

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

  const open = tables?.filter((t) => t.status === "ocupada" || t.status === "cobrando") ?? [];
  const porCobrar = open.reduce((s, t) => s + (t.amount ?? 0), 0);
  const cobrado = tables?.filter((t) => t.status === "pagada").reduce((s, t) => s + (t.amount ?? 0), 0) ?? 0;

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 pt-8">
      <section className="flex flex-wrap items-end gap-x-12 gap-y-4">
        <div>
          <p className="text-[13px] text-muted">Por cobrar</p>
          <p className="money text-[48px] font-semibold leading-tight">{mxn.format(porCobrar)}</p>
        </div>
        <div>
          <p className="text-[13px] text-muted">Cobrado</p>
          <p className="money text-[22px] text-pagada">{mxn.format(cobrado)}</p>
        </div>
        <div>
          <p className="text-[13px] text-muted">Mesas abiertas</p>
          <p className="money text-[22px]">{open.length}</p>
        </div>
      </section>

      <p className="mt-8 text-[15px] text-muted">Toca una mesa para cobrar.</p>

      {!tables ? (
        <p className="mt-6 text-muted">Cargando mesas...</p>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          {tables.map((t) => (
            <Tile key={t.table} t={t} />
          ))}
        </div>
      )}

      <Link href="/cobrar" className="mt-8 inline-block text-[15px] text-muted underline underline-offset-4 hover:text-fg">
        ¿Sin restaurante? Dividir entre amigos
      </Link>
    </main>
  );
}
