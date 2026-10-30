import { useEffect, useRef, useState } from 'react';
import { Upload, FileDown, Trash2 } from 'lucide-react';
import { api } from '../services/api';
import type { FileMeta } from '../types';

function toBase64(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1]);
    r.onerror = rej; r.readAsDataURL(file);
  });
}

export function FilePanel({ code, onToast, onEvent }: { code: string; onToast: (m: string, k?: any) => void; onEvent: (kind: string) => void }) {
  const [files, setFiles] = useState<FileMeta[]>([]);
  const [progress, setProgress] = useState<string | null>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const load = async () => { try { setFiles((await api.files(code)).files); } catch {} };
  useEffect(() => { load(); }, [code]);

  const upload = async (f: File) => {
    setProgress(`Uploading ${f.name}…`); onEvent('Uploading');
    try {
      const data_base64 = await toBase64(f);
      await api.uploadFile(code, { filename: f.name, mime_type: f.type || 'application/octet-stream', data_base64, uploaded_by: 'web' });
      onToast('Upload complete', 'success'); load();
    } catch (e: any) { onToast(e.message || 'Upload failed', 'error'); }
    finally { setProgress(null); onEvent('Upload complete'); }
  };

  useEffect(() => {
    const el = dropRef.current;
    if (!el) return;
    const over = (e: DragEvent) => e.preventDefault();
    const drop = (e: DragEvent) => { e.preventDefault(); const f = e.dataTransfer?.files?.[0]; if (f) upload(f); };
    el.addEventListener('dragover', over); el.addEventListener('drop', drop);
    return () => { el.removeEventListener('dragover', over); el.removeEventListener('drop', drop); };
  });

  return (
    <div ref={dropRef} className="border border-dashed border-ink/30 dark:border-white rounded-xl p-4 bg-parchment dark:bg-black shadow-soft">
      <h3 className="font-semibold mb-2 flex items-center gap-2 text-ink dark:text-white"><Upload size={16} /> Files <span className="text-xs font-normal text-ink/60 dark:text-white/60">drag &amp; drop or pick</span></h3>
      <input type="file" aria-label="Choose file" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} className="text-sm text-ink dark:text-white" />
      {progress && <p className="text-xs font-medium mt-1" role="status">{progress}</p>}
      <div className="flex flex-col gap-1 mt-2">
        {files.map((f) => (
          <div key={f.id} className="flex flex-wrap items-center gap-2 text-sm text-ink dark:text-white min-w-0">
            <span className="truncate min-w-0 flex-1">{f.original_filename}</span>
            <span className="text-xs text-ink/60 dark:text-white/60">{(f.file_size / 1024).toFixed(1)} KB</span>
            <span className="ml-auto flex gap-2">
              <a href={`/api/files/${f.id}/download`} className="flex items-center gap-1 text-xs underline underline-offset-2"><FileDown size={13} /> Download</a>
              <button onClick={async () => { await api.deleteFile(f.id); load(); }} title="Delete file"><Trash2 size={13} /></button>
            </span>
          </div>
        ))}
        {!files.length && <p className="text-xs text-ink/60 dark:text-white/60">No files yet.</p>}
      </div>
    </div>
  );
}
