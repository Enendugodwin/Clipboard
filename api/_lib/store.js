'use strict';
// KV-backed store mirroring server/src/store.js (same shapes, same guards).
// Keys: room:{code}, entries:{code}, devices:{code}, files:{code}, rooms:index.
const crypto = require('node:crypto');
const EXPIRY_OPTIONS = { '5m': 300, '15m': 900, '30m': 1800, '1h': 3600, '6h': 21600, '24h': 86400 };

function brokenKV(msg) {
  const fail = () => { throw new Error('@vercel/kv: ' + msg); };
  return { get: fail, set: fail, del: fail };
}

let __tcp = null;
async function tcpConn() {
  if (!__tcp) {
    const { createClient } = require('redis');
    const c = createClient({ url: process.env.REDIS_URL, socket: { connectTimeout: 8000 } });
    c.on('error', () => {});
    __tcp = c.connect().then(() => c, (e) => { __tcp = null; throw e; });
  }
  return __tcp;
}
function tcpKV() {
  const jget = async (k) => { const v = await (await tcpConn()).get(k); return v == null ? null : JSON.parse(v); };
  return {
    get: jget,
    set: async (k, v) => { await (await tcpConn()).set(k, JSON.stringify(v)); return 'OK'; },
    del: async (...ks) => (await tcpConn()).del(ks.flat()),
  };
}

function buildKV() {
  const restUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const restToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (restUrl && restToken) {
    const { createClient } = require('@vercel/kv');
    return createClient({ url: restUrl, token: restToken });
  }
  const ru = process.env.REDIS_URL || '';
  if (/^rediss?:\/\//i.test(ru)) return tcpKV();
  if (/^https?:\/\//i.test(ru)) {
    if (!restToken) return brokenKV('REDIS_URL is HTTPS but no REST token var (UPSTASH_REDIS_REST_TOKEN/KV_REST_API_TOKEN) is set.');
    const { createClient } = require('@vercel/kv');
    return createClient({ url: ru, token: restToken });
  }
  if (ru) return brokenKV('REDIS_URL has an unrecognized scheme; expected https://, redis:// or rediss://.');
  try { return require('@vercel/kv').kv; }
  catch { return brokenKV('no usable Redis env (UPSTASH_/KV_ REST vars or REDIS_URL) and @vercel/kv failed to load.'); }
}
const kv = buildKV();

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

async function createRoom({ name, expiresIn = '1h', customTtlSec, password, isPrivate }) {
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

module.exports = { kv, now, rid, roomCode, sha256, sanitize, getRoom, isExpired, createRoom, deleteRoomCascade, pushEntry, trackCode, EXPIRY_OPTIONS };
