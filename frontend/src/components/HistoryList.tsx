import { useEffect, useState } from 'react';
import { Pin, Copy, Trash2, History } from 'lucide-react';
import { api } from '../services/api';
import type { Entry } from '../types';
import { copyText, timeAgo } from '../utils/clipboard';

export function HistoryList({ code, refreshKey, onRestore, onToast }: { code: string; refreshKey: number; onRestore: (text: string) => void; onToast: (m: string, k?: any) => void }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const load = async () => {
    try { const d = await api.history(code, q, page); setEntries(d.entries); setTotal(d.total); }
    catch (e: any) { onToast(e.message, 'error'); }
  };
  useEffect(() => { load(); }, [code, refreshKey, page]);
  useEffect(() => { setPage(1); }, [q]);

  return (
    <div className="border border-ink/15 dark:border-white rounded-xl p-4 bg-parchment dark:bg-black shadow-soft">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <History size={16} /><h3 className="font-semibold text-ink dark:text-white">History</h3>
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()} placeholder="Search history…" className="ml-auto text-sm border border-ink/30 dark:border-white rounded-md px-2 py-1 w-32 sm:w-40 flex-1 min-w-0 bg-paper dark:bg-black text-ink dark:text-white" />
        <button onClick={load} className="text-xs border border-ink/30 dark:border-white rounded-md px-2 py-1 text-ink dark:text-white">Search</button>
      </div>
      <div className="flex flex-col gap-2 max-h-72 overflow-auto">
        {entries.map((e) => (
          <div key={e.id} className="border border-ink/15 dark:border-white rounded-lg p-2 text-sm text-ink dark:text-white bg-paper dark:bg-black">
            <p className="truncate">{e.content || <span className="text-ink/60 dark:text-white/60">(empty)</span>}</p>
            <div className="flex items-center gap-2 mt-1 text-xs text-ink/60 dark:text-white/60">
              <span>{timeAgo(e.created_at)}</span>
              {e.is_pinned && <span className="font-semibold text-moss-deep dark:text-white">● pinned</span>}
              <span className="ml-auto flex gap-1">
                <button title="Restore" onClick={() => onRestore(e.content)} className="border border-ink/30 dark:border-white rounded px-1">Restore</button>
                <button title="Copy" onClick={async () => { await copyText(e.content); onToast('Copied', 'success'); }}><Copy size={13} /></button>
                <button title="Pin" onClick={async () => { await api.pinEntry(e.id, !e.is_pinned); load(); }}><Pin size={13} /></button>
                <button title="Delete" onClick={async () => { await api.deleteEntry(e.id); onToast('Entry deleted'); load(); }}><Trash2 size={13} /></button>
              </span>
            </div>
          </div>
        ))}
        {!entries.length && <p className="text-xs text-ink/60 dark:text-white/60">No entries yet.</p>}
      </div>
      <div className="flex items-center gap-2 mt-2 text-xs text-ink/60 dark:text-white/60">
        <span>{total} entries</span>
        <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="border border-ink/30 dark:border-white rounded px-2 py-0.5">Prev</button>
        <button onClick={() => setPage((p) => p + 1)} className="border border-ink/30 dark:border-white rounded px-2 py-0.5">Next</button>
      </div>
    </div>
  );
}
