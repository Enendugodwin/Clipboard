import { useEffect, useState } from 'react';
import { MonitorSmartphone, Pencil, Unplug } from 'lucide-react';
import { api } from '../services/api';
import type { Device } from '../types';
import { timeAgo } from '../utils/clipboard';

export function DevicesPanel({ code, onToast }: { code: string; onToast: (m: string, k?: any) => void }) {
  const [devices, setDevices] = useState<Device[]>([]);
  const load = async () => { try { setDevices((await api.devices(code)).devices); } catch {} };
  useEffect(() => { load(); const t = setInterval(load, 10000); return () => clearInterval(t); }, [code]);
  return (
    <div className="border border-ink/15 dark:border-white rounded-xl p-4 bg-parchment dark:bg-black shadow-soft">
      <h3 className="font-semibold mb-2 flex items-center gap-2 text-ink dark:text-white"><MonitorSmartphone size={16} /> Devices</h3>
      <div className="flex flex-col gap-2">
        {devices.map((d) => (
          <div key={d.id} className="flex flex-wrap items-center gap-2 text-sm text-ink dark:text-white min-w-0">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${d.connection_status === 'connected' ? 'bg-moss-deep dark:bg-white' : 'border border-ink/40 dark:border-white/60'}`} />
            <span className="font-medium truncate min-w-0">{d.device_name}</span>
            <span className="text-xs text-ink/60 dark:text-white/60">{d.device_type} · {timeAgo(d.last_seen)}</span>
            <span className="ml-auto flex gap-1">
              <button title="Rename" onClick={async () => { const n = prompt('Device name', d.device_name); if (n) { await api.renameDevice(d.id, n); load(); } }}><Pencil size={13} /></button>
              <button title="Disconnect" onClick={async () => { await api.disconnectDevice(d.id); onToast('Device disconnected'); load(); }}><Unplug size={13} /></button>
            </span>
          </div>
        ))}
        {!devices.length && <p className="text-xs text-ink/60 dark:text-white/60">No devices yet.</p>}
      </div>
    </div>
  );
}
