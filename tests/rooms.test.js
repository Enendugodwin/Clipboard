'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
// express is installed under the server workspace (no root hoisting).
const express = require('../server/node_modules/express');
const { registerRoutes, } = require('../server/src/routes');
const { store, pushHistory } = require('../server/src/store');

function makeApp() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  registerRoutes(app, () => {});
  return app;
}

async function startApp(t) {
  const app = makeApp();
  const srv = app.listen(0);
  t.after(() => srv.close());
  return `http://localhost:${srv.address().port}`;
}

async function putClip(base, code, content, baseVersion) {
  const r = await fetch(`${base}/api/rooms/${code}/clipboard`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content, base_version: baseVersion }) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

test('room deletion: DELETE removes room, entries, devices, files; later reads 404', async (t) => {
  const app = makeApp();
  const srv = app.listen(0);
  t.after(() => srv.close());
  const base = `http://localhost:${srv.address().port}`;

  const created = await (await fetch(`${base}/api/rooms`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'doomed' }) })).json();
  const code = created.room.room_code;
  pushHistory(code, { id: 'e-del', content: 'x' });

  const del = await fetch(`${base}/api/rooms/${code}`, { method: 'DELETE' });
  assert.equal(del.status, 200);

  assert.equal(await fetch(`${base}/api/rooms/${code}`).then((r) => r.status), 404);
  assert.equal(await fetch(`${base}/api/rooms/${code}/clipboard`).then((r) => r.status), 404);
  assert.equal(await fetch(`${base}/api/rooms/${code}`, { method: 'DELETE' }).then((r) => r.status), 404);
  assert.equal(store.rooms.get(code), undefined);
  assert.equal(store.entries.get(code), undefined);
  assert.equal(store.devices.get(code), undefined);
  assert.equal(store.files.get(code), undefined);
});

test('concurrent update contract: stale base_version 409s with current version; retry on fresh base succeeds', async (t) => {
  const base = await startApp(t);
  const created = await (await fetch(`${base}/api/rooms`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'conflict' }) })).json();
  const code = created.room.room_code;

  const first = await putClip(base, code, 'v1', 0);
  assert.equal(first.status, 200);
  assert.equal(first.body.version, 1);

  // A slow/out-of-order retry with the old base must be rejected with the
  // current version so the client can rebase instead of silently forking.
  const stale = await putClip(base, code, 'stale', 0);
  assert.equal(stale.status, 409);
  assert.equal(stale.body.version, 1);
  assert.equal(stale.body.content, 'v1');

  const retry = await putClip(base, code, 'v2', stale.body.version);
  assert.equal(retry.status, 200);
  assert.equal(retry.body.version, 2);
});
