"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { SeatState, TableSummary } from "./api/tables/route";
import SeatMap, { Check, tableRatio } from "@/components/SeatMap";
import { money } from "@/lib/format";
import { PinForm, useWaiter } from "@/components/Waiter";

const STATUS: Record<TableSummary["status"], { label: string; text: string }> = {
  libre: { label: "Libre", text: "text-faint" },
  ocupada: { label: "Ocupada", text: "text-muted" },
  cobrando: { label: "Cobrando", text: "text-cobrando" },
  pagada: { label: "Pagada", text: "text-pagada" },
};

function Seat({ state }: { state: SeatState }) {
  const base = "flex h-[18px] w-[18px] items-center justify-center rounded-full transition-colors duration-500";
  if (state === "paid")
    return (
      <span className={`${base} bg-pagada text-white`}>
        <Check className="h-3 w-3" />
      </span>
    );
  if (state === "pending") return <span className={`${base} border-[2.5px] border-cobrando bg-cobrando-tint`} />;
  if (state === "occupied") return <span className={`${base} border-2 border-fg bg-surface`} />;
  return <span className={`${base} border-[1.5px] border-line bg-surface-2`} />;
}

function TableTile({ t }: { t: TableSummary }) {
  const s = STATUS[t.status];
  const h = 92;
  const surface =
    t.status === "libre"
      ? "border-2 border-dashed border-faint/60 text-faint"
      : t.status === "pagada"
        ? "bg-pagada text-white"
        : t.status === "cobrando"
          ? "border-[2.5px] border-cobrando bg-surface shadow-[var(--shadow)]"
          : "border-2 border-fg bg-surface shadow-[var(--shadow)]";
  const pending = t.amount !== undefined ? t.amount - (t.paidAmount ?? 0) : undefined;
  const clickable = t.live || t.status === "libre" || t.status === "ocupada";
  const inner = (
    <div className="flex flex-col items-center gap-3">
      <SeatMap
        capacity={t.capacity}
        gap={7}
        spread
        renderSeat={(i) => <Seat state={t.seats[i]} />}
        surfaceClassName={`rounded-[16px] transition-colors duration-500 ${surface}`}
        surfaceStyle={{ height: h, width: h * tableRatio(t.capacity) }}
      >
        {t.status === "pagada" ? (
          <>
            <Check className="h-7 w-7" />
            <span className="display text-[20px] font-bold leading-none">{t.table}</span>
          </>
        ) : (
          <>
            <span className="display text-[34px] font-extrabold leading-none">{t.table}</span>
            {t.status === "cobrando" && pending !== undefined && (
              <span className="money mt-1 text-[15px] font-semibold text-cobrando">{money(pending)}</span>
            )}
            {t.status === "ocupada" && t.amount !== undefined && <span className="money mt-1 text-[15px]">{money(t.amount)}</span>}
          </>
        )}
      </SeatMap>
      <div className="text-center leading-tight">
        <p className={`text-[15px] font-semibold ${s.text}`}>
          {s.label}
          {t.status === "cobrando" && ` · ${t.paidCount} de ${t.guests}`}
        </p>
        <p className="text-[13px] text-muted">
          {t.status === "libre" && `${t.capacity} lugares`}
          {t.status === "ocupada" && `${t.guests} ${t.guests === 1 ? "persona" : "personas"}`}
          {t.status === "cobrando" && `faltan ${money(pending ?? 0)}`}
          {t.status === "pagada" &&
            money(t.amount ?? 0)}
        </p>
      </div>
    </div>
  );
  const cls = `flex justify-center rounded-[18px] p-4 transition-colors ${t.capacity > 4 ? "col-span-2 md:col-span-1" : ""}`;
  if (!clickable) return <div className={cls}>{inner}</div>;
  const href = t.live && t.billId ? `/cuenta/${t.billId}` : `/cobrar?mesa=${t.table}`;
  return (
    <Link href={href} className={`${cls} hover:bg-surface-2 active:scale-[.99]`}>
      {inner}
    </Link>
  );
}

export default function Home() {
  const [tables, setTables] = useState<TableSummary[] | null>(null);
  const { ready, waiter, unlock, lock } = useWaiter();

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
  const hasSample = tables?.some((t) => !t.live && t.status === "pagada") ?? false;
  const cobrado =
    tables?.reduce((s, t) => s + (t.status === "pagada" ? (t.amount ?? 0) : t.status === "cobrando" ? (t.paidAmount ?? 0) : 0), 0) ?? 0;

  if (!ready) return <main className="flex-1" />;

  if (!waiter) {
    return (
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col items-center px-5 pt-10">
        <h1 className="max-w-[560px] text-center text-[30px] font-extrabold leading-tight md:text-[40px]">
          Cada quien paga su parte con CoDi.
          <span className="block text-pagada">Sin terminal y sin comisión por cobro.</span>
        </h1>
        <div className="mt-10 w-full">
          <PinForm onUnlock={unlock} small />
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 pt-8">
      <section className="flex items-end justify-between gap-6">
        <div>
          <h1 className="text-[28px] font-bold leading-tight md:text-[32px]">Mesas</h1>
          <p className="mt-1 text-[15px] text-muted">Toca una mesa para cobrar. Cada círculo es un lugar.</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="whitespace-nowrap text-[13px] text-muted">Total cobrado hoy</p>
          <p className="money text-[32px] font-extrabold leading-none text-pagada md:text-[40px]">{money(cobrado)}</p>
          {hasSample && <p className="mt-1 whitespace-nowrap text-[11px] text-faint">incluye mesas de ejemplo</p>}
        </div>
      </section>

      {!tables ? (
        <p className="mt-6 text-muted">Cargando mesas...</p>
      ) : (
        <div className="mt-6 grid grid-cols-2 items-end gap-x-2 gap-y-4 md:grid-cols-4">
          {tables.map((t) => (
            <TableTile key={t.table} t={t} />
          ))}
        </div>
      )}

      <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2">
        <button onClick={lock} className="h-10 rounded-[10px] bg-surface-2 px-4 text-[15px] font-medium hover:bg-line">
          Bloquear (modo comensal)
        </button>
        <Link href="/cobrar" className="text-[13px] text-faint underline underline-offset-4 hover:text-fg">
          ¿Sin restaurante? Dividir entre amigos
        </Link>
      </div>
    </main>
  );
}
