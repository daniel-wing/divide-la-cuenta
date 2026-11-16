// Pruebas del aviso de pago contra un pey simulado. No usa la llave real ni hace pagos.
//
//   npm run build && npm run prueba:pey
//
// Levanta un pey falso en el puerto 4010 y la app en el 3100 apuntando a él, y revisa:
// webhook firmado, webhook repetido, webhook perdido (lo encuentra la consulta), pey caído un rato
// (reintentos), pey que no contesta (tiempo límite), y que muchas consultas juntas no saturen a pey.
import http from "node:http";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { Webhook } from "standardwebhooks";

const PEY_PORT = 4010;
const APP_PORT = 3100;
const APP = `http://localhost:${APP_PORT}`;
const SECRET = "whsec_" + randomBytes(24).toString("base64"); // secreto de prueba, se genera cada vez
const PIN = "1234";

// ---------- pey simulado ----------
const qrs = new Map(); // qrId -> { numRef, amount, txs: [] }
const pns = new Map(); // txId -> { numRef, amount, status }
const ctl = { failNext: 0, hangNext: 0, reads: 0 };
let seq = 0;

const pey = http.createServer(async (req, res) => {
  const body = await new Promise((r) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => r(b ? JSON.parse(b) : {}));
  });
  const send = (code, data) => {
    res.writeHead(code, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
  };
  if (req.headers.authorization !== "Bearer llave-falsa-de-prueba") return send(401, { error: "auth" });
  if (req.method === "POST" && req.url === "/codi/qr") {
    const id = `qr-${++seq}`;
    qrs.set(id, { numRef: body.numRef, amount: body.amount, txs: [] });
    return send(200, { id, qrString: `SIMULADO|${id}` });
  }
  if (req.method === "POST" && req.url === "/codi/pn") {
    const id = `pn-${++seq}`;
    pns.set(id, { numRef: body.numRef, amount: body.amount, status: "PENDING" });
    return send(200, { transactionId: id });
  }
  if (req.method === "GET") {
    ctl.reads++;
    if (ctl.hangNext > 0) {
      ctl.hangNext--;
      return; // nunca contesta
    }
    if (ctl.failNext > 0) {
      ctl.failNext--;
      return send(503, { error: "pey simulado caído" });
    }
    const m = req.url.match(/^\/transaction\/codi\/qr\/(.+)$/);
    if (m) {
      const qr = qrs.get(decodeURIComponent(m[1]));
      return qr ? send(200, { items: qr.txs }) : send(404, {});
    }
    const t = req.url.match(/^\/transaction\/(.+)$/);
    if (t) {
      const id = decodeURIComponent(t[1]);
      const pn = pns.get(id);
      return pn ? send(200, { id, status: pn.status, amount: pn.amount, datePaid: Math.floor(Date.now() / 1000) }) : send(404, {});
    }
  }
  send(404, {});
});

/** Simula que el comensal pagó el QR en su banco. Devuelve el transactionId. */
function payQr(qrId) {
  const qr = qrs.get(qrId);
  const tx = { id: `tx-${++seq}`, status: "PAID", amount: qr.amount, datePaid: Math.floor(Date.now() / 1000) };
  qr.txs.push(tx);
  return { ...tx, numRef: qr.numRef, qrId };
}

async function sendWebhook(tx, type = "codi.qr.payment_received") {
  const payload = JSON.stringify({ type, amount: tx.amount, codiQrId: tx.qrId, numRef: tx.numRef, transactionId: tx.id, datePaid: tx.datePaid });
  const msgId = `msg_${++seq}`;
  const ts = new Date();
  const signature = new Webhook(SECRET).sign(msgId, ts, payload);
  return fetch(`${APP}/api/webhooks/pey`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "webhook-id": msgId,
      "webhook-timestamp": String(Math.floor(ts.getTime() / 1000)),
      "webhook-signature": signature,
    },
    body: payload,
  });
}

