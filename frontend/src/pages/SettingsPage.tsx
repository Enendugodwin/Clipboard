import { useState } from 'react';
import { useToast } from '../components/Toast';

export function SettingsPage() {
  const { push } = useToast();
  const [expiry, setExpiry] = useState(localStorage.getItem('clip-default-expiry') || '24h');
  const [name, setName] = useState(localStorage.getItem('clip-default-name') || '');
  const [privacy, setPrivacy] = useState(localStorage.getItem('clip-default-privacy') || 'public');
  const [retention, setRetention] = useState(localStorage.getItem('clip-retention') || 'room');
  const save = () => {
    localStorage.setItem('clip-default-expiry', expiry);
    localStorage.setItem('clip-default-name', name);
    localStorage.setItem('clip-retention', retention);
    localStorage.setItem('clip-default-privacy', privacy);
    push('Settings saved', 'success');
  };
  return (
    <div className="max-w-2xl mx-auto px-4 py-8 flex flex-col gap-4 text-ink dark:text-white">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <section className="border border-ink/15 dark:border-white rounded-xl p-4 bg-parchment dark:bg-black shadow-soft">
        <h2 className="font-semibold mb-2">General</h2>
        <label className="block text-sm">Default expiration <select value={expiry} onChange={(e) => setExpiry(e.target.value)} className="border border-ink/30 dark:border-white rounded px-2 py-1 ml-2 bg-paper dark:bg-black">{['5m', '15m', '30m', '1h', '6h', '24h'].map((e) => <option key={e}>{e}</option>)}</select></label>
        <label className="block text-sm mt-2">Default room name <input value={name} onChange={(e) => setName(e.target.value)} className="border border-ink/30 dark:border-white rounded px-2 py-1 ml-2 bg-paper dark:bg-black" /></label>
      </section>
      <section className="border border-ink/15 dark:border-white rounded-xl p-4 bg-parchment dark:bg-black shadow-soft">
        <h2 className="font-semibold mb-2">Privacy</h2>
        <label className="block text-sm">Default room privacy <select value={privacy} onChange={(e) => setPrivacy(e.target.value)} className="border border-ink/30 dark:border-white rounded px-2 py-1 ml-2 bg-paper dark:bg-black"><option value="public">Public link</option><option value="private">Private (password)</option></select></label>
        <label className="block text-sm mt-2">History retention <select value={retention} onChange={(e) => setRetention(e.target.value)} className="border border-ink/30 dark:border-white rounded px-2 py-1 ml-2 bg-paper dark:bg-black"><option value="room">With room</option><option value="session">This session only</option></select></label>
      </section>
      <button onClick={save} className="bg-moss-deep dark:bg-white text-[#f7f4ec] dark:text-black rounded-md py-2 border border-moss-deep dark:border-white font-medium">Save settings</button>
    </div>
  );
}

export function AboutPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-8 text-ink dark:text-white">
      <h1 className="text-2xl font-semibold">About CLIPBOARD</h1>
      <p className="mt-2 text-sm text-ink/70 dark:text-white/70">Open → Create → Paste → Scan → Copy. No accounts. Rooms expire automatically; passwords stay hashed; pasted HTML is never executed.</p>
    </div>
  );
}

export function HistoryPage({ onToast }: { onToast: (m: string, k?: any) => void }) {
  void onToast;
  const [code, setCode] = useState('');
  const [active, setActive] = useState('');
  return (
    <div className="max-w-2xl mx-auto px-4 py-8 text-ink dark:text-white">
      <h1 className="text-2xl font-semibold">History</h1>
      <p className="text-sm mt-1 text-ink/60 dark:text-white/60">Enter a room code to browse its history.</p>
      <div className="flex gap-2 mt-3">
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Room code" className="border border-ink/30 dark:border-white rounded-md px-3 py-2 text-sm bg-paper dark:bg-black flex-1 min-w-0" />
        <button onClick={() => setActive(code.trim())} className="border border-ink/30 dark:border-white rounded-md px-4 py-2 text-sm whitespace-nowrap">Open</button>
      </div>
      {active && <p className="text-xs mt-3"><a className="underline" href={`/c/${active}`}>Open room {active} to view and restore history →</a></p>}
    </div>
  );
}
