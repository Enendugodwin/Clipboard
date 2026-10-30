'use strict';
const crypto = require('crypto');

// In-memory store with JSON-file persistence. Mirrors D1 schema in backend/migrations.
const fs = require('fs');
const path = require('path');
const DATA_FILE = path.join(__dirname, '..', 'data.json');

const EXPIRY_OPTIONS = { '5m': 300, '15m': 900, '30m': 1800, '1h': 3600, '6h': 21600, '24h': 86400 };

const store = {
  rooms: new Map(), // code -> room
  entries: new Map(), // roomCode -> [entries]
  devices: new Map(), // roomCode -> [devices]
  files: new Map(), // roomCode -> [fileMeta]
  sessions: new Map(), // tokenHash -> session
};

function now() { return Date.now(); }
function rid(prefix) { return `${prefix}_${crypto.randomBytes(8).toString('hex')}`; }
function roomCode() { return crypto.randomBytes(4).toString('base64url').slice(0, 8); }
function sha256(s) { return crypto.createHash('sha256').update(String(s)).digest('hex'); }
function sanitize(text) {
  return String(text ?? '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
}

function persist() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify({
      rooms: [...store.rooms.values()],
      entries: Object.fromEntries(store.entries),
      devices: Object.fromEntries(store.devices),
      files: Object.fromEntries(store.files),
    }));
  } catch { /* best effort */ }
}
function restore() {
  try {
    if (!fs.existsSync(DATA_FILE)) return;
    const d = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    for (const r of d.rooms || []) store.rooms.set(r.room_code, r);
    for (const [k, v] of Object.entries(d.entries || {})) store.entries.set(k, v);
    for (const [k, v] of Object.entries(d.devices || {})) store.devices.set(k, v);
    for (const [k, v] of Object.entries(d.files || {})) store.files.set(k, v);
  } catch { /* ignore */ }
}

function getRoom(code) {
  const r = store.rooms.get(code);
  if (!r) return null;
  if (r.expires_at && r.expires_at < now()) {
    r.status = 'expired';
    return r; // callers enforce 410
  }
  return r;
}
function isExpired(room) { return room && room.expires_at && room.expires_at < now(); }

function createRoom({ name, expiresIn = '1h', customTtlSec, password, isPrivate }) {
  const code = roomCode();
  const ttl = customTtlSec || EXPIRY_OPTIONS[expiresIn] || 86400;
  const room = {
    id: rid('room'), room_code: code,
    room_name: sanitize(name || 'Untitled room').slice(0, 80) || 'Untitled room',
    password_hash: password ? sha256('clipboard:' + password) : null,
    created_at: now(), updated_at: now(),
    expires_at: now() + ttl * 1000,
    is_private: Boolean(isPrivate || password),
    encryption_enabled: false, status: 'active', version: 0,
    content: '', content_type: 'text', last_sync_at: now(),
  };
  store.rooms.set(code, room);
  store.entries.set(code, []);
  store.devices.set(code, []);
  store.files.set(code, []);
  persist();
  return room;
}

function pushHistory(code, entry) {
  const arr = store.entries.get(code) || [];
  arr.unshift(entry);
  if (arr.length > 200) arr.length = 200;
  store.entries.set(code, arr);
}

module.exports = { store, now, rid, roomCode, sha256, sanitize, persist, restore, getRoom, isExpired, createRoom, pushHistory, EXPIRY_OPTIONS };
