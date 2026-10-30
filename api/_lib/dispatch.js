'use strict';
// Vercel serverless API: same REST shapes as server/src/routes.js, KV-backed.
// Realtime note: serverless has no WebSockets — clients poll (frontend socket
// service switches to polling when VITE_WS_URL=poll). Mutations return the
// new version so pollers converge without refresh.
const { put, del } = require('@vercel/blob');
const S = require('./store');
const { kv } = S;

const MAX_CONTENT = () => parseInt(process.env.MAX_CONTENT_BYTES || '500000', 10);
const MAX_FILE = () => parseInt(process.env.MAX_FILE_BYTES || '26214400', 10);
const ALLOWED_MIME = new Set(['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/csv','text/plain','image/png','image/jpeg','image/webp','application/zip','application/json']);

function publicRoom(r) {
  return { room_code: r.room_code, room_name: r.room_name, created_at: r.created_at, updated_at: r.updated_at, expires_at: r.expires_at, is_private: !!r.is_private, status: S.isExpired(r) ? 'expired' : r.status, version: r.version, content: r.content, content_type: r.content_type, last_sync_at: r.last_sync_at, has_password: !!r.password_hash };
}
function pw(req, body) {
  return req.headers['x-room-password'] || (body && body.password) || req.query.password;
}
async function okPassword(room, req, body) {
  if (!room.password_hash) return true;
  const p = pw(req, body);
  if (!p) return false;
  return S.sha256('clipboard:' + p) === room.password_hash;
}

