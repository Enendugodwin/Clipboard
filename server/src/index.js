'use strict';
const express = require('express');
const cors = require('cors');
const path = require('path');
const { WebSocketServer } = require('ws');
const { restore, getRoom, isExpired, sanitize } = require('./store');
const { registerRoutes } = require('./routes');
const { rateLimit } = require('./ratelimit');

const PORT = process.env.PORT || 8787;
const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(rateLimit({ windowMs: 60000, max: 300 }));
// Basic XSS/CSRF/SQLi guards: JSON-only API, no eval, parameterized in-memory store,
// no-index + security headers:
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

restore();

const roomSockets = new Map(); // code -> Set<ws>
function broadcast(code, msg) {
  const set = roomSockets.get(code);
  if (!set) return;
  const data = JSON.stringify(msg);
  for (const ws of set) { try { if (ws.readyState === 1) ws.send(data); } catch {} }
}

registerRoutes(app, broadcast);
app.get('/api/health', (req, res) => res.json({ ok: true, time: Date.now() }));

// Serve frontend build if present
const dist = path.join(__dirname, '..', '..', 'frontend', 'dist');
try {
  app.use(express.static(dist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/ws/')) return next();
    res.sendFile(path.join(dist, 'index.html'), (err) => { if (err) res.status(404).send('Not found'); });
  });
} catch {}

// Expiry sweeper (server-side enforcement)
setInterval(() => {
  const { store, persist, now } = require('./store');
  let changed = false;
  for (const [code, room] of store.rooms) {
    if (room.status === 'active' && room.expires_at && room.expires_at < now()) {
      room.status = 'expired';
      broadcast(code, { type: 'room.expired' });
      // invalidate content + temp files metadata
      room.content = '';
      store.files.delete(code);
      changed = true;
    }
  }
  if (changed) persist();
}, 15000);

const server = app.listen(PORT, () => console.log(`[clipboard-server] http://localhost:${PORT}`));

// WebSocket: /ws/rooms/:code
const wss = new WebSocketServer({ noServer: true });
server.on('upgrade', (req, socket, head) => {
  const m = (req.url || '').match(/^\/ws\/rooms\/([A-Za-z0-9_-]{1,32})/);
  if (!m) { socket.destroy(); return; }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req, m[1]));
});
wss.on('connection', (ws, req, code) => {
  const room = getRoom(code);
  if (!room) { ws.close(4404, 'Room not found'); return; }
  if (isExpired(room)) { ws.close(4410, 'Room expired'); return; }
  if (!roomSockets.has(code)) roomSockets.set(code, new Set());
  roomSockets.get(code).add(ws);
  ws.send(JSON.stringify({ type: 'hello', version: room.version, server_time: Date.now() }));
  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(String(raw));
      if (msg.type === 'ping') ws.send(JSON.stringify({ type: 'pong', t: Date.now() }));
    } catch {}
  });
  ws.on('close', () => { roomSockets.get(code)?.delete(ws); });
});
