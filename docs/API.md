# CLIPBOARD API (v1)

Base URL locally: `http://localhost:8787`. Production: your Worker/`wrangler dev` URL.

| Method | Path | Notes |
|---|---|---|
| POST | /api/rooms | body: {name?, expiresIn 5m\|15m\|30m\|1h\|6h\|24h, customTtlSec?, password?, isPrivate?} |
| GET | /api/rooms/:code | header `x-room-password` when protected |
| PATCH/DELETE | /api/rooms/:code | |
| GET/PUT/DELETE | /api/rooms/:code/clipboard | PUT body {content, content_type?, device_id?, base_version?} — 409 on conflict |
| GET | /api/rooms/:code/history?q=&page=&pageSize=&pinned= | |
| PATCH/DELETE | /api/history/:entryId | {pinned?} |
| GET/POST | /api/rooms/:code/devices | |
| PATCH/DELETE | /api/devices/:deviceId | rename / disconnect |
| POST / GET | /api/rooms/:code/files | upload {filename, mime_type, data_base64} |
| GET | /api/files/:fileId/download | attachment |
| DELETE | /api/files/:fileId | |
| WS | /ws/rooms/:code (local) · /api/rooms/:code/connect (Worker) | events: clipboard.updated/cleared, device.connected/disconnected, file.uploaded/deleted, room.expiring/expired |

Errors: 400 validation · 401 wrong/missing password · 404 missing · 409 version conflict · 410 expired · 413 too large · 415 bad file type · 429 rate limited.