module.exports = async function handler(req, res) {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (req.method === 'OPTIONS') return res.status(204).end();
  // Parse from the URL path, not req.query: catch-all param shape varies.
  const pathname = new URL(req.url || '/', 'http://localhost').pathname;
  const seg = pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean).map((s) => { try { return decodeURIComponent(s); } catch { return s; } });
  const bad = (code, msg, extra = {}) => res.status(code).json({ error: msg, ...extra });
  const body = req.body || {};

  // GET /api/health is served by api/health.js; keep a local alias too.
  if (seg.length === 1 && seg[0] === 'health' && req.method === 'GET') return res.json({ ok: true, time: S.now() });

  // /api/files/:id/download -> redirect to Blob URL (frontend links here directly)
  if (seg[0] === 'files' && seg[2] === 'download' && req.method === 'GET') {
    const idx = (await kv.get('rooms:index')) || [];
    for (const code of idx) {
      const list = (await kv.get(`files:${code}`)) || [];
      const f = list.find((x) => x.id === seg[1]);
      if (f) { res.redirect(f.storage_key); return; }
    }
    return res.status(404).json({ error: 'File expired or not found.' });
  }

  // /api/rooms (create)
  if (seg[0] === 'rooms' && seg.length === 1 && req.method === 'POST') {
    const { name, expiresIn, customTtlSec, password, isPrivate } = body;
    if (customTtlSec != null && (customTtlSec < 60 || customTtlSec > 7 * 86400)) return bad(400, 'customTtlSec must be 60..604800');
    if (password && String(password).length < 4) return bad(400, 'Password too short (min 4 chars).');
    const room = await S.createRoom({ name, expiresIn, customTtlSec, password, isPrivate });
    return res.status(201).json({ room: publicRoom(room), url: `/c/${room.room_code}` });
  }

  // /api/history/:id
  if (seg[0] === 'history' && seg[1]) {
    const id = seg[1];
    if (req.method === 'PATCH') {
      const { pinned, content } = body;
      if (pinned == null && content == null) return bad(400, 'Nothing to update.');
      const idx = (await kv.get('rooms:index')) || [];
      for (const code of idx) {
        const arr = (await kv.get(`entries:${code}`)) || [];
        const e = arr.find((x) => x.id === id);
        if (e) {
          if (pinned != null) e.is_pinned = !!pinned;
          if (content != null) e.content = S.sanitize(content);
          e.updated_at = S.now();
          await kv.set(`entries:${code}`, arr);
          return res.json({ entry: e });
        }
      }
      return bad(404, 'Entry not found.');
    }
    if (req.method === 'DELETE') {
      const idx = (await kv.get('rooms:index')) || [];
      for (const code of idx) {
        const arr = (await kv.get(`entries:${code}`)) || [];
        if (arr.some((x) => x.id === id)) {
          await kv.set(`entries:${code}`, arr.filter((x) => x.id !== id));
          return res.json({ ok: true });
        }
      }
      return bad(404, 'Entry not found.');
    }
  }

  // /api/devices/:id
  if (seg[0] === 'devices' && seg[1]) {
    const id = seg[1];
    const idx = (await kv.get('rooms:index')) || [];
    for (const code of idx) {
      const list = (await kv.get(`devices:${code}`)) || [];
      const d = list.find((x) => x.id === id);
      if (d) {
        if (req.method === 'PATCH') {
          if (body.device_name) d.device_name = S.sanitize(body.device_name).slice(0, 60);
          if (body.connection_status) d.connection_status = body.connection_status;
          d.last_seen = S.now();
          await kv.set(`devices:${code}`, list);
          return res.json({ device: d });
        }
        if (req.method === 'DELETE') {
          await kv.set(`devices:${code}`, list.filter((x) => x.id !== id));
          return res.json({ ok: true });
        }
      }
    }
    return bad(404, 'Device not found.');
  }

  // /api/files/:id (delete)
  if (seg[0] === 'files' && seg[1] && req.method === 'DELETE') {
    const idx = (await kv.get('rooms:index')) || [];
    for (const code of idx) {
      const list = (await kv.get(`files:${code}`)) || [];
      const f = list.find((x) => x.id === seg[1]);
      if (f) {
        await kv.set(`files:${code}`, list.filter((x) => x.id !== seg[1]));
        try { await del(f.storage_key); } catch {}
        return res.json({ ok: true });
      }
    }
    return bad(404, 'File not found.');
  }

  // /api/rooms/:code[/sub]
  if (seg[0] === 'rooms' && seg[1]) {
    const code = seg[1];
    const sub = seg[2] || '';
    const room = await S.getRoom(code);
    if (!room) return bad(404, sub === '' && req.method === 'GET' ? 'Room does not exist. Check the URL.' : 'Room not found.');
    if (S.isExpired(room)) return bad(410, 'Room expired.');
    if (!(await okPassword(room, req, body))) return bad(401, 'Incorrect password.', req.method === 'GET' ? { passwordRequired: true } : {});

    if (!sub) {
      if (req.method === 'GET') return res.json({ room: publicRoom(room) });
      if (req.method === 'PATCH') {
        const { name, password } = body;
        if (name != null) room.room_name = S.sanitize(name).slice(0, 80);
        if (password === '') room.password_hash = null;
        else if (password) room.password_hash = S.sha256('clipboard:' + password);
        room.updated_at = S.now();
        await kv.set(`room:${code}`, room);
        return res.json({ room: publicRoom(room) });
      }
      if (req.method === 'DELETE') {
        const files = (await kv.get(`files:${code}`)) || [];
        for (const f of files) { try { await del(f.storage_key); } catch {} }
        await S.deleteRoomCascade(code);
        return res.json({ ok: true });
      }
    }

    if (sub === 'clipboard') {
      if (req.method === 'GET') return res.json({ content: room.content, content_type: room.content_type, version: room.version, last_sync_at: room.last_sync_at });
      if (req.method === 'PUT') {
        const { content = '', content_type = 'text', device_id, base_version } = body;
        if (typeof content !== 'string') return bad(400, 'content must be a string');
        if (content.length > MAX_CONTENT()) return bad(413, 'Content exceeds size limit (500KB).');
        if (base_version != null && base_version !== room.version) {
          return bad(409, 'Concurrent update conflict. Reload and retry.', { version: room.version, content: room.content });
        }
        const clean = S.sanitize(content);
        const t = S.now();
        room.version += 1; room.content = clean; room.content_type = String(content_type).slice(0, 32);
        room.updated_at = t; room.last_sync_at = t;
        await kv.set(`room:${code}`, room);
        const entry = { id: S.rid('entry'), room_id: room.id, content: clean.slice(0, 500000), content_type: room.content_type, version: room.version, device_id: device_id || 'unknown', created_at: t, updated_at: t, is_pinned: false };
        await S.pushEntry(code, entry);
        return res.json({ content: room.content, version: room.version, last_sync_at: room.last_sync_at });
      }
      if (req.method === 'DELETE') {
        room.content = ''; room.version += 1; room.last_sync_at = S.now();
        await kv.set(`room:${code}`, room);
        return res.json({ ok: true, version: room.version });
      }
    }

    if (sub === 'history' && req.method === 'GET') {
      const q = String(req.query.q || '').toLowerCase();
      const pinned = req.query.pinned;
      const page = Math.max(1, parseInt(req.query.page || '1', 10));
      const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize || '20', 10)));
      let arr = (await kv.get(`entries:${code}`)) || [];
      if (q) arr = arr.filter((e) => String(e.content).toLowerCase().includes(q));
      if (pinned === '1') arr = arr.filter((e) => e.is_pinned);
      return res.json({ entries: arr.slice((page - 1) * pageSize, page * pageSize), total: arr.length, page, pageSize });
    }

    if (sub === 'devices') {
      if (req.method === 'GET') return res.json({ devices: (await kv.get(`devices:${code}`)) || [] });
      if (req.method === 'POST') {
        const list = (await kv.get(`devices:${code}`)) || [];
        const d = { id: S.rid('dev'), room_id: room.id, device_name: S.sanitize(body.device_name || 'Unknown device').slice(0, 60), device_type: S.sanitize(body.device_type || 'desktop').slice(0, 20), browser: S.sanitize(body.browser || '').slice(0, 80), connection_status: 'connected', last_seen: S.now(), created_at: S.now() };
        list.push(d);
        await kv.set(`devices:${code}`, list);
        return res.status(201).json({ device: d });
      }
    }

    if (sub === 'files') {
      if (req.method === 'GET') return res.json({ files: (await kv.get(`files:${code}`)) || [] });
      if (req.method === 'POST') {
        const { filename, mime_type, data_base64, uploaded_by } = body;
        if (!filename || !data_base64) return bad(400, 'filename and data_base64 required');
        if (!ALLOWED_MIME.has(mime_type)) return bad(415, 'Unsupported file type.');
        const buf = Buffer.from(data_base64, 'base64');
        if (buf.length > MAX_FILE()) return bad(413, 'File exceeds 25MB limit.');
        const blob = await put(`rooms/${code}/${S.rid('file')}-${S.sanitize(filename).slice(0, 60)}`, buf, { access: 'public', contentType: mime_type });
        const f = { id: S.rid('file'), room_id: room.id, original_filename: S.sanitize(filename).slice(0, 120), storage_key: blob.url, mime_type, file_size: buf.length, uploaded_by: uploaded_by || 'unknown', uploaded_at: S.now(), expires_at: room.expires_at };
        const list = (await kv.get(`files:${code}`)) || [];
        list.unshift(f);
        await kv.set(`files:${code}`, list);
        return res.status(201).json({ file: f });
      }
    }
  }

  return bad(404, 'Not found.');
};
