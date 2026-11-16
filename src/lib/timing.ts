// How often the screens ask the server to re-check pending payments with pey (safety net for a late
// or lost webhook). The server joins calls closer than 3 s into one, so many phones are fine.
export const VERIFY_FAST_MS = 5000; // while someone is paying
export const VERIFY_SLOW_MS = 15000; // the rest of the time
