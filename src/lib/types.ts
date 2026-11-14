export type Participant = {
  name: string;
  amount: number; // MXN
  numRef: string; // 7 digits, unique, sent to pey
  qrId: string; // IDC from Banxico (or demo id)
  qrString: string; // payload to draw the QR
};

export type Payment = {
  paidAt: number; // unix ms
  transactionId: string;
  amount: number;
};

export type Bill = {
  id: string;
  concept: string;
  total: number;
  createdAt: number;
  demo: boolean;
  participants: Participant[];
};

export type BillView = Bill & {
  payments: Record<string, Payment>; // keyed by numRef
};
