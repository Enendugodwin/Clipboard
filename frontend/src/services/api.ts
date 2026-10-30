// Same-origin by default (Vite dev proxy / Worker-served dist).
// Split deploy (Pages + Worker): build with VITE_API_URL=https://<worker> set.
const base = (import.meta.env.VITE_API_URL as string | undefined) ?? '';
async function req(path: string, init?: RequestInit, password?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(init?.headers as any) };
  const pw = password ?? sessionStorage.getItem('clip-pw') ?? '';
  if (pw) headers['x-room-password'] = pw;
  const res = await fetch(base + path, { ...init, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), { status: res.status, data });
  return data;
}
export const api = {
  health: () => req('/api/health'),
  createRoom: (body: any) => req('/api/rooms', { method: 'POST', body: JSON.stringify(body) }),
  getRoom: (code: string, password?: string) => req(`/api/rooms/${code}${password ? `?password=${encodeURIComponent(password)}` : ''}`, undefined, password),
  updateRoom: (code: string, body: any) => req(`/api/rooms/${code}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteRoom: (code: string) => req(`/api/rooms/${code}`, { method: 'DELETE' }),
  getClipboard: (code: string) => req(`/api/rooms/${code}/clipboard`),
  putClipboard: (code: string, body: any) => req(`/api/rooms/${code}/clipboard`, { method: 'PUT', body: JSON.stringify(body) }),
  clearClipboard: (code: string) => req(`/api/rooms/${code}/clipboard`, { method: 'DELETE' }),
  history: (code: string, q = '', page = 1) => req(`/api/rooms/${code}/history?q=${encodeURIComponent(q)}&page=${page}`),
  pinEntry: (id: string, pinned: boolean) => req(`/api/history/${id}`, { method: 'PATCH', body: JSON.stringify({ pinned }) }),
  deleteEntry: (id: string) => req(`/api/history/${id}`, { method: 'DELETE' }),
  devices: (code: string) => req(`/api/rooms/${code}/devices`),
  registerDevice: (code: string, body: any) => req(`/api/rooms/${code}/devices`, { method: 'POST', body: JSON.stringify(body) }),
  renameDevice: (id: string, name: string) => req(`/api/devices/${id}`, { method: 'PATCH', body: JSON.stringify({ device_name: name }) }),
  disconnectDevice: (id: string) => req(`/api/devices/${id}`, { method: 'DELETE' }),
  files: (code: string) => req(`/api/rooms/${code}/files`),
  uploadFile: (code: string, body: any) => req(`/api/rooms/${code}/files`, { method: 'POST', body: JSON.stringify(body) }),
  deleteFile: (id: string) => req(`/api/files/${id}`, { method: 'DELETE' }),
};
