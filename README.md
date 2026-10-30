# CLIPBOARD — Your clipboard. Everywhere.

Copy on one device. Paste on another. Instantly. No accounts.

## Run locally (no Cloudflare account needed)

Prereqs: Node 20+.

```powershell
npm install
npm run install:all
npm run dev
```

- Frontend: [http://localhost:5173](http://localhost:5173) — open this in your browser
- Local API + WebSocket: `http://localhost:8787` (Vite proxies `/api` and `/ws` there)
- Flow: Create Clipboard → paste → Share/QR → open `/c/<code>` on device 2 → Copy.

Run only the API: `npm run dev:server`. Run only the UI: `npm run dev:frontend`.

## Verify

```powershell
npm test            # node:test unit suite (content, sync, security)
npm run build       # frontend production build (tsc + vite)
```

## Production deploy (Cloudflare)

Prereqs: `npx wrangler login` (browser OAuth, once).

```powershell
# 1. Database + storage
npx wrangler d1 create clipboard
# → paste the database_id into wrangler.toml, then:
npx wrangler d1 execute clipboard --file=backend/migrations/0001_init.sql
npx wrangler r2 bucket create clipboard-files

# 2. API Worker (full CRUD over D1 + RoomDO realtime + R2 files)
npx wrangler deploy
# → note your Worker URL, e.g. https://clipboard.<account>.workers.dev

# 3. Frontend (Cloudflare Pages, pointed at the Worker)
$env:VITE_API_URL="https://clipboard.<account>.workers.dev"
$env:VITE_WS_URL="wss://clipboard.<account>.workers.dev"
npm run build
npx wrangler pages deploy frontend/dist --project-name=clipboard
```

Notes:

- Env/tuning lives in [wrangler.toml](wrangler.toml): `ENV`, `MAX_CONTENT_BYTES`, `MAX_FILE_BYTES`, `ALLOWED_ORIGIN` (add `ALLOWED_ORIGIN = "https://<your-pages-domain>"` to lock down CORS instead of `*`). Bindings: D1 `DB`, R2 `FILES`, Durable Object `ROOM_DO`.
- Room expiry is enforced server-side twice: lazily on every read (410) and by a `RoomDO` alarm scheduled at room creation, which wipes content/history/files (D1 + R2) and broadcasts `room.expired`.
- Room passwords are SHA-256 hashed (`clipboard:`-prefixed, same scheme as local dev) — plaintext never stored. Pasted HTML is sanitized, never executed.
- No secrets in client code. Optional: custom domain via `wrangler pages domain add` / Worker `routes` in `wrangler.toml`.

Local dev uses `server/` (same REST/WS shapes as the Worker); production uses `backend/workers/api.js` + `backend/durable-objects/RoomDO.js` + D1 (`backend/migrations/0001_init.sql`) + R2.

## Structure

- [frontend/src](frontend/src) — components, pages, hooks, services, types, utils, styles
- [server/src](server/src) — local dev API + WebSocket (express + ws)
- [backend](backend) — workers, durable-objects, routes, database, migrations, middleware, storage
- [tests](tests) — unit suite; [docs/API.md](docs/API.md) — endpoint reference
