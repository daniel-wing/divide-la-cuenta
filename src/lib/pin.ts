// Waiter PIN. Set WAITER_PIN in the environment for a real restaurant.
// Without it the app runs with a demo PIN that is shown on the unlock screen.
export const DEMO_PIN = "1234";
export const usingDemoPin = !process.env.WAITER_PIN;
const PIN = process.env.WAITER_PIN || DEMO_PIN;

export const isWaiterPin = (pin: string | null | undefined) => typeof pin === "string" && pin === PIN;

/** True when the request carries the waiter PIN. */
export const isWaiter = (req: Request) => isWaiterPin(req.headers.get("x-waiter-pin"));
