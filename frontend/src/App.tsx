import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import { api, streamChat, type Conv, type Msg } from './api';
const Intro = lazy(() => import('./Intro'));

const PROMPTS = ['Explain a difficult concept', 'Help me debug code', 'Analyze an idea', 'Write something creative'];
const SEED: Record<string, string> = { 'Explain a difficult concept': 'Explain a difficult concept to me simply. Ask which one I want first.', 'Help me debug code': 'Help me debug some code. Ask me to paste it and describe the problem.', 'Analyze an idea': 'Help me analyze an idea critically. Ask me to describe it.', 'Write something creative': 'Write a short, original piece of creative writing of your choice.' };

export default function App() {
  const [entered, setEntered] = useState(false);
  return (<>
    <AnimatePresence>{!entered && <Suspense fallback={<div className="fixed inset-0 bg-[#060607]" />}><Intro key="i" onEnter={() => setEntered(true)} /></Suspense>}</AnimatePresence>
    {entered && <Workspace />}
  </>);
}

function Workspace() {
  const reduce = useReducedMotion();
  const desktop = innerWidth >= 768;
  const [convs, setConvs] = useState<Conv[]>([]);
  const [activeId, setActive] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [model, setModel] = useState('');
  const [side, setSide] = useState(desktop);
  const [q, setQ] = useState(''); const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const abort = useRef<AbortController | null>(null); const end = useRef<HTMLDivElement>(null); const stick = useRef(true);

  const refresh = () => api.list().then(setConvs);
  useEffect(() => { refresh(); api.config().then(c => setModel(c.model)); }, []);
  useEffect(() => { if (stick.current) end.current?.scrollIntoView({ behavior: busy ? 'auto' : 'smooth' }); }, [msgs, busy]);

  const closeOnMobile = () => { if (!desktop) setSide(false); };
  const open = (c: Conv) => { setActive(c.id); setMsgs(c.messages); setErr(''); closeOnMobile(); };
  const newChat = () => { setActive(null); setMsgs([]); setErr(''); closeOnMobile(); };

  async function run(id: string, body: object, base: Msg[]) {
    setBusy(true); setErr(''); stick.current = true;
    const ac = new AbortController(); abort.current = ac;
    setMsgs([...base, { role: 'assistant', content: '' }]);
    try { await streamChat({ conversationId: id, ...body }, t => setMsgs(m => { const c = [...m]; c[c.length - 1] = { role: 'assistant', content: c[c.length - 1].content + t }; return c; }), ac.signal); }
    catch (e: any) { if (e.name !== 'AbortError') setErr(e.message); }
    setBusy(false); refresh();
  }
  async function send(text: string) {
    text = text.trim(); if (!text || busy) return; setInput('');
    let id = activeId; if (!id) { id = (await api.create()).id; setActive(id); }
    await run(id, { message: text }, [...msgs, { role: 'user', content: text }]);
  }
  const regen = () => activeId && run(activeId, { regenerate: true }, msgs.slice(0, msgs[msgs.length - 1]?.role === 'assistant' ? -1 : undefined));
  const ease = [0.23, 1, 0.32, 1] as const;

  return (
    <motion.div className="flex h-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: .3 }}>
      {side && <div className="fixed inset-0 z-20 bg-black/60 md:hidden" onClick={() => setSide(false)} />}
      <motion.aside className="fixed md:static z-30 h-full w-72 shrink-0 flex flex-col border-r border-white/10 bg-[#101012] p-3"
        initial={false} animate={{ transform: side ? 'translateX(0%)' : 'translateX(-100%)', marginLeft: desktop && !side ? -288 : 0 }}
        transition={{ duration: reduce ? .15 : .3, ease: [0.32, 0.72, 0, 1] }}>
        <div className="flex items-center justify-between px-1 pb-3"><span className="font-display text-2xl">Nova</span>
          <button className="press text-neutral-400 hover:text-white px-2" onClick={() => setSide(false)} aria-label="Collapse sidebar">«</button></div>
        <button onClick={newChat} className="press rounded-lg border border-white/10 py-2 text-sm hover:bg-white/5">+ New chat</button>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search conversations" className="mt-3 rounded-lg bg-white/5 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[#d9b779]/60" />
        <div className="mt-3 flex-1 overflow-y-auto space-y-1">
          {convs.filter(c => c.title.toLowerCase().includes(q.toLowerCase())).map(c => (
            <div key={c.id} className={`flex items-center rounded-lg px-2 py-2 text-sm cursor-pointer ${c.id === activeId ? 'bg-white/10' : 'hover:bg-white/5'}`} onClick={() => open(c)}>
              <span className="flex-1 truncate">{c.title}</span>
              <button className="px-1 text-neutral-500 hover:text-white" aria-label="Rename" onClick={async e => { e.stopPropagation(); const t = prompt('Rename conversation', c.title); if (t?.trim()) { await api.rename(c.id, t); refresh(); } }}>✎</button>
              <button className="px-1 text-neutral-500 hover:text-red-400" aria-label="Delete" onClick={async e => { e.stopPropagation(); if (confirm('Delete this conversation?')) { await api.remove(c.id); if (c.id === activeId) newChat(); refresh(); } }}>✕</button>
            </div>))}
        </div>
        <div className="border-t border-white/10 pt-3 text-xs text-neutral-500">Model <span className="text-neutral-300 font-mono">{model}</span><br />Settings (model, system prompt, limits) live in backend/.env</div>
      </motion.aside>

      <main className="relative flex-1 min-w-0 flex flex-col">
        <header className="flex items-center gap-3 p-3 h-14">{!side && <button className="press rounded-lg border border-white/10 px-3 py-1 text-sm" onClick={() => setSide(true)} aria-label="Open sidebar">☰</button>}</header>
        <div className="flex-1 overflow-y-auto px-4" onScroll={e => { const t = e.currentTarget; stick.current = t.scrollHeight - t.scrollTop - t.clientHeight < 120; }}>
          {msgs.length === 0 ? (
            <div className="mx-auto max-w-2xl pt-[8vh] text-center">
              <h2 className="font-display text-5xl sm:text-6xl">What shall we think through?</h2>
              <p className="mt-3 text-neutral-400">Ask anything. Responses stream live from your configured model.</p>
              <div className="mt-8 grid sm:grid-cols-2 gap-3">
                {PROMPTS.map((p, i) => (<motion.button key={p} onClick={() => send(SEED[p])} className="press text-left rounded-xl border border-white/10 bg-white/[.03] p-4 hover:bg-white/[.07]"
                  initial={{ opacity: 0, transform: 'translateY(8px)' }} animate={{ opacity: 1, transform: 'translateY(0px)' }} transition={{ delay: reduce ? 0 : .06 * i, duration: .3, ease }}>{p}</motion.button>))}
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-6 pb-6">
              {msgs.map((m, i) => (
                <motion.div key={i} initial={{ opacity: 0, transform: 'translateY(6px)' }} animate={{ opacity: 1, transform: 'translateY(0px)' }} transition={{ duration: .2, ease }} className={m.role === 'user' ? 'flex justify-end' : ''}>
                  {m.role === 'user' ? <div className="max-w-[85%] rounded-2xl bg-[#d9b779]/15 px-4 py-2.5 whitespace-pre-wrap break-words">{m.content}</div> : (
                    <div className="min-w-0"><div className="prose-nova break-words">
                      {m.content ? <ReactMarkdown rehypePlugins={[rehypeHighlight]}>{m.content}</ReactMarkdown> : <span className="text-neutral-500"><span className="dot">●</span> <span className="dot" style={{ animationDelay: '.2s' }}>●</span> <span className="dot" style={{ animationDelay: '.4s' }}>●</span></span>}
                    </div>
                      {m.content && !(busy && i === msgs.length - 1) && <div className="mt-1 flex gap-3 text-xs text-neutral-500">
                        <button className="hover:text-white" onClick={() => navigator.clipboard.writeText(m.content)}>Copy</button>
                        {i === msgs.length - 1 && <button className="hover:text-white" onClick={regen}>Regenerate</button>}</div>}
                    </div>)}
                </motion.div>))}
              {err && <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{err}</div>}
              <div ref={end} />
            </div>)}
        </div>
        <div className="mx-auto w-full max-w-3xl p-3" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
          <div className="flex items-end gap-2 rounded-2xl border border-white/10 bg-[#141416] p-2 transition-colors focus-within:border-[#d9b779]/50">
            <textarea value={input} rows={1} placeholder="Message Nova…" onChange={e => { setInput(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px'; }}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }} className="flex-1 resize-none bg-transparent px-2 py-2 outline-none text-base" />
            {busy ? <button onClick={() => abort.current?.abort()} className="press rounded-xl bg-white/10 px-4 py-2 text-sm">Stop</button>
              : <button onClick={() => send(input)} disabled={!input.trim()} className="press rounded-xl bg-[#d9b779] px-4 py-2 text-sm font-medium text-black disabled:opacity-30">Send</button>}
          </div>
        </div>
      </main>
    </motion.div>);
}
