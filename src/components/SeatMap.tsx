import type { CSSProperties, ReactNode } from "react";

/**
 * A table drawn from above, as the waiter sees it: the bottom of the screen is
 * where the waiter stands. Seats are numbered clockwise from the top left.
 */
export function seatSides(capacity: number): { top: number[]; right: number[]; bottom: number[]; left: number[] } {
  if (capacity <= 4) return { top: [0], right: [1], bottom: [2], left: [3] };
  if (capacity <= 6) return { top: [0, 1], right: [2], bottom: [4, 3], left: [5] };
  return { top: [0, 1, 2], right: [3], bottom: [6, 5, 4], left: [7] };
}

/** Width of the table surface relative to its height. */
export const tableRatio = (capacity: number) => (capacity <= 4 ? 1 : capacity <= 6 ? 1.5 : 2);

export default function SeatMap({
  capacity,
  renderSeat,
  children,
  surfaceClassName = "",
  surfaceStyle,
  gap = 8,
  spread = false,
}: {
  capacity: number;
  renderSeat: (seat: number) => ReactNode;
  children?: ReactNode;
  surfaceClassName?: string;
  surfaceStyle?: CSSProperties;
  gap?: number;
  /** Spread top and bottom seats evenly along the table edge. */
  spread?: boolean;
}) {
  const s = seatSides(capacity);
  const row = (seats: number[], gridRow: number) => (
    <div
      className={spread ? "flex w-full justify-around" : "flex justify-center"}
      style={{ gridRow, gridColumn: spread ? "2" : "1 / span 3", gap: spread ? undefined : gap * 2 }}
    >
      {seats.map((i) => (
        <div key={i}>{renderSeat(i)}</div>
      ))}
    </div>
  );
  return (
    <div className="inline-grid grid-cols-[auto_auto_auto] items-center justify-items-center" style={{ gap }}>
      {row(s.top, 1)}
      <div style={{ gridRow: 2, gridColumn: 1 }}>{s.left.map((i) => <div key={i}>{renderSeat(i)}</div>)}</div>
      <div
        className={`flex flex-col items-center justify-center text-center ${surfaceClassName}`}
        style={{ gridRow: 2, gridColumn: 2, ...surfaceStyle }}
      >
        {children}
      </div>
      <div style={{ gridRow: 2, gridColumn: 3 }}>{s.right.map((i) => <div key={i}>{renderSeat(i)}</div>)}</div>
      {row(s.bottom, 3)}
    </div>
  );
}

export function Check({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={3}>
      <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The "PAGADO" rubber stamp. */
export function PaidStamp({ method, size = "md", animate }: { method?: string; size?: "sm" | "md" | "lg"; animate?: boolean }) {
  const cls = size === "lg" ? "px-4 py-1.5 text-[30px] border-[4px]" : size === "sm" ? "px-1.5 py-0.5 text-[12px] border-2" : "px-3 py-1 text-[20px] border-[3px]";
  return (
    <div className={`flex flex-col items-center ${animate ? "stamp-in" : ""}`} style={{ transform: "rotate(-6deg)" }}>
      <span className={`display rounded-[8px] border-pagada font-extrabold uppercase leading-none tracking-wide text-pagada ${cls}`}>
        Pagado
      </span>
      {method && <span className={`mt-1 font-medium text-pagada ${size === "sm" ? "text-[10px]" : "text-[13px]"}`}>{method}</span>}
    </div>
  );
}
