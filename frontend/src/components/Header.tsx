import { Link, useNavigate } from 'react-router-dom';
import { Clipboard, Wifi, WifiOff, Loader2, CheckCheck, RefreshCw, CloudOff } from 'lucide-react';
import type { ConnectionState } from '../types';

const stateStyle: Record<ConnectionState, { icon: any; cls: string }> = {
  Connected: { icon: Wifi, cls: '' },
  Synced: { icon: CheckCheck, cls: '' },
  Syncing: { icon: RefreshCw, cls: '' },
  Reconnecting: { icon: Loader2, cls: '' },
  Disconnected: { icon: WifiOff, cls: '' },
  Offline: { icon: CloudOff, cls: '' },
};

export function Header({ conn, onTheme, theme }: { conn: ConnectionState; onTheme: () => void; theme: string }) {
  const nav = useNavigate();
  const Icon = stateStyle[conn]?.icon ?? Wifi;
  return (
    <header className="border-b border-ink/15 dark:border-white bg-parchment/90 dark:bg-black sticky top-0 z-40">
      <div className="max-w-5xl mx-auto px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Link to="/" className="flex items-center gap-2 font-bold text-base sm:text-lg text-ink dark:text-white">
          <span className="bg-ink dark:bg-white text-parchment dark:text-black rounded-md p-1.5"><Clipboard size={18} /></span>
          CLIPBOARD
        </Link>
        <div className="ml-auto flex items-center gap-3">
          <span className={`flex items-center gap-1.5 text-xs font-medium text-ink/70 dark:text-white ${stateStyle[conn]?.cls}`} title={`Connection: ${conn}`}>
            <Icon size={14} /> <span className="hidden sm:inline">{conn}</span>
          </span>
          <button onClick={onTheme} className="text-xs border border-ink/30 dark:border-white rounded-md px-2 py-1 text-ink dark:text-white" title="Cycle theme">{theme}</button>
        </div>
        <nav className="flex gap-3 text-sm text-ink/80 dark:text-white order-3 basis-full sm:order-none sm:basis-auto">
          <Link to="/" className="hover:underline">Home</Link>
          <button className="hover:underline" onClick={() => nav('/?view=rooms')}>My Rooms</button>
          <Link to="/history" className="hover:underline">History</Link>
          <Link to="/settings" className="hover:underline">Settings</Link>
        </nav>
      </div>
    </header>
  );
}
