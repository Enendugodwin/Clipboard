export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); ta.remove();
      return true;
    } catch { return false; }
  }
}
export function timeAgo(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
export function expiryLabel(ts: number): string {
  const ms = ts - Date.now();
  if (ms <= 0) return 'expired';
  const m = Math.floor(ms / 60000);
  if (m < 60) return `expires in ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `expires in ${h}h`;
  return `expires in ${Math.floor(h / 24)}d`;
}
export function getDeviceInfo() {
  const ua = navigator.userAgent;
  let device_type = 'desktop';
  if (/Mobi|Android|iPhone/i.test(ua)) device_type = 'mobile';
  else if (/Tablet|iPad/i.test(ua)) device_type = 'tablet';
  return { device_type, browser: ua.slice(0, 80) };
}
