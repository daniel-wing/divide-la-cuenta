"use client";

import { useEffect, useState } from "react";

const KEY = "dividi-waiter-pin";

/** Waiter session on this device. Locked means "modo comensal". */
export function useWaiter() {
  const [pin, setPin] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      setPin(localStorage.getItem(KEY));
    } catch {}
    setReady(true);
  }, []);

  function lock() {
    try {
      localStorage.removeItem(KEY);
    } catch {}
    setPin(null);
  }

  async function unlock(value: string): Promise<boolean> {
    const res = await fetch("/api/pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: value }),
    });
    if (!res.ok) return false;
    try {
      localStorage.setItem(KEY, value);
    } catch {}
    setPin(value);
    return true;
  }

  const headers = (extra: Record<string, string> = {}): Record<string, string> => (pin ? { ...extra, "x-waiter-pin": pin } : extra);

  return { pin, ready, waiter: Boolean(pin), lock, unlock, headers };
}

/** PIN form. Used full page (dashboard) or inside a dialog. */
export function PinForm({
  onUnlock,
  title = "Entrar como mesero",
  small,
}: {
  onUnlock: (pin: string) => Promise<boolean>;
  title?: string;
  small?: boolean;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [real, setReal] = useState(false);

  useEffect(() => {
    fetch("/api/pin")
      .then((r) => r.json())
      .then((d: { demo: boolean; hint?: string; real?: boolean }) => {
        setHint(d.demo ? (d.hint ?? null) : null);
        setReal(Boolean(d.real));
      })
      .catch(() => {});
  }, []);

  return (
    <form
      className="mx-auto w-full max-w-[340px] text-center"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const ok = await onUnlock(value);
        setBusy(false);
        setError(!ok);
        if (!ok) setValue("");
      }}
    >
      <h2 className={small ? "text-[17px] font-semibold text-muted" : "text-[24px] font-bold"}>{title}</h2>
      <p className="mt-1 text-[15px] text-muted">Escribe tu código de mesero.</p>
      <input
        autoFocus
        inputMode="numeric"
        type="password"
        autoComplete="off"
        aria-label="Código de mesero"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="display mt-5 block w-full rounded-[12px] border-2 border-line bg-surface px-4 py-3 text-center text-[32px] font-bold tracking-[0.4em] outline-none focus:border-pagada"
      />
      {error && <p className="mt-2 text-[15px] text-danger">Código incorrecto.</p>}
      <button
        disabled={busy || !value}
        className="mt-4 h-12 w-full rounded-[12px] bg-accent text-[17px] font-semibold text-on-accent disabled:opacity-40"
      >
        Desbloquear
      </button>
      {hint && (
        <p className="mt-4 rounded-[10px] bg-cobrando-tint px-3 py-2 text-[15px] text-cobrando">
          Demo: el código es <span className="display font-bold">{hint}</span>
          {real && <span className="mt-1 block text-[13px]">Los cobros son reales. Prueba con centavos, por ejemplo $0.04.</span>}
        </p>
      )}
    </form>
  );
}
