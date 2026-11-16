import { Redis } from "@upstash/redis";
import type { Bill, BillView, Payment } from "./types";

// Uses Upstash Redis when configured (Vercel Marketplace sets KV_REST_API_*),
// otherwise an in-memory store that only works for local testing.
const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = url && token ? new Redis({ url, token }) : null;

type Mem = { kv: Map<string, string>; hashes: Map<string, Map<string, string>> };
const g = globalThis as unknown as { __mem?: Mem };
const mem: Mem = g.__mem ?? (g.__mem = { kv: new Map(), hashes: new Map() });

const TTL = 60 * 60 * 24 * 7; // 7 days

// Preview deployments share the database with production: keep their data apart.
const PREFIX = process.env.VERCEL_ENV === "preview" ? "pv:" : "";
const k = (key: string) => PREFIX + key;

export const usingRedis = Boolean(redis);

async function setNX(rawKey: string, value: string): Promise<boolean> {
  const key = k(rawKey);
  if (redis) return (await redis.set(key, value, { nx: true, ex: TTL })) === "OK";
  if (mem.kv.has(key)) return false;
  mem.kv.set(key, value);
  return true;
}

async function get(rawKey: string): Promise<string | null> {
  const key = k(rawKey);
  if (redis) {
    const v = await redis.get<unknown>(key);
    if (v == null) return null;
    return typeof v === "string" ? v : JSON.stringify(v);
  }
  return mem.kv.get(key) ?? null;
}

async function set(rawKey: string, value: string) {
  const key = k(rawKey);
  if (redis) await redis.set(key, value, { ex: TTL });
  else mem.kv.set(key, value);
}

async function hsetnx(rawKey: string, field: string, value: string): Promise<boolean> {
  const key = k(rawKey);
  if (redis) {
    const r = await redis.hsetnx(key, field, value);
    await redis.expire(key, TTL);
    return r === 1;
  }
  const h = mem.hashes.get(key) ?? new Map<string, string>();
  mem.hashes.set(key, h);
  if (h.has(field)) return false;
  h.set(field, value);
  return true;
}

async function hgetall(rawKey: string): Promise<Record<string, string>> {
  const key = k(rawKey);

  if (redis) {
    const r = await redis.hgetall<Record<string, unknown>>(key);
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(r ?? {})) out[k] = typeof v === "string" ? v : JSON.stringify(v);
    return out;
  }
  return Object.fromEntries(mem.hashes.get(key) ?? new Map());
}

async function del(rawKey: string) {
  const key = k(rawKey);
  if (redis) await redis.del(key);
  else mem.kv.delete(key);
}

/** Reserve a unique 7-digit reference number for pey. */
export async function reserveNumRef(billId: string): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const ref = String(Math.floor(1000000 + Math.random() * 9000000));
    if (await setNX(`ref:${ref}`, billId)) return ref;
  }
  throw new Error("No se pudo generar una referencia única");
}

export async function saveBill(bill: Bill) {
  await set(`bill:${bill.id}`, JSON.stringify(bill));
}

export async function getBill(id: string): Promise<BillView | null> {
  const raw = await get(`bill:${id}`);
  if (!raw) return null;
  const bill = JSON.parse(raw) as Bill;
  const paid = await hgetall(`paid:${id}`);
  const payments: Record<string, Payment> = {};
  for (const [ref, v] of Object.entries(paid)) payments[ref] = JSON.parse(v);
  return { ...bill, payments };
}

export async function billIdForRef(numRef: string): Promise<string | null> {
  return get(`ref:${numRef}`);
}

/** Returns false if this transaction was already processed (duplicate webhook). */
export async function claimTransaction(transactionId: string): Promise<boolean> {
  return setNX(`tx:${transactionId}`, "1");
}

/** Atomically marks one participant as paid. Returns false if already paid. */
export async function markPaid(billId: string, numRef: string, payment: Payment): Promise<boolean> {
  return hsetnx(`paid:${billId}`, numRef, JSON.stringify(payment));
}

/** Restaurant tables: remember which bill is open on each table. */
export async function setTableBill(table: number, billId: string) {
  await set(`table:${table}`, billId);
}

