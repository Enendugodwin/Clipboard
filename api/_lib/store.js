'use strict';
// KV-backed store mirroring server/src/store.js (same shapes, same guards).
// Keys: room:{code}, entries:{code}, devices:{code}, files:{code}, rooms:index.
const crypto = require('node:crypto');
const { kv } = require('@vercel/kv');

const EXPIRY_OPTIONS = { '5m': 300, '15m': 900, '30m': 1800, '1h': 3600, '6h': 21600, '24h': 86400 };

const now = () => Date.now();
function rid(prefix) { return `${prefix}_${crypto.randomBytes(8).toString('hex')}`; }
function roomCode() { return crypto.randomBytes(4).toString('base64url').slice(0, 8); }
function sha256(s) { return crypto.createHash('sha256').update(String(s)).digest('hex'); }
function sanitize(text) {
  return String(text ?? '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
}

async function getRoom(code) {
  const r = await kv.get(`room:${code}`);
  return r || null;
}
function isExpired(room) { return !!room && !!room.expires_at && room.expires_at < now(); }

async function trackCode(code, add) {
  const idx = (await kv.get('rooms:index')) || [];
  const next = add ? [...new Set([...idx, code])] : idx.filter((c) => c !== code);
  await kv.set('rooms:index', next);
  return next;
}

async function createRoom({ name, expiresIn = '24h', customTtlSec, password, isPrivate }) {
  const code = roomCode();
  const ttl = customTtlSec || EXPIRY_OPTIONS[expiresIn] || 86400;
  const t = now();
  const room = {
    id: rid('room'), room_code: code,
    room_name: sanitize(name || 'Untitled room').slice(0, 80) || 'Untitled room',
    password_hash: password ? sha256('clipboard:' + password) : null,
    created_at: t, updated_at: t, expires_at: t + ttl * 1000,
    is_private: Boolean(isPrivate || password), encryption_enabled: false,
    status: 'active', version: 0, content: '', content_type: 'text', last_sync_at: t,
  };
  await kv.set(`room:${code}`, room);
  await kv.set(`entries:${code}`, []);
  await kv.set(`devices:${code}`, []);
  await kv.set(`files:${code}`, []);
  await trackCode(code, true);
  return room;
}

async function deleteRoomCascade(code) {
  const room = await getRoom(code);
  if (!room) return null;
  await kv.del(`room:${code}`, `entries:${code}`, `devices:${code}`, `files:${code}`);
  await trackCode(code, false);
  return room;
}

async function pushEntry(code, entry) {
  const key = `entries:${code}`;
  const arr = (await kv.get(key)) || [];
  arr.unshift(entry);
  await kv.set(key, arr.slice(0, 200));
}

module.exports = { now, rid, roomCode, sha256, sanitize, getRoom, isExpired, createRoom, deleteRoomCascade, pushEntry, trackCode, EXPIRY_OPTIONS };
