import { useEffect, useRef, useState, useCallback } from 'react';
import type { ConnectionState } from '../types';

// WebSocket with exponential-backoff auto-reconnect.
export function useRoomSocket(code: string | undefined, onEvent: (msg: any) => void) {
  const [state, setState] = useState<ConnectionState>(code ? 'Reconnecting' : 'Disconnected');
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(0);
  const timerRef = useRef<number | undefined>(undefined);
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  const pollRef = useRef(0);
  const versionRef = useRef<number | null>(null);

  const poll = useCallback(async () => {
    if (!code) return;
    if (!navigator.onLine) { setState('Offline'); return; }
    const apiBase = ((import.meta.env.VITE_API_URL as string | undefined) ?? '').replace(/\/$/, '');
    try {
      const res = await fetch(`${apiBase}/api/rooms/${code}/clipboard`);
      if (res.status === 410 || res.status === 404) { setState('Disconnected'); handlerRef.current({ type: 'room.expired' }); return; }
      if (!res.ok) { setState('Connected'); return; }
      const d = await res.json();
      if (versionRef.current === null) { versionRef.current = d.version; setState('Connected'); return; }
      if (typeof d.version !== 'number') { setState('Connected'); return; }
      if (d.version < versionRef.current) return; // stale response arriving out of order: ignore, never rewind
      if (d.version !== versionRef.current) {
        versionRef.current = d.version;
        setState('Synced');
        handlerRef.current({ type: 'clipboard.updated', content: d.content, content_type: d.content_type, version: d.version, last_sync_at: d.last_sync_at });
      } else setState('Connected');
    } catch { setState('Reconnecting'); }
  }, [code]);

  const connect = useCallback(() => {
    if (!code) return;
    if ((import.meta.env.VITE_WS_URL as string | undefined) === 'poll') {
      setState('Reconnecting');
      window.clearInterval(pollRef.current);
      pollRef.current = window.setInterval(poll, 2000);
      poll();
      return;
    }
    if (!navigator.onLine) setState('Offline');
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const wsBase = ((import.meta.env.VITE_WS_URL as string | undefined) ?? `${proto}://${location.host}`).replace(/\/$/, '');
    const ws = new WebSocket(`${wsBase}/ws/rooms/${code}`);
    wsRef.current = ws;
    ws.onopen = () => { retryRef.current = 0; setState('Connected'); };
    ws.onmessage = (e) => { try { handlerRef.current(JSON.parse(e.data)); } catch {} };
    ws.onclose = (e) => {
      if (e.code === 4410 || e.code === 4404) { setState('Disconnected'); return; }
      setState('Reconnecting');
      const delay = Math.min(30000, 1000 * 2 ** retryRef.current++);
      window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(connect, delay);
    };
    ws.onerror = () => ws.close();
  }, [code, poll]);

  useEffect(() => {
    connect();
    const onOnline = () => connect();
    const onOffline = () => setState('Offline');
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.clearTimeout(timerRef.current);
      window.clearInterval(pollRef.current);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      wsRef.current?.close();
    };
  }, [connect]);

  return { state, setState };
}
