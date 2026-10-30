// Production Cloudflare Worker: full REST API over D1 + realtime fan-out via RoomDO + files via R2.
// Mirrors server/src/routes.js (same routes, status codes, and guards). Local dev equivalent: server/src/.
export { RoomDO } from '../durable-objects/RoomDO.js';

const EXPIRY_OPTIONS = { '5m': 300, '15m': 900, '30m': 1800, '1h': 3600, '6h': 21600, '24h': 86400 };
const ALLOWED_MIME = new Set(['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/csv','text/plain','image/png','image/jpeg','image/webp','application/zip','application/json']);

const now = () => Date.now();
function rid(prefix) {
  const b = new Uint8Array(8);
  crypto.getRandomValues(b);
  return `${prefix}_` + [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}
function roomCode() {
  const b = new Uint8Array(6);
  crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_');
}
async function sha256(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(s)));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
function sanitize(text) {
  return String(text ?? '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
}

function cors(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-room-password',
  };
}
const json = (env, data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'Content-Type': 'application/json', 'X-Robots-Tag': 'noindex, nofollow', ...cors(env) },
});

function rowToRoom(r) {
  if (!r) return null;
  return { ...r, is_private: !!r.is_private, encryption_enabled: !!r.encryption_enabled };
}
function publicRoom(r) {
  return { room_code: r.room_code, room_name: r.room_name, created_at: r.created_at, updated_at: r.updated_at, expires_at: r.expires_at, is_private: !!r.is_private, status: isExpired(r) ? 'expired' : r.status, version: r.version, content: r.content, content_type: r.content_type, last_sync_at: r.last_sync_at, has_password: !!r.password_hash };
}
function isExpired(room) { return room && room.expires_at && room.expires_at < now(); }
function getPassword(req, body) {
  return req.headers.get('x-room-password') || (body && body.password) || new URL(req.url).searchParams.get('password');
}
async function checkPassword(room, req, body) {
  if (!room.password_hash) return true;
  const pw = getPassword(req, body);
  if (!pw) return false;
  return (await sha256('clipboard:' + pw)) === room.password_hash;
}
async function loadRoom(env, code) {
  const row = await env.DB.prepare('SELECT * FROM rooms WHERE room_code = ?').bind(code).first();
  return rowToRoom(row);
}
function stubFor(env, code) { return env.ROOM_DO.get(env.ROOM_DO.idFromName(code)); }
async function broadcast(env, code, msg) {
  try { await stubFor(env, code).fetch(new Request('https://do/internal/broadcast', { method: 'POST', body: JSON.stringify(msg) })); } catch {}
}
async function scheduleExpiry(env, code, expires_at) {
  try { await stubFor(env, code).fetch(new Request('https://do/internal/schedule-expiry', { method: 'POST', body: JSON.stringify({ room_code: code, expires_at }) })); } catch {}
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(env) });

    const MAX_CONTENT = parseInt(env.MAX_CONTENT_BYTES || '500000', 10);
    const MAX_FILE = parseInt(env.MAX_FILE_BYTES || '26214400', 10);

    let body = null;
    if (request.method === 'POST' || request.method === 'PUT' || request.method === 'PATCH') {
      try { body = await request.json(); } catch { body = {}; }
    }

    if (path === '/api/health') return json(env, { ok: true, time: now() });

    // WebSocket: /ws/rooms/:code -> RoomDO
    const ws = path.match(/^\/ws\/rooms\/([A-Za-z0-9_-]{1,32})$/);
    if (ws) {
      const room = await loadRoom(env, ws[1]);
      if (!room) return json(env, { error: 'Room does not exist. Check the URL.' }, 404);
      if (isExpired(room)) return json(env, { error: 'Room expired.' }, 410);
      return stubFor(env, ws[1]).fetch(request);
    }

    // R2 download: /api/files/:id/download
    const dl = path.match(/^\/api\/files\/([^/]+)\/download$/);
    if (dl && request.method === 'GET') {
      const meta = await env.DB.prepare('SELECT * FROM files WHERE id = ?').bind(dl[1]).first();
      if (!meta) return json(env, { error: 'File expired or not found.' }, 404);
      const obj = await env.FILES.get(meta.storage_key);
      if (!obj) return json(env, { error: 'File expired or not found.' }, 404);
      const headers = new Headers(cors(env));
      headers.set('Content-Type', meta.mime_type || 'application/octet-stream');
      headers.set('Content-Disposition', `attachment; filename="${String(meta.original_filename || 'file').replace(/"/g, '')}"`);
      return new Response(obj.body, { headers });
    }

    const m = path.match(/^\/api\/rooms\/([^/]+)(\/clipboard|\/history|\/devices|\/files)?$/);
    if (m) {
      const code = m[1];
      const sub = m[2] || '';
      const room = await loadRoom(env, code);

      if (request.method === 'POST' && !sub && path === '/api/rooms') { /* handled below */ }
      else {
        if (!room) return json(env, { error: sub === '' && request.method === 'GET' ? 'Room does not exist. Check the URL.' : 'Room not found.' }, 404);
        if (isExpired(room)) return json(env, { error: 'Room expired.' }, 410);
        if (!(await checkPassword(room, request, body))) {
          return json(env, { error: 'Incorrect password.', ...(request.method === 'GET' ? { passwordRequired: true } : {}) }, 401);
        }
      }

      if (!sub) {
        if (request.method === 'GET') return json(env, { room: publicRoom(room) });
        if (request.method === 'PATCH') {
          const { name, password, expiresIn } = body || {};
          const updates = [];
          const params = [];
          if (name != null) { updates.push('room_name = ?'); params.push(sanitize(name).slice(0, 80)); }
          if (password === '') { updates.push('password_hash = NULL'); }
          else if (password) { updates.push('password_hash = ?'); params.push(await sha256('clipboard:' + password)); }
          void expiresIn;
          updates.push('updated_at = ?'); params.push(now()); params.push(code);
          await env.DB.prepare(`UPDATE rooms SET ${updates.join(', ')} WHERE room_code = ?`).bind(...params).run();
          const r2 = await loadRoom(env, code);
          broadcast(env, code, { type: 'room.updated', room: publicRoom(r2) });
          return json(env, { room: publicRoom(r2) });
        }
        if (request.method === 'DELETE') {
          await env.DB.batch([
            env.DB.prepare('DELETE FROM clipboard_entries WHERE room_id = ?').bind(room.id),
            env.DB.prepare('DELETE FROM devices WHERE room_id = ?').bind(room.id),
            env.DB.prepare('DELETE FROM files WHERE room_id = ?').bind(room.id),
            env.DB.prepare('DELETE FROM rooms WHERE room_code = ?').bind(code),
          ]);
          try {
            const listed = await env.FILES.list({ prefix: `rooms/${code}/` });
            for (const o of listed.objects || []) await env.FILES.delete(o.key);
          } catch {}
          broadcast(env, code, { type: 'room.expired' });
          return json(env, { ok: true });
        }
      }

      if (sub === '/clipboard') {
        if (request.method === 'GET') {
          return json(env, { content: room.content, content_type: room.content_type, version: room.version, last_sync_at: room.last_sync_at });
        }
        if (request.method === 'PUT') {
          const { content = '', content_type = 'text', device_id, base_version } = body || {};
          if (typeof content !== 'string') return json(env, { error: 'content must be a string' }, 400);
          if (content.length > MAX_CONTENT) return json(env, { error: 'Content exceeds size limit (500KB).' }, 413);
          if (base_version != null && base_version !== room.version) {
            return json(env, { error: 'Concurrent update conflict. Reload and retry.', version: room.version, content: room.content }, 409);
          }
          const clean = sanitize(content);
          const t = now();
          await env.DB.prepare('UPDATE rooms SET content = ?, content_type = ?, version = version + 1, updated_at = ?, last_sync_at = ? WHERE room_code = ?')
            .bind(clean, String(content_type).slice(0, 32), t, t, code).run();
          const entry = { id: rid('entry'), room_id: room.id, content: clean.slice(0, 500000), content_type: String(content_type).slice(0, 32), version: room.version + 1, device_id: device_id || 'unknown', created_at: t, updated_at: t, is_pinned: 0 };
          await env.DB.prepare('INSERT INTO clipboard_entries (id, room_id, content, content_type, version, device_id, created_at, updated_at, is_pinned) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)')
            .bind(entry.id, entry.room_id, entry.content, entry.content_type, entry.version, entry.device_id, entry.created_at, entry.updated_at).run();
          await env.DB.prepare('DELETE FROM clipboard_entries WHERE room_id = ? AND id NOT IN (SELECT id FROM clipboard_entries WHERE room_id = ? ORDER BY created_at DESC LIMIT 200)')
            .bind(room.id, room.id).run().catch(() => {});
          const r2 = await loadRoom(env, code);
          broadcast(env, code, { type: 'clipboard.updated', content: r2.content, content_type: r2.content_type, version: r2.version, last_sync_at: r2.last_sync_at, entry: { ...entry, is_pinned: false } });
          return json(env, { content: r2.content, version: r2.version, last_sync_at: r2.last_sync_at });
        }
        if (request.method === 'DELETE') {
          const t = now();
          await env.DB.prepare('UPDATE rooms SET content = ?, version = version + 1, last_sync_at = ? WHERE room_code = ?').bind('', t, code).run();
          const r2 = await loadRoom(env, code);
          broadcast(env, code, { type: 'clipboard.cleared', version: r2.version });
          return json(env, { ok: true, version: r2.version });
        }
      }

      if (sub === '/history' && request.method === 'GET') {
        const q = (url.searchParams.get('q') || '').toLowerCase();
        const pinned = url.searchParams.get('pinned');
        const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
        const pageSize = Math.min(50, Math.max(1, parseInt(url.searchParams.get('pageSize') || '20', 10)));
        let sql = 'SELECT * FROM clipboard_entries WHERE room_id = ?';
        const params = [room.id];
        if (pinned === '1') sql += ' AND is_pinned = 1';
        if (q) { sql += ' AND LOWER(content) LIKE ?'; params.push(`%${q}%`); }
        sql += ' ORDER BY created_at DESC';
        const { results } = await env.DB.prepare(sql).bind(...params).all();
        const rows = (results || []).map((e) => ({ ...e, is_pinned: !!e.is_pinned }));
        return json(env, { entries: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length, page, pageSize });
      }

      if (sub === '/devices') {
        if (request.method === 'GET') {
          const { results } = await env.DB.prepare('SELECT * FROM devices WHERE room_id = ? ORDER BY created_at ASC').bind(room.id).all();
          return json(env, { devices: results || [] });
        }
        if (request.method === 'POST') {
          const d = { id: rid('dev'), room_id: room.id, device_name: sanitize(body?.device_name || 'Unknown device').slice(0, 60), device_type: sanitize(body?.device_type || 'desktop').slice(0, 20), browser: sanitize(body?.browser || '').slice(0, 80), connection_status: 'connected', last_seen: now(), created_at: now() };
          await env.DB.prepare('INSERT INTO devices (id, room_id, device_name, device_type, browser, connection_status, last_seen, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
            .bind(d.id, d.room_id, d.device_name, d.device_type, d.browser, d.connection_status, d.last_seen, d.created_at).run();
          broadcast(env, code, { type: 'device.connected', device: d });
          return json(env, { device: d }, 201);
        }
      }

      if (sub === '/files') {
        if (request.method === 'GET') {
          const { results } = await env.DB.prepare('SELECT * FROM files WHERE room_id = ? ORDER BY uploaded_at DESC').bind(room.id).all();
          return json(env, { files: results || [] });
        }
        if (request.method === 'POST') {
          const { filename, mime_type, data_base64, uploaded_by } = body || {};
          if (!filename || !data_base64) return json(env, { error: 'filename and data_base64 required' }, 400);
          if (!ALLOWED_MIME.has(mime_type)) return json(env, { error: 'Unsupported file type.' }, 415);
          const bin = Uint8Array.from(atob(data_base64), (c) => c.charCodeAt(0));
          if (bin.length > MAX_FILE) return json(env, { error: 'File exceeds 25MB limit.' }, 413);
          const f = { id: rid('file'), room_id: room.id, original_filename: sanitize(filename).slice(0, 120), storage_key: `rooms/${code}/${rid('file')}-${sanitize(filename).slice(0, 60)}`, mime_type, file_size: bin.length, uploaded_by: uploaded_by || 'unknown', uploaded_at: now(), expires_at: room.expires_at };
          await env.FILES.put(f.storage_key, bin, { httpMetadata: { contentType: mime_type } });
          await env.DB.prepare('INSERT INTO files (id, room_id, original_filename, storage_key, mime_type, file_size, uploaded_by, uploaded_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
            .bind(f.id, f.room_id, f.original_filename, f.storage_key, f.mime_type, f.file_size, f.uploaded_by, f.uploaded_at, f.expires_at).run();
          broadcast(env, code, { type: 'file.uploaded', file: f });
          return json(env, { file: f }, 201);
        }
      }
    }

    if (path === '/api/rooms' && request.method === 'POST') {
      const { name, expiresIn, customTtlSec, password, isPrivate } = body || {};
      if (customTtlSec != null && (customTtlSec < 60 || customTtlSec > 7 * 86400)) return json(env, { error: 'customTtlSec must be 60..604800' }, 400);
      if (password && String(password).length < 4) return json(env, { error: 'Password too short (min 4 chars).' }, 400);
      const ttl = customTtlSec || EXPIRY_OPTIONS[expiresIn] || 86400;
      const code = roomCode();
      const t = now();
      const room = { id: rid('room'), room_code: code, room_name: sanitize(name || 'Untitled room').slice(0, 80) || 'Untitled room', password_hash: password ? await sha256('clipboard:' + password) : null, created_at: t, updated_at: t, expires_at: t + ttl * 1000, is_private: (isPrivate || password) ? 1 : 0, encryption_enabled: 0, status: 'active', version: 0, content: '', content_type: 'text', last_sync_at: t };
      await env.DB.prepare('INSERT INTO rooms (id, room_code, room_name, password_hash, created_at, updated_at, expires_at, is_private, encryption_enabled, status, version, content, content_type, last_sync_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(room.id, room.room_code, room.room_name, room.password_hash, room.created_at, room.updated_at, room.expires_at, room.is_private, room.encryption_enabled, room.status, room.version, room.content, room.content_type, room.last_sync_at).run();
      scheduleExpiry(env, code, room.expires_at);
      return json(env, { room: publicRoom(rowToRoom(room)), url: `/c/${code}` }, 201);
    }

    const hist = path.match(/^\/api\/history\/([^/]+)$/);
    if (hist) {
      if (request.method === 'PATCH') {
        const { pinned, content } = body || {};
        const updates = [];
        const params = [];
        if (pinned != null) { updates.push('is_pinned = ?'); params.push(pinned ? 1 : 0); }
        if (content != null) { updates.push('content = ?'); params.push(sanitize(content)); }
        if (!updates.length) return json(env, { error: 'Nothing to update.' }, 400);
        updates.push('updated_at = ?'); params.push(now()); params.push(hist[1]);
        const r = await env.DB.prepare(`UPDATE clipboard_entries SET ${updates.join(', ')} WHERE id = ?`).bind(...params).run();
        if (!r.meta.changes) return json(env, { error: 'Entry not found.' }, 404);
        const entry = await env.DB.prepare('SELECT * FROM clipboard_entries WHERE id = ?').bind(hist[1]).first();
        return json(env, { entry: { ...entry, is_pinned: !!entry.is_pinned } });
      }
      if (request.method === 'DELETE') {
        const meta = await env.DB.prepare('SELECT * FROM clipboard_entries WHERE id = ?').bind(hist[1]).first();
        if (!meta) return json(env, { error: 'Entry not found.' }, 404);
        await env.DB.prepare('DELETE FROM clipboard_entries WHERE id = ?').bind(hist[1]).run();
        return json(env, { ok: true });
      }
    }

    const dev = path.match(/^\/api\/devices\/([^/]+)$/);
    if (dev) {
      if (request.method === 'PATCH') {
        const d = await env.DB.prepare('SELECT * FROM devices WHERE id = ?').bind(dev[1]).first();
        if (!d) return json(env, { error: 'Device not found.' }, 404);
        const updates = [];
        const params = [];
        if (body?.device_name) { updates.push('device_name = ?'); params.push(sanitize(body.device_name).slice(0, 60)); }
        if (body?.connection_status) { updates.push('connection_status = ?'); params.push(body.connection_status); }
        updates.push('last_seen = ?'); params.push(now()); params.push(dev[1]);
        await env.DB.prepare(`UPDATE devices SET ${updates.join(', ')} WHERE id = ?`).bind(...params).run();
        const row = await env.DB.prepare('SELECT * FROM devices WHERE id = ?').bind(dev[1]).first();
        return json(env, { device: row });
      }
      if (request.method === 'DELETE') {
        const d = await env.DB.prepare('SELECT * FROM devices WHERE id = ?').bind(dev[1]).first();
        if (!d) return json(env, { error: 'Device not found.' }, 404);
        await env.DB.prepare('DELETE FROM devices WHERE id = ?').bind(dev[1]).run();
        const room = await env.DB.prepare('SELECT * FROM rooms WHERE id = ?').bind(d.room_id).first();
        if (room) broadcast(env, room.room_code, { type: 'device.disconnected', device_id: d.id });
        return json(env, { ok: true });
      }
    }

    const fdel = path.match(/^\/api\/files\/([^/]+)$/);
    if (fdel && request.method === 'DELETE') {
      const f = await env.DB.prepare('SELECT * FROM files WHERE id = ?').bind(fdel[1]).first();
      if (!f) return json(env, { error: 'File not found.' }, 404);
      await env.DB.prepare('DELETE FROM files WHERE id = ?').bind(fdel[1]).run();
      try { await env.FILES.delete(f.storage_key); } catch {}
      const room = await env.DB.prepare('SELECT * FROM rooms WHERE id = ?').bind(f.room_id).first();
      if (room) broadcast(env, room.room_code, { type: 'file.deleted', file_id: fdel[1] });
      return json(env, { ok: true });
    }

    return json(env, { error: 'Not found.' }, 404);
  },
};
