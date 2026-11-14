import { NextResponse } from "next/server";
import { getTableBill } from "@/lib/store";
import { FAKE_TABLES, TABLE_COUNT } from "@/lib/restaurant";

export const dynamic = "force-dynamic";

export type TableSummary = {
  table: number;
  live: boolean;
  status: "libre" | "ocupada" | "pagada" | "cobrando";
  amount?: number;
  guests?: number;
  paidCount?: number;
  billId?: string;
};

export async function GET() {
  const tables: TableSummary[] = await Promise.all(
    Array.from({ length: TABLE_COUNT }, async (_, i) => {
      const n = i + 1;
      const bill = await getTableBill(n);
      if (bill) {
        const paidCount = Object.keys(bill.payments).length;
        const done = paidCount === bill.participants.length;
        return {
          table: n,
          live: true,
          status: done ? "pagada" : "cobrando",
          amount: bill.total,
          guests: bill.participants.length,
          paidCount,
          billId: bill.id,
        } as TableSummary;
      }
      return { table: n, live: false, ...FAKE_TABLES[n] } as TableSummary;
    })
  );
  return NextResponse.json(tables, { headers: { "Cache-Control": "no-store" } });
}
