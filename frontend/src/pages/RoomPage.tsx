import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Copy, Eraser, Share2, QrCode, Lock, Trash2 } from 'lucide-react';
import { api } from '../services/api';
import { useRoomSocket } from '../services/socket';
import type { Room } from '../types';
import { copyText, expiryLabel, getDeviceInfo } from '../utils/clipboard';
import { ContentView } from '../components/ContentView';
import { QRModal } from '../components/QRModal';
import { HistoryList } from '../components/HistoryList';
import { DevicesPanel } from '../components/DevicesPanel';
import { FilePanel } from '../components/FilePanel';

export function RoomPage({ onToast, onConn }: { onToast: (m: string, k?: any) => void; onConn: (s: any) => void }) {
  const { id: code = '' } = useParams();
  const navigate = useNavigate();
  const [room, setRoom] = useState<Room | null>(null);
  const [text, setText] = useState('');
  const [version, setVersion] = useState(0);
  const [password, setPassword] = useState('');
  const [needPw, setNeedPw] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [histKey, setHistKey] = useState(0);
  const [opState, setOpState] = useState('');
  const [dirty, setDirty] = useState(false);
  const savingRef = useRef(false);

  const onEvent = useCallback((msg: any) => {
    if (msg.type === 'clipboard.updated') { setText(msg.content); setVersion(msg.version); setDirty(false); setHistKey((k) => k + 1); onToast('Synced update received', 'success'); }
    if (msg.type === 'clipboard.cleared') { setText(''); setVersion(msg.version); setDirty(false); }
    if (msg.type === 'room.expired') { onToast('Room expired', 'error'); setRoom(null); }
  }, [onToast]);

  const { state, setState } = useRoomSocket(room ? code : undefined, onEvent);
  useEffect(() => { onConn(state); }, [state, onConn]);

  const load = useCallback(async (pw?: string) => {
    try {
      const d = await api.getRoom(code, pw ?? password);
      setRoom(d.room); setText(d.room.content); setVersion(d.room.version); setNeedPw(false);
      if (pw) sessionStorage.setItem('clip-pw', pw);
      const info = getDeviceInfo();
      await api.registerDevice(code, { device_name: `${info.device_type} · web`, device_type: info.device_type, browser: info.browser }).catch(() => {});
    } catch (e: any) {
      if (e.status === 401) setNeedPw(true);
      else onToast(e.message, 'error');
    }
  }, [code, password, onToast]);
  useEffect(() => { load(); }, [load]);

  const save = async (value: string) => {
    if (!room || savingRef.current) return;
    savingRef.current = true;
    setState('Syncing'); setOpState('Syncing…');
    try {
      const r = await api.putClipboard(code, { content: value, content_type: 'text', base_version: version });
      setVersion(r.version); setDirty(false); setState('Synced'); setOpState(`Synced · v${r.version}`);
      setHistKey((k) => k + 1);
      localStorage.removeItem(`clip-outbox-${code}`);
    } catch (e: any) {
      if (!navigator.onLine) { localStorage.setItem(`clip-outbox-${code}`, value); setState('Offline'); }
      else setState('Connected');
      onToast(e.message, 'error');
    } finally {
      savingRef.current = false;
    }
  };
  const onChange = (v: string) => {
    setText(v);
    setDirty(true);
  };

  if (needPw) return (
    <div className="max-w-sm mx-auto py-16 px-4">
      <h2 className="font-semibold flex items-center gap-2 text-ink dark:text-white"><Lock size={16} /> Password-protected room</h2>
      <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Room password" className="mt-3 w-full border border-ink/30 dark:border-white rounded-md px-3 py-2 bg-paper dark:bg-black text-ink dark:text-white" />
      <button onClick={() => load(password)} className="mt-2 w-full bg-moss-deep dark:bg-white text-[#f7f4ec] dark:text-black rounded-md py-2 border border-moss-deep dark:border-white">Unlock</button>
    </div>
  );
  if (!room) return <p className="max-w-3xl mx-auto py-16 px-4 text-sm text-ink/60 dark:text-white/60">Loading room… (invalid, expired, deleted, or access denied)</p>;

  const url = `${location.origin}/c/${code}`;

  const removeRoom = async () => {
    if (!window.confirm(`Delete room "${room.room_name}" and all its content, history, and files? This cannot be undone.`)) return;
    try {
      await api.deleteRoom(code);
      onToast('Room deleted', 'success');
      navigate('/');
    } catch (e: any) { onToast(e.message, 'error'); }
  };
  return (
    <div className="max-w-3xl mx-auto px-4 py-6 flex flex-col gap-4">
      <div className="flex items-center gap-2 flex-wrap">
        <h1 className="text-xl font-semibold text-ink dark:text-white">{room.room_name}</h1>
        <span className="text-xs text-ink/60 dark:text-white/60">{code} · v{version} · {expiryLabel(room.expires_at)}</span>
        <span className="text-xs text-ink/60 dark:text-white/60 ml-auto" role="status">{opState || (dirty ? 'Unsaved changes' : state)}</span>
      </div>
      <textarea value={text} onChange={(e) => onChange(e.target.value)} placeholder="Paste anything here…" rows={7} className="w-full border border-ink/30 dark:border-white rounded-lg p-3 text-sm bg-paper dark:bg-black text-ink dark:text-white shadow-soft" />
      <div className="flex flex-wrap gap-2">
        <button onClick={() => save(text)} disabled={!dirty} title={dirty ? 'Push your edits to all devices' : 'Everything is already synced'} className={`flex items-center gap-1 text-sm rounded-md px-4 py-1.5 font-medium border ${dirty ? 'bg-moss-deep dark:bg-white text-[#f7f4ec] dark:text-black border-moss-deep dark:border-white' : 'border-ink/30 dark:border-white text-ink/60 dark:text-white/60'}`}><Share2 size={14} /> {dirty ? 'Sync now' : 'Synced ✓'}</button>
        <button onClick={async () => { await copyText(text); onToast('Copied', 'success'); }} className="flex items-center gap-1 text-sm border border-ink/30 dark:border-white rounded-md px-3 py-1.5 text-ink dark:text-white"><Copy size={14} /> Copy</button>
        <button onClick={async () => { const r = await api.clearClipboard(code); setText(''); setVersion(r.version); setDirty(false); onToast('Cleared'); }} className="flex items-center gap-1 text-sm border border-ink/30 dark:border-white rounded-md px-3 py-1.5 text-ink dark:text-white"><Eraser size={14} /> Clear</button>
        <button onClick={async () => { await copyText(url); onToast('Room URL copied', 'success'); }} className="flex items-center gap-1 text-sm border border-ink/30 dark:border-white rounded-md px-3 py-1.5 text-ink dark:text-white"><Share2 size={14} /> Share</button>
        <button onClick={() => setShowQR(true)} className="flex items-center gap-1 text-sm border border-ink/30 dark:border-white rounded-md px-3 py-1.5 text-ink dark:text-white"><QrCode size={14} /> QR</button>
        <button onClick={removeRoom} className="flex items-center gap-1 text-sm border border-ink/30 dark:border-white rounded-md px-3 py-1.5 text-ink dark:text-white ml-auto"><Trash2 size={14} /> Delete room</button>
      </div>
      <div className="border border-ink/15 dark:border-white rounded-xl p-4 bg-parchment dark:bg-black shadow-soft">
        <h3 className="font-semibold mb-2 text-ink dark:text-white">Preview</h3>
        <ContentView text={text} onToast={onToast} />
      </div>
      <HistoryList code={code} refreshKey={histKey} onRestore={(t) => { setText(t); setDirty(true); save(t); }} onToast={onToast} />
      <DevicesPanel code={code} onToast={onToast} />
      <FilePanel code={code} onToast={onToast} onEvent={(s) => setOpState(s)} />
      {showQR && <QRModal url={url} onClose={() => setShowQR(false)} onToast={onToast} />}
    </div>
  );
}
