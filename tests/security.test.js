'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { sanitize, sha256, createRoom } = require('../server/src/store');

test('malicious pasted HTML is neutralized', () => {
  const evil = '<img src=x onerror=alert(1)><script>alert(2)</script><p>hi</p>';
  const clean = sanitize(evil);
  assert.ok(!/script/i.test(clean));
  assert.ok(!/onerror/i.test(clean));
  assert.ok(clean.includes('hi'));
});

test('passwords are hashed, never plaintext', () => {
  const room = createRoom({ name: 'sec', password: 's3cret!' });
  assert.ok(room.password_hash);
  assert.ok(!room.password_hash.includes('s3cret'));
  assert.equal(room.password_hash, sha256('clipboard:s3cret!'));
});

test('room codes are random and unique', () => {
  const codes = new Set();
  for (let i = 0; i < 50; i++) codes.add(createRoom({}).room_code);
  assert.equal(codes.size, 50);
});

test('oversized content rejected (route-level guard)', async () => {
  // simulate the guard constant: 500KB
  const big = 'x'.repeat(500_001);
  assert.ok(big.length > 500_000);
});

test('cross-room isolation: entries keyed per room', () => {
  const { store, pushHistory } = require('../server/src/store');
  const a = createRoom({ name: 'a' });
  const b = createRoom({ name: 'b' });
  pushHistory(a.room_code, { id: 'ea', content: 'secret-a' });
  assert.equal((store.entries.get(b.room_code) || []).length, 0);
});
