'use strict';
// Vercel Cron: sweep expired rooms (KV + Blob). Runs daily; reads are also
// lazily guarded with 410, so this is cleanup, not enforcement.
const { kv } = require('@vercel/kv');
const { del } = require('@vercel/blob');
const S = require('../_lib/store');

module.exports = async function handler(req, res) {
  if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }
  const idx = (await kv.get('rooms:index')) || [];
  let swept = 0;
  for (const code of [...idx]) {
    const room = await S.getRoom(code);
    if (room && S.isExpired(room)) {
      const files = (await kv.get(`files:${code}`)) || [];
      for (const f of files) { try { await del(f.storage_key); } catch {} }
      await S.deleteRoomCascade(code);
      swept++;
    }
  }
  res.json({ ok: true, swept });
};
