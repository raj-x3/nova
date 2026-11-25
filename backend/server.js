import express from 'express';
import rateLimit from 'express-rate-limit';
import OpenAI from 'openai';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const cfg = {
  key: process.env.LLM_API_KEY, base: process.env.LLM_BASE_URL || undefined,
  model: process.env.LLM_MODEL || 'gpt-4o-mini',
  system: process.env.SYSTEM_PROMPT || 'You are a helpful assistant.',
  maxHistory: +process.env.MAX_HISTORY_MESSAGES || 30,
  maxTokens: +process.env.MAX_OUTPUT_TOKENS || 1500, port: +process.env.PORT || 8787,
};
if (!cfg.key) { console.error('Missing LLM_API_KEY in backend/.env'); process.exit(1); }
const client = new OpenAI({ apiKey: cfg.key, baseURL: cfg.base });

// --- storage (JSON file; swap for a DB in production) ---
const FILE = path.join(import.meta.dirname, 'data', 'db.json');
let db = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : {};
const save = () => fs.writeFileSync(FILE, JSON.stringify(db));

const app = express();
app.use(express.json({ limit: '100kb' }));
app.use('/api', rateLimit({ windowMs: 60_000, limit: 40, standardHeaders: true }));

app.get('/api/config', (_q, r) => r.json({ model: cfg.model }));
app.get('/api/conversations', (_q, r) =>
  r.json(Object.values(db).sort((a, b) => b.updatedAt - a.updatedAt)));
app.post('/api/conversations', (_q, r) => {
  const id = crypto.randomUUID();
  db[id] = { id, title: 'New chat', messages: [], updatedAt: Date.now() }; save(); r.status(201).json(db[id]);
});
app.patch('/api/conversations/:id', (q, r) => {
  const c = db[q.params.id]; const t = q.body?.title;
  if (!c) return r.sendStatus(404);
  if (typeof t !== 'string' || !t.trim() || t.length > 80) return r.status(400).json({ error: 'Invalid title' });
  c.title = t.trim(); save(); r.json(c);
});
app.delete('/api/conversations/:id', (q, r) => {
  if (!db[q.params.id]) return r.sendStatus(404);
  delete db[q.params.id]; save(); r.sendStatus(204);
});

app.post('/api/chat', async (q, r) => {
  const { conversationId, message, regenerate, temperature } = q.body || {};
  const temp = typeof temperature === 'number' && Number.isFinite(temperature)
    ? Math.min(2, Math.max(0, temperature))
    : undefined;
  const c = db[conversationId];
  if (!c) return r.status(404).json({ error: 'Conversation not found' });
  if (regenerate) { while (c.messages.length && c.messages.at(-1).role === 'assistant') c.messages.pop(); }
  else {
    if (typeof message !== 'string' || !message.trim() || message.length > 8000)
      return r.status(400).json({ error: 'Message must be 1–8000 characters' });
    c.messages.push({ role: 'user', content: message.trim() });
    if (c.messages.length === 1) c.title = message.trim().slice(0, 48);
  }
  r.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  r.flushHeaders();
  const send = (o) => r.write(`data: ${JSON.stringify(o)}\n\n`);
  const ctrl = new AbortController();
  r.on('close', () => ctrl.abort());
  let out = '';
  try {
    const stream = await client.chat.completions.create({
      model: cfg.model, stream: true, max_tokens: cfg.maxTokens,
      ...(temp !== undefined ? { temperature: temp } : {}),
      messages: [{ role: 'system', content: cfg.system }, ...c.messages.slice(-cfg.maxHistory)],
    }, { signal: ctrl.signal });
    for await (const part of stream) {
      const t = part.choices[0]?.delta?.content;
      if (t) { out += t; send({ delta: t }); }
    }
    send({ done: true });
  } catch (e) {
    if (!ctrl.signal.aborted) {
      const msg = e.status === 429 ? 'Rate limit or quota reached. Try again shortly.'
        : e.status === 401 ? 'Invalid API key. Check backend/.env.' : 'The model request failed.';
      send({ error: msg });
    }
  } finally {
    if (out) c.messages.push({ role: 'assistant', content: out });
    c.updatedAt = Date.now(); save(); r.end();
  }
});

app.use(express.static(path.join(import.meta.dirname, '../frontend/dist')));
app.listen(cfg.port, () => console.log(`Nova API on :${cfg.port} (${cfg.model})`));