export async function getTableBill(table: number): Promise<BillView | null> {
  const id = await get(`table:${table}`);
  return id ? getBill(id) : null;
}

/** Frees a table so it can be charged again. The bill itself is kept. */
export async function clearTableBill(table: number) {
  await del(`table:${table}`);
}

/** Push charges (CoDi por notificación) sent for one guest: pey transaction ids. */
export async function getPushes(billId: string, numRef: string): Promise<string[]> {
  const raw = await get(`push:${billId}:${numRef}`);
  return raw ? (JSON.parse(raw) as string[]) : [];
}

export async function addPush(billId: string, numRef: string, transactionId: string) {
  const list = await getPushes(billId, numRef);
  await set(`push:${billId}:${numRef}`, JSON.stringify([...list, transactionId]));
}

/**
 * "En proceso": a guest tapped a seat on their own phone. Other phones see it as taken
 * until that guest pays, lets it go, or CLAIM_SECONDS pass. Each seat keeps its own
 * CoDi charge, so even if two people pay the same seat the second payment is visible.
 */
export const CLAIM_SECONDS = 180;
type Claim = { token: string; until: number };
const memClaims = (g as unknown as { __claims?: Map<string, Claim> }).__claims ??
  ((g as unknown as { __claims?: Map<string, Claim> }).__claims = new Map());

async function readClaim(billId: string, numRef: string): Promise<Claim | null> {
  const key = k(`claim:${billId}:${numRef}`);
  if (redis) {
    const v = await redis.get<unknown>(key);
    if (v == null) return null;
    return (typeof v === "string" ? JSON.parse(v) : v) as Claim;
  }
  const c = memClaims.get(key);
  if (!c || c.until <= Date.now()) {
    memClaims.delete(key);
    return null;
  }
  return c;
}

/** Takes a seat for this phone. Returns false if another phone holds it. Renews it if it is ours. */
export async function claimSeat(billId: string, numRef: string, token: string): Promise<boolean> {
  const key = k(`claim:${billId}:${numRef}`);
  const claim: Claim = { token, until: Date.now() + CLAIM_SECONDS * 1000 };
  const current = await readClaim(billId, numRef);
  if (current && current.token !== token) return false;
  if (redis) {
    if (current) {
      await redis.set(key, JSON.stringify(claim), { ex: CLAIM_SECONDS });
      return true;
    }
    return (await redis.set(key, JSON.stringify(claim), { nx: true, ex: CLAIM_SECONDS })) === "OK";
  }
  memClaims.set(key, claim);
  return true;
}

/** Lets a seat go. Only the phone that holds it (or the waiter, with force) can do it. */
export async function releaseSeat(billId: string, numRef: string, token: string | null, force = false) {
  const current = await readClaim(billId, numRef);
  if (!current || (!force && current.token !== token)) return;
  const key = k(`claim:${billId}:${numRef}`);
  if (redis) await redis.del(key);
  else memClaims.delete(key);
}

/** Who holds each seat right now, without exposing the tokens. */
export async function getClaims(bill: Bill): Promise<Record<string, Claim>> {
  const out: Record<string, Claim> = {};
  await Promise.all(
    bill.participants.map(async (p) => {
      const c = await readClaim(bill.id, p.numRef);
      if (c) out[p.numRef] = c;
    })
  );
  return out;
}

/**
 * Short lock so many phones looking at the same table do not all ask pey at once.
 * Returns true for the first caller in each window of `seconds`.
 */
const memLocks = (g as unknown as { __locks?: Map<string, number> }).__locks ??
  ((g as unknown as { __locks?: Map<string, number> }).__locks = new Map());
export async function tryLock(rawKey: string, seconds: number): Promise<boolean> {
  const key = k(`lock:${rawKey}`);
  if (redis) return (await redis.set(key, "1", { nx: true, ex: seconds })) === "OK";
  const until = memLocks.get(key);
  if (until && until > Date.now()) return false;
  memLocks.set(key, Date.now() + seconds * 1000);
  return true;
}

export async function releaseLock(rawKey: string) {
  const key = k(`lock:${rawKey}`);
  if (redis) await redis.del(key);
  else memLocks.delete(key);
}
