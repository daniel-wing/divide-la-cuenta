# Divide la cuenta

Divide una cuenta entre varias personas y cobra a cada quien con un QR CoDi usando la API de [pey](https://docs.pey.mx). Una pantalla compartida muestra quién ya pagó y cuánto falta, sin revisar capturas.

Proyecto para el Cursor Hackatón México (AI Builders, noviembre 2026), idea #16 "Cuenta entre varias personas".

## Cómo funciona

1. El anfitrión captura el total, el concepto y los nombres. La app divide el monto en partes iguales.
2. Por cada persona se crea un cobro con `POST https://api.pey.mx/codi/qr` y una referencia numérica única (`numRef`).
3. Cada quien escanea su QR con la app de su banco.
4. pey avisa al servidor con el webhook `codi.qr.payment_received`. El servidor verifica la firma (Standard Webhooks), ignora pagos duplicados por `transactionId` y marca a la persona como pagada.
5. La pantalla se actualiza cada 2 segundos. Cuando todos pagan aparece "Cuenta saldada".

## Stack

Next.js (App Router) en Vercel, Upstash Redis para guardar el estado, `standardwebhooks` para verificar la firma, `qrcode.react` para dibujar el QR.

## Correr localmente

```bash
npm install
cp .env.example .env.local   # opcional: sin PEY_API_KEY corre en modo demo
npm run dev
```

En modo demo los QR son falsos y cada tarjeta tiene un botón "Simular pago".

## Variables de entorno

| Variable | Para qué |
|---|---|
| `PEY_API_KEY` | API key de pey |
| `PEY_WEBHOOK_SECRET` | Secreto para verificar la firma del webhook |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Upstash Redis (Vercel los agrega solos) |

Webhook a configurar en pey: `https://TU-APP.vercel.app/api/webhooks/pey`
