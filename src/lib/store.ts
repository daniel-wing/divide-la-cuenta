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

export const usingRedis = Boolean(redis);

async function setNX(key: string, value: string): Promise<boolean> {
  if (redis) return (await redis.set(key, value, { nx: true, ex: TTL })) === "OK";
  if (mem.kv.has(key)) return false;
  mem.kv.set(key, value);
  return true;
}

async function get(key: string): Promise<string | null> {
  if (redis) {
    const v = await redis.get<unknown>(key);
    if (v == null) return null;
    return typeof v === "string" ? v : JSON.stringify(v);
  }
  return mem.kv.get(key) ?? null;
}

async function set(key: string, value: string) {
  if (redis) await redis.set(key, value, { ex: TTL });
  else mem.kv.set(key, value);
}

async function hsetnx(key: string, field: string, value: string): Promise<boolean> {
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

async function hgetall(key: string): Promise<Record<string, string>> {
  if (redis) {
    const r = await redis.hgetall<Record<string, unknown>>(key);
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(r ?? {})) out[k] = typeof v === "string" ? v : JSON.stringify(v);
    return out;
  }
  return Object.fromEntries(mem.hashes.get(key) ?? new Map());
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
