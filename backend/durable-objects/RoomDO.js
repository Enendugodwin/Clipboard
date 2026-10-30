// Cloudflare Durable Object: per-room realtime hub + server-side expiry enforcement.
// Wiring: backend/workers/api.js routes /ws/rooms/:code here; wrangler.toml binds ROOM_DO, DB, FILES.
export class RoomDO {
  constructor(state, env) { this.state = state; this.env = env; this.sockets = new Set(); }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname.endsWith('/internal/broadcast') && request.method === 'POST') {
      this.broadcast(await request.json());
      return Response.json({ ok: true });
    }

    if (url.pathname.endsWith('/internal/schedule-expiry') && request.method === 'POST') {
      const { room_code, expires_at } = await request.json();
      await this.state.storage.put('expiry', { room_code, expires_at });
      const delay = Math.max(0, expires_at - Date.now());
      await this.state.storage.setAlarm(Date.now() + delay);
      return Response.json({ ok: true });
    }

    if (request.headers.get('Upgrade') === 'websocket') {
      const [client, server] = Object.values(new WebSocketPair());
      server.accept();
      this.sockets.add(server);
      server.addEventListener('message', async (e) => {
        try { const m = JSON.parse(e.data); if (m.type === 'ping') server.send(JSON.stringify({ type: 'pong', t: Date.now() })); } catch {}
      });
      const close = () => { this.sockets.delete(server); this.broadcast({ type: 'device.disconnected' }); };
      server.addEventListener('close', close); server.addEventListener('error', close);
      this.broadcast({ type: 'device.connected' });
      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response('RoomDO ok', { status: 200 });
  }

  async alarm() {
    const rec = await this.state.storage.get('expiry');
    if (!rec) return;
    const { room_code } = rec;
    const room = await this.env.DB.prepare('SELECT * FROM rooms WHERE room_code = ?').bind(room_code).first().catch(() => null);
    if (room) {
      await this.env.DB.batch([
        this.env.DB.prepare('DELETE FROM clipboard_entries WHERE room_id = ?').bind(room.id),
        this.env.DB.prepare('DELETE FROM devices WHERE room_id = ?').bind(room.id),
        this.env.DB.prepare('DELETE FROM files WHERE room_id = ?').bind(room.id),
        this.env.DB.prepare("UPDATE rooms SET status = 'expired', content = '' WHERE room_code = ?").bind(room_code),
      ]).catch(() => {});
      try {
        const listed = await this.env.FILES.list({ prefix: `rooms/${room_code}/` });
        for (const o of listed.objects || []) await this.env.FILES.delete(o.key);
      } catch {}
    }
    this.broadcast({ type: 'room.expired' });
    await this.state.storage.delete('expiry');
  }

  broadcast(msg) {
    const data = JSON.stringify(msg);
    for (const ws of this.sockets) { try { ws.send(data); } catch {} }
  }
}
