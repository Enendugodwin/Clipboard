import { QRCodeSVG } from 'qrcode.react';
import { X, Download, Copy, Share2 } from 'lucide-react';
import { copyText } from '../utils/clipboard';

export function QRModal({ url, onClose, onToast }: { url: string; onClose: () => void; onToast: (m: string, k?: any) => void }) {
  const download = () => {
    const svg = document.querySelector('#qr-modal svg');
    if (!svg) return;
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'clipboard-qr.svg'; a.click();
    URL.revokeObjectURL(a.href);
  };
  const share = async () => {
    if ((navigator as any).share) { try { await (navigator as any).share({ title: 'CLIPBOARD room', url }); } catch {} }
    else { await copyText(url); onToast('Room URL copied', 'success'); }
  };
  return (
    <div className="fixed inset-0 z-50 bg-ink/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-parchment dark:bg-black border border-ink/15 dark:border-white rounded-xl p-6 max-w-xs w-full" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-ink dark:text-white">Scan to open room</h3>
          <button onClick={onClose} aria-label="Close" className="text-ink dark:text-white"><X size={18} /></button>
        </div>
        <div id="qr-modal" className="bg-white p-3 rounded-lg mx-auto w-fit border border-ink/15"><QRCodeSVG value={url} size={200} fgColor="#1c1917" bgColor="#ffffff" /></div>
        <p className="text-xs break-all mt-3 text-ink/60 dark:text-white/60">{url}</p>
        <div className="flex flex-col sm:flex-row gap-2 mt-4">
          <button onClick={download} className="flex-1 flex items-center justify-center gap-1 text-sm border border-ink/30 dark:border-white rounded-md px-2 py-2 text-ink dark:text-white"><Download size={14} /> Save</button>
          <button onClick={async () => { await copyText(url); onToast('Room URL copied', 'success'); }} className="flex-1 flex items-center justify-center gap-1 text-sm border border-ink/30 dark:border-white rounded-md px-2 py-2 text-ink dark:text-white"><Copy size={14} /> Copy</button>
          <button onClick={share} className="flex-1 flex items-center justify-center gap-1 text-sm bg-moss-deep dark:bg-white text-[#f7f4ec] dark:text-black border border-moss-deep dark:border-white rounded-md px-2 py-2"><Share2 size={14} /> Share</button>
        </div>
      </div>
    </div>
  );
}
