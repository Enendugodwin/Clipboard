import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, Eraser, Share2, Save, QrCode, Plus, LogIn } from 'lucide-react';
import { api } from '../services/api';
import { copyText, timeAgo, expiryLabel } from '../utils/clipboard';

interface RecentRoom { code: string; name: string; at: number; expires: number; devices: number; }

function getRecent(): RecentRoom[] {
  try { return JSON.parse(localStorage.getItem('clip-recent') || '[]'); } catch { return []; }
}
export function saveRecent(r: RecentRoom) {
  const list = [r, ...getRecent().filter((x) => x.code !== r.code)].slice(0, 8);
  localStorage.setItem('clip-recent', JSON.stringify(list));
}

const EXPIRY = ['5m', '15m', '30m', '1h', '6h', '24h'];

const STEPS = [
  { n: '01', title: 'Create a room', body: 'One click gives you a private link with auto-expiry.' },
  { n: '02', title: 'Share the link', body: 'Send the URL or scan the QR from any device.' },
  { n: '03', title: 'Paste anywhere', body: 'Text you paste appears on every connected device.' },
];

export function Home({ onToast, onConn }: { onToast: (m: string, k?: any) => void; onConn: (s: any) => void }) {
  const nav = useNavigate();
  const [text, setText] = useState('');
  const [synced, setSynced] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [expiry, setExpiry] = useState('24h');
  const [roomName, setRoomName] = useState('');
  const [password, setPassword] = useState('');
  const [recent, setRecent] = useState<RecentRoom[]>(getRecent);

  const create = async () => {
    try {
      const d = await api.createRoom({ name: roomName || undefined, expiresIn: expiry, password: password || undefined });
      saveRecent({ code: d.room.room_code, name: d.room.room_name, at: Date.now(), expires: d.room.expires_at, devices: 1 });
      nav(`/c/${d.room.room_code}`);
    } catch (e: any) { onToast(e.message, 'error'); }
  };

  const shareQuick = async () => {
    if (!text.trim()) { onToast('Paste something first', 'error'); return; }
    try {
      const d = await api.createRoom({ expiresIn: expiry });
      await api.putClipboard(d.room.room_code, { content: text, content_type: 'text' });
      saveRecent({ code: d.room.room_code, name: d.room.room_name, at: Date.now(), expires: d.room.expires_at, devices: 1 });
      setSynced(true); onToast('Shared — room created', 'success');
      nav(`/c/${d.room.room_code}`);
    } catch (e: any) { onToast(e.message, 'error'); }
  };

  void onConn;
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:py-14">
      <div className="mx-auto max-w-2xl text-center animate-fade-up">
        <span className="inline-flex items-center gap-2 rounded-full border border-moss/25 bg-moss/5 px-3 py-1 text-[11px] font-medium tracking-wide text-moss-deep dark:border-white/30 dark:bg-transparent dark:text-white">
          <span className="h-1.5 w-1.5 rounded-full bg-moss-deep dark:bg-white" />
          No accounts · No installs · Just a link
        </span>
        <h1 className="mt-4 text-3xl sm:text-5xl font-semibold tracking-tight text-ink dark:text-white">Your clipboard. Everywhere.</h1>
        <p className="mt-3 text-ink/60 dark:text-white/60">Copy on one device. Paste on another. Instantly.</p>

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button onClick={create} className="flex items-center gap-2 bg-moss-deep border border-moss-deep dark:bg-white dark:border-white text-[#f7f4ec] dark:text-black font-medium rounded-md px-5 py-2.5"><Plus size={16} /> Create Clipboard</button>
          <div className="flex gap-2 w-full sm:w-auto justify-center">
            <input value={joinCode} onChange={(e) => setJoinCode(e.target.value)} placeholder="Room ID or URL" className="border border-ink/30 dark:border-white rounded-md px-3 py-2 text-sm flex-1 min-w-0 sm:w-48 sm:flex-none bg-paper dark:bg-black text-ink dark:text-white" />
            <button onClick={() => { const code = joinCode.split('/c/').pop()?.trim(); if (code) nav(`/c/${code}`); }} className="flex items-center gap-2 border border-ink/30 dark:border-white rounded-md px-4 py-2.5 text-sm font-medium text-ink dark:text-white whitespace-nowrap"><LogIn size={16} /> Join</button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs text-ink/70 dark:text-white/70">
          <label>Room name <input value={roomName} onChange={(e) => setRoomName(e.target.value)} placeholder="Optional" className="border border-ink/30 dark:border-white rounded px-2 py-1 ml-1 w-28 bg-paper dark:bg-black" /></label>
          <label>Expires <select value={expiry} onChange={(e) => setExpiry(e.target.value)} className="border border-ink/30 dark:border-white rounded px-2 py-1 ml-1 bg-paper dark:bg-black">{EXPIRY.map((e) => <option key={e} value={e}>{e}</option>)}</select></label>
          <label>Password <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Optional" className="border border-ink/30 dark:border-white rounded px-2 py-1 ml-1 w-28 bg-paper dark:bg-black" /></label>
        </div>
      </div>

      <div className="mt-10 hidden sm:grid gap-3 sm:grid-cols-3">
        {STEPS.map((s) => (
          <div key={s.n} className="rounded-lg border border-ink/15 dark:border-white bg-parchment dark:bg-black p-4 shadow-soft">
            <p className="text-[11px] font-semibold tracking-widest text-moss-deep dark:text-white">{s.n}</p>
            <h3 className="mt-1 text-sm font-semibold text-ink dark:text-white">{s.title}</h3>
            <p className="mt-1 text-xs leading-relaxed text-ink/60 dark:text-white/60">{s.body}</p>
          </div>
        ))}
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-5">
        <section className="rounded-xl border border-ink/15 dark:border-white bg-parchment dark:bg-black p-5 shadow-soft lg:col-span-3">
          <h2 className="font-semibold text-ink dark:text-white">Quick Clipboard</h2>
          <textarea value={text} onChange={(e) => { setText(e.target.value); setSynced(false); }} placeholder="Paste anything here…" rows={5} className="mt-3 w-full border border-ink/30 dark:border-white rounded-lg p-3 text-sm bg-paper dark:bg-black text-ink dark:text-white" />
          <p className="flex items-center gap-1.5 text-xs mt-2 text-ink/60 dark:text-white/60">
            <span className={`h-1.5 w-1.5 rounded-full ${synced ? 'bg-moss-deep dark:bg-white' : 'border border-ink/40 dark:border-white/60'}`} />
            {synced ? 'Synchronised' : 'Not synchronised yet'}
          </p>
          <div className="flex flex-wrap gap-2 mt-3">
            <button onClick={async () => { await copyText(text); onToast('Copied', 'success'); }} className="flex items-center gap-1 text-sm border border-ink/30 dark:border-white rounded-md px-3 py-1.5 text-ink dark:text-white"><Copy size={14} /> Copy</button>
            <button onClick={() => { setText(''); setSynced(false); }} className="flex items-center gap-1 text-sm border border-ink/30 dark:border-white rounded-md px-3 py-1.5 text-ink dark:text-white"><Eraser size={14} /> Clear</button>
            <button onClick={shareQuick} className="flex items-center gap-1 text-sm bg-moss-deep dark:bg-white text-[#f7f4ec] dark:text-black border border-moss-deep dark:border-white rounded-md px-3 py-1.5"><Share2 size={14} /> Share</button>
            <button onClick={shareQuick} className="flex items-center gap-1 text-sm border border-ink/30 dark:border-white rounded-md px-3 py-1.5 text-ink dark:text-white"><Save size={14} /> Save</button>
            <button onClick={shareQuick} className="flex items-center gap-1 text-sm border border-ink/30 dark:border-white rounded-md px-3 py-1.5 text-ink dark:text-white"><QrCode size={14} /> QR</button>
          </div>
        </section>

        <section className="rounded-xl border border-ink/15 dark:border-white bg-parchment dark:bg-black p-5 shadow-soft lg:col-span-2">
          <h2 className="font-semibold text-ink dark:text-white">Recent Rooms</h2>
          <div className="grid gap-2 mt-3">
            {recent.map((r) => (
              <button key={r.code} onClick={() => nav(`/c/${r.code}`)} className="text-left border border-ink/15 dark:border-white rounded-lg px-4 py-3 text-ink dark:text-white min-w-0 overflow-hidden">
                <span className="font-medium block truncate">{r.name}</span>
                <span className="text-xs text-ink/60 dark:text-white/60">{r.code} · {timeAgo(r.at)} · {expiryLabel(r.expires)}</span>
              </button>
            ))}
            {!recent.length && <p className="text-sm text-ink/60 dark:text-white/60">No recent rooms. Create one above.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
