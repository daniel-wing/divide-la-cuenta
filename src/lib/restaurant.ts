// Demo restaurant setup. Tables listed here as "fake" are placeholders for the
// demo; any table with a real bill shows its live status instead.
export const RESTAURANT_NAME = "Wingman Dinner";
export const APP_NAME = "Dividí";
export const TABLE_COUNT = 8;

/** Seats per table: half the room are square tables of 4, the rest are larger. */
export const TABLE_SEATS: Record<number, number> = { 1: 4, 2: 4, 3: 4, 4: 4, 5: 6, 6: 6, 7: 8, 8: 8 };
export const seatsFor = (table?: number) => (table && TABLE_SEATS[table]) || 4;

export type FakeStatus = { status: "libre" | "ocupada" | "pagada"; amount?: number; guests?: number };

export const FAKE_TABLES: Record<number, FakeStatus> = {
  1: { status: "ocupada", amount: 840, guests: 2 },
  2: { status: "libre" },
  3: { status: "libre" },
  4: { status: "pagada", amount: 1260, guests: 4 },
  5: { status: "ocupada", amount: 2310, guests: 6 },
  6: { status: "ocupada", amount: 1600, guests: 4 },
  7: { status: "libre" },
  8: { status: "ocupada", amount: 1930, guests: 6 },
};

/** Seats use letters so they never get mixed up with table numbers: "Mesa 7, Lugar C". */
export const seatLetter = (seat: number) => "ABCDEFGH"[seat] ?? String(seat + 1);
