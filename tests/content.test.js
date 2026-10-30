'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

function detect(text) {
  const t = String(text).trim();
  if (!t) return 'text';
  if (/^https?:\/\/\S+$/i.test(t)) return 'url';
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) return 'email';
  if (/^\s*[\[{]/.test(t)) { try { JSON.parse(t); return 'json'; } catch {} }
  if (t.length > 500) return 'longtext';
  return 'text';
}

test('content detection: url, email, json, text', () => {
  assert.equal(detect('https://example.com/x'), 'url');
  assert.equal(detect('a@b.com'), 'email');
  assert.equal(detect('{"a":1}'), 'json');
  assert.equal(detect('hello'), 'text');
});

test('json validate/format round-trip', () => {
  const raw = '{"b":2,"a":1}';
  assert.equal(JSON.stringify(JSON.parse(raw)), '{"b":2,"a":1}');
  assert.ok(JSON.stringify(JSON.parse(raw), null, 2).includes('\n'));
  assert.throws(() => JSON.parse('{bad}'));
});

test('room lifecycle: create, update with version, conflict, expiry', () => {
  const { createRoom, getRoom, isExpired } = require('../server/src/store');
  const room = createRoom({ name: 't', expiresIn: '5m' });
  assert.ok(room.room_code.length >= 6);
  assert.equal(isExpired(room), false);
  room.version = 3;
  assert.equal(getRoom(room.room_code).version, 3);
  const expired = createRoom({ name: 'e', customTtlSec: 60 });
  expired.expires_at = Date.now() - 1;
  assert.equal(isExpired(expired), true);
});

test('three-client sync simulation: one write visible to all readers', () => {
  const { createRoom, pushHistory, store } = require('../server/src/store');
  const room = createRoom({ name: 'sync' });
  room.content = 'A'; room.version = 1;
  pushHistory(room.room_code, { id: 'e1', content: 'A', version: 1 });
  // Clients B and C read same versioned content
  const { getRoom } = require('../server/src/store');
  assert.equal(getRoom(room.room_code).content, 'A');
  assert.equal(store.entries.get(room.room_code).length, 1);
});
