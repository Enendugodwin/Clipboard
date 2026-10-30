import { detectContentType, formatJSON, validateJSON, guessLanguage } from '../utils/content';
import { copyText } from '../utils/clipboard';

export function ContentView({ text, onToast }: { text: string; onToast: (m: string, k?: any) => void }) {
  const type = detectContentType(text);
  if (!text) return <p className="text-sm text-ink/60 dark:text-white/60">Nothing here yet — paste something to sync it.</p>;
  if (type === 'url') return <a href={text.trim()} target="_blank" rel="noreferrer" className="text-ink dark:text-white underline decoration-moss/60 underline-offset-2 font-medium break-all">{text}</a>;
  if (type === 'email') return <a href={`mailto:${text.trim()}`} className="text-ink dark:text-white underline decoration-moss/60 underline-offset-2 font-medium">{text}</a>;
  if (type === 'image') return <img src={text.trim()} alt="Shared clipboard" className="max-h-64 rounded-lg border border-ink/15 dark:border-white" loading="lazy" />;
  if (type === 'json') {
    const err = validateJSON(text.trim());
    return (
      <div>
        {err ? <p className="text-xs mb-1 font-medium">Invalid JSON: {err}</p> : <p className="text-xs mb-1 font-medium text-moss-deep dark:text-white">Valid JSON ✓</p>}
        <pre className="text-xs border border-ink/15 dark:border-white rounded-lg p-3 overflow-auto max-h-64 bg-paper dark:bg-black text-ink dark:text-white"><code>{err ? text : formatJSON(text.trim())}</code></pre>
        {!err && <button className="text-xs underline mt-1" onClick={async () => { await copyText(formatJSON(text.trim())); onToast('Formatted JSON copied', 'success'); }}>Copy formatted JSON</button>}
      </div>
    );
  }
  if (type === 'code') return <pre className="text-xs border border-ink/15 dark:border-white rounded-lg p-3 overflow-auto max-h-64 bg-paper dark:bg-black text-ink dark:text-white"><code data-lang={guessLanguage(text)}>{text}</code></pre>;
  return <p className="whitespace-pre-wrap break-words text-sm text-ink dark:text-white">{text}</p>;
}
