export type Msg = { role: 'user' | 'assistant'; content: string };
export type Conv = { id: string; title: string; messages: Msg[]; updatedAt: number };
const j = (m: string, b?: unknown): RequestInit => ({ method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined });
export const api = {
  config: () => fetch('/api/config').then(r => r.json() as Promise<{ model: string }>),
  list: () => fetch('/api/conversations').then(r => r.json() as Promise<Conv[]>),
  create: () => fetch('/api/conversations', j('POST')).then(r => r.json() as Promise<Conv>),
  rename: (id: string, title: string) => fetch(`/api/conversations/${id}`, j('PATCH', { title })),
  remove: (id: string) => fetch(`/api/conversations/${id}`, j('DELETE')),
};
export async function streamChat(body: object, onDelta: (t: string) => void, signal: AbortSignal) {
  const res = await fetch('/api/chat', { ...j('POST', body), signal });
  if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).error || 'Request failed');
  const rd = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
  for (;;) {
    const { done, value } = await rd.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    const parts = buf.split('\n\n'); buf = parts.pop()!;
    for (const p of parts) { const ev = JSON.parse(p.slice(6)); if (ev.error) throw new Error(ev.error); if (ev.delta) onDelta(ev.delta); }
  }
}
