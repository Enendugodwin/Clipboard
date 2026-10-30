import type { ContentType } from '../types';

export function detectContentType(raw: string): ContentType {
  const text = raw.trim();
  if (!text) return 'text';
  if (/^https?:\/\/\S+$/i.test(text)) return 'url';
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return 'email';
  if (/^data:image\//.test(text) || /^https?:\/\/\S+\.(png|jpe?g|gif|webp|svg)(\?\S*)?$/i.test(text)) return 'image';
  if (/^\s*[\[{]/.test(text)) {
    try { JSON.parse(text); return 'json'; } catch { /* fallthrough */ }
  }
  if (/^(function|const|let|var|import|export|class|def |public |#include|SELECT |\{\s*"|<\/?[a-z][\s\S]*>)/i.test(text) || /[{};]\s*$/.test(text.split('\n')[0] ?? '')) {
    if (text.includes('\n') || text.length > 80) return 'code';
  }
  if (text.length > 500 || text.split('\n').length > 12) return 'longtext';
  return 'text';
}

export function formatJSON(raw: string): string {
  return JSON.stringify(JSON.parse(raw), null, 2);
}
export function minifyJSON(raw: string): string {
  return JSON.stringify(JSON.parse(raw));
}
export function validateJSON(raw: string): string | null {
  try { JSON.parse(raw); return null; } catch (e: any) { return e?.message ?? 'Invalid JSON'; }
}
// Sanitize: strip scripts/event handlers; never execute pasted HTML.
export function sanitizeHTML(raw: string): string {
  return raw.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
}
export function guessLanguage(code: string): string {
  if (/^\s*\{/.test(code) || /":/.test(code)) return 'json';
  if (/<[a-z]+[\s>]/.test(code)) return 'html';
  if (/^\s*(def |import |print\()/.test(code)) return 'python';
  if (/SELECT|INSERT|UPDATE/i.test(code)) return 'sql';
  return 'javascript';
}
