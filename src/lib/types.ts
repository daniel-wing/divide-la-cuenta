export type Participant = {
  name: string;
  amount: number; // MXN, tip included
  numRef: string; // 7 digits, unique, sent to pey
  qrId: string; // IDC from Banxico (or demo id)
  qrString: string; // payload to draw the QR
  seat?: number; // position around the table (0 = top left, clockwise), as the waiter sees it
};

export type PaymentMethod = "codi" | "efectivo" | "tarjeta";

export type Payment = {
  paidAt: number; // unix ms
  transactionId: string;
  amount: number;
  method?: PaymentMethod; // missing = codi (older records)
  receivedAt?: number; // unix ms when our server got pey's webhook
};

export type Bill = {
  id: string;
  concept: string;
  subtotal: number; // before tip
  tipPct: number; // e.g. 10 for 10%
  total: number; // subtotal + tip
  table?: number; // restaurant table number, if any
  seatCount?: number; // seats drawn around the table
  createdAt: number;
  demo: boolean;
  participants: Participant[];
};

export type BillView = Bill & {
  payments: Record<string, Payment>; // keyed by numRef
};
