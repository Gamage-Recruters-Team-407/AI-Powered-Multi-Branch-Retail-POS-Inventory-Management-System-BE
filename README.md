# Backend — AI Retail POS & Inventory Management

Node.js / Express API for multi-branch retail: sales, inventory, stock transfers, suppliers, AI chat, reports, and notifications.

## Requirements

- Node.js 18+
- MongoDB (Atlas or local) — set `MONGO_URI` in `.env`
- Optional: Redis (`ENABLE_NOTIFICATION_WORKER=true`), Gemini API key for AI routes

## Quick start

```bash
npm install
cp .env.example .env   # if you have a template; otherwise create .env
npm run dev
```

Server: `http://localhost:5001` (or `PORT` from `.env`)

Health: `GET http://localhost:5001/api/health`

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start with nodemon |
| `npm start` | Start production |
| `npm test` | Run unit/smoke tests |
| `npm run verify` | Smoke-test routes (no DB required) |
| `npm run seed:transfer-test` | Seed branches, users, inventory, **PENDING** transfer |
| `node seed_demo_data.js` | Seed customers, products, sample sales |

## Environment (`.env`)

```env
MONGO_URI=mongodb+srv://...
DB_NAME=retail_pos_db
PORT=5001
JWT_SECRET=your_secret

# Optional
GEMINI_API_KEY=
ENABLE_NOTIFICATION_WORKER=false
CORS_ORIGIN=http://localhost:5173
SEED_MANAGER_EMAIL=manager@test.com
SEED_ADMIN_EMAIL=admin@test.com
SEED_USER_PASSWORD=Password123!
```

## Stock transfers (manager → admin)

1. `npm run seed:transfer-test` — creates test manager/admin and a **PENDING** request.
2. Login as **manager** → `POST /api/stock-transfers` (role: `MANAGER` only).
3. Login as **admin** → `GET /api/stock-transfers` → approve: `PATCH /api/stock-transfers/:id/approve` (status → **APPROVED**).
4. Login as **manager** → dispatch: `PATCH /api/stock-transfers/:id/dispatch` (→ **IN_TRANSIT**, stock out).
5. Destination **manager** → complete: `PATCH /api/stock-transfers/:id/complete` (→ **COMPLETED**).

**Roles:** Manager creates/edits/cancels while **PENDING**; Admin approves/rejects/cancels **PENDING** only; Manager dispatches **APPROVED**; Cashier view-only.

Default seeded users (after `seed:transfer-test`):

- Manager: `manager@test.com` / `Password123!`
- Admin: `admin@test.com` / `Password123!`

## API modules (prefix `/api`)

| Path | Module |
|------|--------|
| `/auth` | Login, register, profile |
| `/branches`, `/warehouses` | Locations |
| `/products`, `/categories`, `/inventory` | Catalog & stock |
| `/stock-transfers` | Inter-branch transfers |
| `/sales`, `/returns`, `/promotions` | POS |
| `/suppliers`, `/purchase-orders` | Procurement |
| `/customers`, `/employees`, `/users` | People |
| `/dashboard`, `/reports` | Analytics |
| `/notifications` | Alerts (Socket.IO) |
| `/chat`, `/nlquery`, `/decisions` | AI features |
| `/recommendations` | ML / fallback recommendations |

## ML service (optional)

Separate Python service in `ml-service/` (port 5001 conflicts with Node — use a different port in one of them):

```bash
cd ml-service
pip install -r requirements.txt
python app.py
```

## Troubleshooting

- **503 on data routes** — MongoDB not connected; check `MONGO_URI` and network/DNS (`MONGO_DNS_SERVERS` in `src/config/db.js`).
- **Admin sees no transfers** — Run `npm run seed:transfer-test` or create a request as **Manager**, then Sync in the frontend.
- **Only managers can create** — `POST /api/stock-transfers` requires role `MANAGER`; admins approve only.
