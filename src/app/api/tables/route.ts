import { NextResponse } from "next/server";
import { getTableBill } from "@/lib/store";
import { FAKE_TABLES, TABLE_COUNT, seatsFor } from "@/lib/restaurant";

export const dynamic = "force-dynamic";

export type SeatState = "empty" | "occupied" | "pending" | "paid";

export type TableSummary = {
  table: number;
  live: boolean;
  status: "libre" | "ocupada" | "pagada" | "cobrando";
  capacity: number;
  seats: SeatState[];
  amount?: number;
  paidAmount?: number;
  guests?: number;
  paidCount?: number;
  billId?: string;
  createdAt?: number;
  closedAt?: number;
};

/** Spread n guests around a table so demo tables do not look lopsided. */
function spread(capacity: number, n: number): number[] {
  const order = capacity <= 4 ? [0, 2, 1, 3] : capacity <= 6 ? [0, 4, 1, 3, 2, 5] : [0, 6, 2, 4, 1, 5, 3, 7];
  return order.slice(0, Math.min(n, capacity));
}

export async function GET() {
  const tables: TableSummary[] = await Promise.all(
    Array.from({ length: TABLE_COUNT }, async (_, i) => {
      const n = i + 1;
      const capacity = seatsFor(n);
      const seats: SeatState[] = Array.from({ length: capacity }, () => "empty");
      const bill = await getTableBill(n);
      if (bill) {
        const paidCount = Object.keys(bill.payments).length;
        const done = paidCount === bill.participants.length;
        const hasSeats = bill.participants.every((p) => typeof p.seat === "number" && p.seat < capacity);
        const fallback = spread(capacity, bill.participants.length);
        bill.participants.forEach((p, k) => {
          const pos = hasSeats ? (p.seat as number) : fallback[k];
          if (pos !== undefined) seats[pos] = bill.payments[p.numRef] ? "paid" : "pending";
        });
        const paidAmount = bill.participants.filter((p) => bill.payments[p.numRef]).reduce((s, p) => s + p.amount, 0);
        return {
          table: n,
          live: true,
          status: done ? "pagada" : "cobrando",
          capacity,
          seats,
          amount: bill.total,
          paidAmount,
          guests: bill.participants.length,
          paidCount,
          billId: bill.id,
          createdAt: bill.createdAt,
          closedAt: done ? Math.max(...Object.values(bill.payments).map((x) => x.paidAt)) : undefined,
        } as TableSummary;
      }
      const fake = FAKE_TABLES[n];
      spread(capacity, fake.guests ?? 0).forEach((pos) => (seats[pos] = fake.status === "pagada" ? "paid" : "occupied"));
      return { table: n, live: false, capacity, seats, ...fake } as TableSummary;
    })
  );
  return NextResponse.json(tables, { headers: { "Cache-Control": "no-store" } });
}
