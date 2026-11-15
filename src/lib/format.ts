const withCents = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
const noCents = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });

/** $330 for whole amounts, $412.50 otherwise. */
export function money(n: number): string {
  return Number.isInteger(Math.round(n * 100) / 100) ? noCents.format(n) : withCents.format(n);
}