// ---------- ayudas ----------
const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "OK   " : "FALLA"} ${name}${detail ? `  (${detail})` : ""}`);
}
const j = (r) => r.json();
async function newBill(n = 3) {
  const r = await fetch(`${APP}/api/bills`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-waiter-pin": PIN },
    body: JSON.stringify({ concept: "Prueba", subtotal: n * 10, tipPct: 0, names: Array.from({ length: n }, (_, i) => `P${i + 1}`) }),
  });
  const { id } = await j(r);
  return j(await fetch(`${APP}/api/bills/${id}`));
}
const getBill = async (id) => j(await fetch(`${APP}/api/bills/${id}`));
const verify = async (id) => {
  const r = await fetch(`${APP}/api/bills/${id}/verify`, { method: "POST" });
  return { status: r.status, ...(await j(r)) };
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- pruebas ----------
async function run() {
  // 1. Webhook firmado marca el lugar.
  let bill = await newBill();
  check("La cuenta se crea con cobros del pey simulado", bill.participants?.length === 3 && !bill.demo);
  const a = bill.participants[0];
  const txA = payQr(a.qrId);
  let r = await sendWebhook(txA);
  bill = await getBill(bill.id);
  check("Webhook firmado marca PAGADO", r.status === 200 && bill.payments[a.numRef]?.source === "webhook");

  // 2. El mismo webhook dos veces no cambia nada.
  r = await sendWebhook(txA);
  const dup = await j(r);
  check("Webhook repetido se ignora", r.status === 200 && dup.duplicate === true);

  // 3. Webhook con firma mala se rechaza.
  r = await fetch(`${APP}/api/webhooks/pey`, { method: "POST", headers: { "webhook-id": "x", "webhook-timestamp": "1", "webhook-signature": "v1,malo" }, body: "{}" });
  check("Webhook sin firma válida se rechaza", r.status === 401);

  // 4. Webhook perdido: la consulta lo encuentra.
  const b = bill.participants[1];
  payQr(b.qrId); // pagó, pero pey nunca avisa
  let v = await verify(bill.id);
  bill = await getBill(bill.id);
  check("Webhook perdido: la consulta encuentra el pago", v.found === 1 && bill.payments[b.numRef]?.source === "consulta", JSON.stringify(v));

  // 5. Si después llega el webhook atrasado, no se cuenta dos veces.
  const lateTx = { ...qrs.get(b.qrId).txs[0], numRef: b.numRef, qrId: b.qrId };
  r = await sendWebhook(lateTx);
  check("Webhook atrasado después de la consulta se ignora", (await j(r)).duplicate === true);

  // 6. Pey caído dos veces seguidas: los reintentos lo resuelven en la misma consulta.
  await wait(3200); // espera la ventana entre consultas
  const c = bill.participants[2];
  payQr(c.qrId);
  ctl.failNext = 2;
  v = await verify(bill.id);
  bill = await getBill(bill.id);
  check("Pey responde 503 dos veces: el reintento encuentra el pago", v.found === 1 && v.errors === 0 && !!bill.payments[c.numRef], JSON.stringify(v));

  // 7. Pey caído del todo: la consulta no truena, reporta el error y no marca nada.
  let bill2 = await newBill(2);
  payQr(bill2.participants[0].qrId);
  ctl.failNext = 100;
  v = await verify(bill2.id);
  ctl.failNext = 0;
  bill2 = await getBill(bill2.id);
  check("Pey caído: la consulta contesta sin tronar y avisa del error", v.status === 200 && v.errors === 2 && Object.keys(bill2.payments).length === 0, JSON.stringify(v));
  await wait(3200);
  v = await verify(bill2.id);
  check("Cuando pey vuelve, la siguiente consulta encuentra el pago", v.found === 1, JSON.stringify(v));

  // 8. Pey que no contesta: el tiempo límite corta y la consulta termina.
  let bill3 = await newBill(1);
  payQr(bill3.participants[0].qrId);
  ctl.hangNext = 1; // el primer intento se queda colgado, el segundo contesta
  const t0 = Date.now();
  v = await verify(bill3.id);
  const secs = (Date.now() - t0) / 1000;
  check("Pey colgado: tiempo límite y reintento", v.found === 1 && secs < 9, `${secs.toFixed(1)} s`);

  // 9. Diez celulares preguntando a la vez: pey recibe una sola ronda de consultas.
  const bill4 = await newBill(2);
  const before = ctl.reads;
  const many = await Promise.all(Array.from({ length: 10 }, () => verify(bill4.id)));
  const reads = ctl.reads - before;
  check("Diez consultas juntas: pey recibe una sola ronda", many.filter((x) => x.skipped).length === 9 && reads === 2, `${reads} lecturas a pey`);

  // 10. Cobro al celular pagado sin webhook: la consulta lo encuentra.
  await wait(3200);
  const d = bill4.participants[0];
  r = await fetch(`${APP}/api/bills/${bill4.id}/push`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ numRef: d.numRef, phone: "5500000000" }),
  });
  const pnId = [...pns.keys()].pop();
  pns.get(pnId).status = "PAID";
  v = await verify(bill4.id);
  const b4 = await getBill(bill4.id);
  check("Cobro al celular sin webhook: la consulta lo encuentra", r.status === 200 && b4.payments[d.numRef]?.via === "pn", JSON.stringify(v));
}

// ---------- arranque ----------
await new Promise((r) => pey.listen(PEY_PORT, r));
const app = spawn("npx", ["next", "start", "-p", String(APP_PORT)], {
  env: { ...process.env, PEY_BASE_URL: `http://localhost:${PEY_PORT}`, PEY_API_KEY: "llave-falsa-de-prueba", PEY_WEBHOOK_SECRET: SECRET, WAITER_PIN: PIN, DEMO_MODE: "", KV_REST_API_URL: "", KV_REST_API_TOKEN: "", UPSTASH_REDIS_REST_URL: "", UPSTASH_REDIS_REST_TOKEN: "" },
  stdio: process.env.VERBOSE ? "inherit" : "ignore",
});
let code = 1;
try {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${APP}/api/pin`)).ok) break;
    } catch {}
    await wait(500);
  }
  await run();
  const failed = results.filter((x) => !x.ok).length;
  console.log(`\n${results.length - failed} de ${results.length} pruebas pasaron.`);
  code = failed ? 1 : 0;
} catch (err) {
  console.error(err);
} finally {
  app.kill();
  pey.close();
  process.exit(code);
}
