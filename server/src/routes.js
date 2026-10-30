'use strict';
const express = require('express');
const { store, now, rid, sha256, sanitize, persist, getRoom, isExpired, createRoom, pushHistory } = require('./store');

const MAX_CONTENT = 500_000; // 500KB text
const MAX_FILE = 25 * 1024 * 1024;
const ALLOWED_MIME = new Set(['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/csv','text/plain','image/png','image/jpeg','image/webp','application/zip','application/json']);

function publicRoom(r) {
  return { room_code: r.room_code, room_name: r.room_name, created_at: r.created_at, updated_at: r.updated_at, expires_at: r.expires_at, is_private: r.is_private, status: isExpired(r) ? 'expired' : r.status, version: r.version, content: r.content, content_type: r.content_type, last_sync_at: r.last_sync_at, has_password: !!r.password_hash };
}

function checkPassword(room, req) {
  if (!room.password_hash) return true;
  const pw = req.headers['x-room-password'] || (req.body && req.body.password) || (req.query && req.query.password);
  if (!pw) return false;
  return sha256('clipboard:' + pw) === room.password_hash;
}

function registerRoutes(app, broadcast) {
  app.post('/api/rooms', (req, res) => {
    const { name, expiresIn, customTtlSec, password, isPrivate } = req.body || {};
    if (customTtlSec != null && (customTtlSec < 60 || customTtlSec > 7 * 86400)) return res.status(400).json({ error: 'customTtlSec must be 60..604800' });
    if (password && String(password).length < 4) return res.status(400).json({ error: 'Password too short (min 4 chars).' });
    const room = createRoom({ name, expiresIn, customTtlSec, password, isPrivate });
    broadcast(room.room_code, { type: 'room.created', room: publicRoom(room) });
    res.status(201).json({ room: publicRoom(room), url: `/c/${room.room_code}` });
  });

  app.get('/api/rooms/:code', (req, res) => {
    const room = getRoom(req.params.code);
    if (!room) return res.status(404).json({ error: 'Room does not exist. Check the URL.' });
    if (isExpired(room)) return res.status(410).json({ error: 'Room expired.' });
    if (!checkPassword(room, req)) return res.status(401).json({ error: 'Incorrect password.', passwordRequired: true });
    res.json({ room: publicRoom(room) });
  });

  app.patch('/api/rooms/:code', (req, res) => {
    const room = getRoom(req.params.code);
    if (!room) return res.status(404).json({ error: 'Room not found.' });
    if (isExpired(room)) return res.status(410).json({ error: 'Room expired.' });
    if (!checkPassword(room, req)) return res.status(401).json({ error: 'Incorrect password.' });
    const { name, password, expiresIn } = req.body || {};
    if (name != null) room.room_name = sanitize(name).slice(0, 80);
    if (password === '') room.password_hash = null;
    else if (password) room.password_hash = sha256('clipboard:' + password);
    room.updated_at = now(); persist();
    broadcast(room.room_code, { type: 'room.updated', room: publicRoom(room) });
    res.json({ room: publicRoom(room) });
  });

  app.delete('/api/rooms/:code', (req, res) => {
    const room = getRoom(req.params.code);
    if (!room) return res.status(404).json({ error: 'Room not found.' });
    room.status = 'deleted'; store.rooms.delete(req.params.code);
    store.entries.delete(req.params.code); store.devices.delete(req.params.code); store.files.delete(req.params.code);
    persist();
    broadcast(req.params.code, { type: 'room.expired' });
    res.json({ ok: true });
  });

  app.get('/api/rooms/:code/clipboard', (req, res) => {
    const room = getRoom(req.params.code);
    if (!room) return res.status(404).json({ error: 'Room not found.' });
    if (isExpired(room)) return res.status(410).json({ error: 'Room expired.' });
    if (!checkPassword(room, req)) return res.status(401).json({ error: 'Incorrect password.', passwordRequired: true });
    res.json({ content: room.content, content_type: room.content_type, version: room.version, last_sync_at: room.last_sync_at });
  });

  app.put('/api/rooms/:code/clipboard', (req, res) => {
    const room = getRoom(req.params.code);
    if (!room) return res.status(404).json({ error: 'Room not found.' });
    if (isExpired(room)) return res.status(410).json({ error: 'Room expired.' });
    if (!checkPassword(room, req)) return res.status(401).json({ error: 'Incorrect password.' });
    const { content = '', content_type = 'text', device_id, base_version } = req.body || {};
    if (typeof content !== 'string') return res.status(400).json({ error: 'content must be a string' });
    if (content.length > MAX_CONTENT) return res.status(413).json({ error: 'Content exceeds size limit (500KB).' });
    if (base_version != null && base_version !== room.version) return res.status(409).json({ error: 'Concurrent update conflict. Reload and retry.', version: room.version, content: room.content });
    const clean = sanitize(content);
    room.version += 1; room.content = clean; room.content_type = String(content_type).slice(0, 32);
    room.updated_at = now(); room.last_sync_at = now();
    const entry = { id: rid('entry'), room_id: room.id, content: clean.slice(0, 500000), content_type: room.content_type, version: room.version, device_id: device_id || 'unknown', created_at: now(), updated_at: now(), is_pinned: false };
    pushHistory(req.params.code, entry); persist();
    broadcast(room.room_code, { type: 'clipboard.updated', content: room.content, content_type: room.content_type, version: room.version, last_sync_at: room.last_sync_at, entry });
    res.json({ content: room.content, version: room.version, last_sync_at: room.last_sync_at });
  });

  app.delete('/api/rooms/:code/clipboard', (req, res) => {
    const room = getRoom(req.params.code);
    if (!room) return res.status(404).json({ error: 'Room not found.' });
    if (isExpired(room)) return res.status(410).json({ error: 'Room expired.' });
    if (!checkPassword(room, req)) return res.status(401).json({ error: 'Incorrect password.' });
    room.content = ''; room.version += 1; room.last_sync_at = now(); persist();
    broadcast(room.room_code, { type: 'clipboard.cleared', version: room.version });
    res.json({ ok: true, version: room.version });
  });

  app.get('/api/rooms/:code/history', (req, res) => {
    const room = getRoom(req.params.code);
    if (!room) return res.status(404).json({ error: 'Room not found.' });
    if (isExpired(room)) return res.status(410).json({ error: 'Room expired.' });
    if (!checkPassword(room, req)) return res.status(401).json({ error: 'Incorrect password.' });
    const q = (req.query.q || '').toLowerCase();
    const pinned = req.query.pinned;
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize || '20', 10)));
    let arr = store.entries.get(req.params.code) || [];
    if (q) arr = arr.filter(e => e.content.toLowerCase().includes(q));
    if (pinned === '1') arr = arr.filter(e => e.is_pinned);
    const total = arr.length;
    res.json({ entries: arr.slice((page - 1) * pageSize, page * pageSize), total, page, pageSize });
  });

  app.patch('/api/history/:entryId', (req, res) => {
    const { pinned, content } = req.body || {};
    for (const [code, arr] of store.entries) {
      const e = arr.find(x => x.id === req.params.entryId);
      if (e) {
        if (pinned != null) e.is_pinned = !!pinned;
        if (content != null) e.content = sanitize(content);
        e.updated_at = now(); persist();
        return res.json({ entry: e });
      }
    }
    res.status(404).json({ error: 'Entry not found.' });
  });

  app.delete('/api/history/:entryId', (req, res) => {
    for (const [code, arr] of store.entries) {
      const i = arr.findIndex(x => x.id === req.params.entryId);
      if (i >= 0) { arr.splice(i, 1); persist(); return res.json({ ok: true }); }
    }
    res.status(404).json({ error: 'Entry not found.' });
  });

  // Devices
  app.get('/api/rooms/:code/devices', (req, res) => {
    const room = getRoom(req.params.code);
    if (!room) return res.status(404).json({ error: 'Room not found.' });
    if (isExpired(room)) return res.status(410).json({ error: 'Room expired.' });
    res.json({ devices: store.devices.get(req.params.code) || [] });
  });
  app.post('/api/rooms/:code/devices', (req, res) => {
    const room = getRoom(req.params.code);
    if (!room) return res.status(404).json({ error: 'Room not found.' });
    const list = store.devices.get(req.params.code) || [];
    const d = { id: rid('dev'), room_id: room.id, device_name: sanitize(req.body?.device_name || 'Unknown device').slice(0, 60), device_type: sanitize(req.body?.device_type || 'desktop').slice(0, 20), browser: sanitize(req.body?.browser || '').slice(0, 80), connection_status: 'connected', last_seen: now(), created_at: now() };
    list.push(d); store.devices.set(req.params.code, list); persist();
    broadcast(room.room_code, { type: 'device.connected', device: d });
    res.status(201).json({ device: d });
  });
  app.patch('/api/devices/:deviceId', (req, res) => {
    for (const [code, list] of store.devices) {
      const d = list.find(x => x.id === req.params.deviceId);
      if (d) {
        if (req.body?.device_name) d.device_name = sanitize(req.body.device_name).slice(0, 60);
        if (req.body?.connection_status) d.connection_status = req.body.connection_status;
        d.last_seen = now(); persist();
        return res.json({ device: d });
      }
    }
    res.status(404).json({ error: 'Device not found.' });
  });
  app.delete('/api/devices/:deviceId', (req, res) => {
    for (const [code, list] of store.devices) {
      const i = list.findIndex(x => x.id === req.params.deviceId);
      if (i >= 0) { const [d] = list.splice(i, 1); persist(); broadcast(code, { type: 'device.disconnected', device_id: d.id }); return res.json({ ok: true }); }
    }
    res.status(404).json({ error: 'Device not found.' });
  });

  // Files (local shim: metadata only + base64 small files; R2 used in production worker)
  const uploads = new Map(); // fileId -> Buffer
  app.post('/api/rooms/:code/files', express.json({ limit: '30mb' }), (req, res) => {
    const room = getRoom(req.params.code);
    if (!room) return res.status(404).json({ error: 'Room not found.' });
    if (isExpired(room)) return res.status(410).json({ error: 'Room expired.' });
    if (!checkPassword(room, req)) return res.status(401).json({ error: 'Incorrect password.' });
    const { filename, mime_type, data_base64, uploaded_by } = req.body || {};
    if (!filename || !data_base64) return res.status(400).json({ error: 'filename and data_base64 required' });
    if (!ALLOWED_MIME.has(mime_type)) return res.status(415).json({ error: 'Unsupported file type.' });
    const buf = Buffer.from(data_base64, 'base64');
    if (buf.length > MAX_FILE) return res.status(413).json({ error: 'File exceeds 25MB limit.' });
    const f = { id: rid('file'), room_id: room.id, original_filename: sanitize(filename).slice(0, 120), storage_key: `local/${req.params.code}/${Date.now()}-${sanitize(filename).slice(0, 60)}`, mime_type, file_size: buf.length, uploaded_by: uploaded_by || 'unknown', uploaded_at: now(), expires_at: room.expires_at };
    uploads.set(f.id, buf);
    const list = store.files.get(req.params.code) || []; list.unshift(f); store.files.set(req.params.code, list); persist();
    broadcast(room.room_code, { type: 'file.uploaded', file: f });
    res.status(201).json({ file: f });
  });
  app.get('/api/rooms/:code/files', (req, res) => {
    const room = getRoom(req.params.code);
    if (!room) return res.status(404).json({ error: 'Room not found.' });
    if (!checkPassword(room, req)) return res.status(401).json({ error: 'Incorrect password.' });
    res.json({ files: store.files.get(req.params.code) || [] });
  });
  app.get('/api/files/:fileId/download', (req, res) => {
    const buf = uploads.get(req.params.fileId);
    if (!buf) return res.status(404).json({ error: 'File expired or not found on this server.' });
    let meta = null;
    for (const list of store.files.values()) { const f = list.find(x => x.id === req.params.fileId); if (f) meta = f; }
    res.setHeader('Content-Type', meta?.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${(meta?.original_filename || 'file').replace(/"/g, '')}"`);
    res.send(buf);
  });
  app.delete('/api/files/:fileId', (req, res) => {
    for (const [code, list] of store.files) {
      const i = list.findIndex(x => x.id === req.params.fileId);
      if (i >= 0) { list.splice(i, 1); uploads.delete(req.params.fileId); persist(); broadcast(code, { type: 'file.deleted', file_id: req.params.fileId }); return res.json({ ok: true }); }
    }
    res.status(404).json({ error: 'File not found.' });
  });
}

module.exports = { registerRoutes };
