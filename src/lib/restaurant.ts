// Demo restaurant setup. Tables listed here as "fake" are placeholders for the
// demo; any table with a real bill shows its live status instead.
export const RESTAURANT_NAME = "Wingman Dinner";
export const TABLE_COUNT = 8;

export type FakeStatus = { status: "libre" | "ocupada" | "pagada"; amount?: number; guests?: number };

export const FAKE_TABLES: Record<number, FakeStatus> = {
  1: { status: "ocupada", amount: 840, guests: 2 },
  2: { status: "libre" },
  3: { status: "libre" },
  4: { status: "pagada", amount: 1260, guests: 4 },
  5: { status: "ocupada", amount: 2310, guests: 6 },
  6: { status: "ocupada", amount: 1600, guests: 4 },
  7: { status: "libre" },
  8: { status: "ocupada", amount: 530, guests: 1 },
};
