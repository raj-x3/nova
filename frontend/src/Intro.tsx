import { useEffect, useRef, useState } from 'react';
import { motion, useMotionValue, useSpring, useReducedMotion } from 'motion/react';

/**
 * Space-travel intro. One canvas, one rAF loop, no per-frame React renders.
 * Timeline: drift (0–1.8s) → acceleration (1.8–4.8) → lightspeed cruise (4.8–6.4)
 *           → drop-out + planet approach (6.4–7.6) → brand reveal (7.4+) → click = final jump.
 * Optional video layer: drop frontend/public/intro.mp4 and it plays behind the stars.
 */
type Star = { x: number; y: number; z: number };
const DEPTH = 1000, SPREAD = 1100, TITLE = 'NOVA';
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const spawn = (s: Star, far = true) => { s.x = (Math.random() * 2 - 1) * SPREAD; s.y = (Math.random() * 2 - 1) * SPREAD; s.z = far ? DEPTH : 1 + Math.random() * DEPTH; };

export default function Intro({ onEnter }: { onEnter: () => void }) {
  const cvRef = useRef<HTMLCanvasElement>(null);
  const hud = useRef<HTMLDivElement>(null);
  const jumpAt = useRef(0);
  const reduce = useReducedMotion();
  const [ready, setReady] = useState(false);
  const [go, setGo] = useState(false);
  const [video, setVideo] = useState(false);
  const low = !!reduce || navigator.hardwareConcurrency <= 4 || innerWidth < 640;

  // optional video layer (only if the file really exists and is a video)
  useEffect(() => {
    if (low) return;
    fetch('/intro.mp4', { method: 'HEAD' }).then(r => { if (r.ok && (r.headers.get('content-type') || '').startsWith('video')) setVideo(true); }).catch(() => {});
  }, [low]);

  useEffect(() => {
    const cv = cvRef.current!, ctx = cv.getContext('2d')!;
    const dpr = Math.min(devicePixelRatio, 2);
    const stars: Star[] = Array.from({ length: low ? 600 : 1800 }, () => { const s = { x: 0, y: 0, z: 0 }; spawn(s, false); return s; });
    let w = 0, h = 0, raf = 0, mx = 0, my = 0, last = performance.now(), shownReady = false;
    const t0 = last;
    const resize = () => { w = innerWidth; h = innerHeight; cv.width = w * dpr; cv.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    resize(); addEventListener('resize', resize);
    const move = (e: PointerEvent) => { mx = e.clientX / w - .5; my = e.clientY / h - .5; };
    addEventListener('pointermove', move);

    const draw = (t: number, dt: number, now: number) => {
      // ---- timeline ----
      let speed = .5, planetT = 0, flash = 0, zoom = 1;
      if (t >= 1.8 && t < 4.8) speed = lerp(.5, 30, smooth((t - 1.8) / 3));
      else if (t >= 4.8 && t < 6.4) speed = 30;
      else if (t >= 6.4) speed = lerp(30, .4, 1 - Math.pow(1 - clamp((t - 6.4) / 1.2), 3));
      planetT = smooth(clamp((t - 6.2) / 2.4));
      flash = .35 * Math.exp(-Math.pow((t - 4.8) / .15, 2)) + .7 * Math.exp(-Math.pow((t - 6.4) / .2, 2));
      if (jumpAt.current) { // final jump into the app
        const j = clamp((now - jumpAt.current) / 1100);
        speed = lerp(.4, 90, smooth(j)); zoom = 1 + j * 7; flash = Math.max(flash, smooth(clamp((j - .55) / .45)));
        if (j >= 1) { jumpAt.current = 0; cancelAnimationFrame(raf); onEnter(); return; }
      }
      if (!shownReady && t > 7.4) { shownReady = true; setReady(true); }

      const cx = w / 2 + mx * 60, cy = h / 2 + my * 40, focal = Math.max(w, h) * .55, v = speed * dt * 60;
      const warp = clamp(speed / 30);
      ctx.clearRect(0, 0, w, h);

      // nebula (cheap, 2 gradients) – dims as we enter lightspeed
      const nb = (x: number, y: number, r: number, c: string) => { const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, c); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); };
      nb(w * .25, h * .3, Math.max(w, h) * .7, `rgba(40,70,130,${.16 * (1 - warp * .5) * clamp(t / 1.5)})`);
      nb(w * .8, h * .75, Math.max(w, h) * .6, `rgba(120,80,50,${.07 * clamp(t / 1.5)})`);

      // planet (back ring half, body, front ring half)
      if (planetT > 0) {
        const R = lerp(6, Math.min(w, h) * .2, planetT) * zoom, px = cx, py = h * .44 + my * 20;
        const atm = ctx.createRadialGradient(px, py, R * .9, px, py, R * 1.9); atm.addColorStop(0, `rgba(110,170,255,${.28 * planetT})`); atm.addColorStop(1, 'rgba(110,170,255,0)');
        ctx.fillStyle = atm; ctx.fillRect(0, 0, w, h);
        const ring = (a0: number, a1: number) => { ctx.strokeStyle = `rgba(200,215,235,${.55 * planetT})`; ctx.lineWidth = Math.max(1, R * .05); ctx.beginPath(); ctx.ellipse(px, py, R * 1.9, R * .42, -.35, a0, a1); ctx.stroke(); };
        ring(Math.PI, Math.PI * 2);
        const g = ctx.createRadialGradient(px - R * .4, py - R * .4, R * .08, px, py, R);
        g.addColorStop(0, '#f1f4f9'); g.addColorStop(.35, '#9aa6b8'); g.addColorStop(.75, '#1d2432'); g.addColorStop(1, '#05070b');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, R, 0, 7); ctx.fill();
        ctx.strokeStyle = `rgba(120,180,255,${.6 * planetT})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(px, py, R, Math.PI * 1.05, Math.PI * 1.7); ctx.stroke(); // rim light
        ring(0, Math.PI);
      }

      // stars / streaks
      const r = Math.round(lerp(255, 140, warp)), gch = Math.round(lerp(244, 190, warp)), b = Math.round(lerp(230, 255, warp));
      ctx.lineCap = 'round';
      for (const s of stars) {
        s.z -= v;
        let sx = cx + s.x / s.z * focal, sy = cy + s.y / s.z * focal;
        if (s.z <= 1 || sx < -80 || sx > w + 80 || sy < -80 || sy > h + 80) { spawn(s); sx = cx + s.x / s.z * focal; sy = cy + s.y / s.z * focal; }
        const near = 1 - s.z / DEPTH, zp = s.z + v * 2.4;
        ctx.strokeStyle = `rgba(${r},${gch},${b},${clamp(.15 + near * .95) * clamp(t / .8)})`;
        ctx.lineWidth = lerp(.5, 2.2, near);
        ctx.beginPath(); ctx.moveTo(cx + s.x / zp * focal, cy + s.y / zp * focal); ctx.lineTo(sx + .01, sy); ctx.stroke();
      }

      // tunnel vignette + core glow at lightspeed, flash on jump points
      if (warp > .05) {
        const vg = ctx.createRadialGradient(cx, cy, Math.min(w, h) * .1, cx, cy, Math.max(w, h) * .75);
        vg.addColorStop(0, `rgba(170,205,255,${.22 * warp})`); vg.addColorStop(.35, 'rgba(0,0,0,0)'); vg.addColorStop(1, `rgba(2,6,20,${.55 * warp})`);
        ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);
      }
      if (flash > .01) { ctx.fillStyle = `rgba(235,244,255,${clamp(flash)})`; ctx.fillRect(0, 0, w, h); }
      if (hud.current) hud.current.textContent = `VELOCITY ${(warp * .99).toFixed(2)}c`;
    };

    if (reduce) { draw(8, 0, performance.now()); setReady(true); }
    else {
      const loop = (now: number) => { const dt = Math.min((now - last) / 1000, .05); last = now; draw((now - t0) / 1000, dt, now); raf = requestAnimationFrame(loop); };
      raf = requestAnimationFrame(loop);
    }
    return () => { cancelAnimationFrame(raf); removeEventListener('resize', resize); removeEventListener('pointermove', move); };
  }, [low, reduce, onEnter]);

  // magnetic button
  const mxv = useMotionValue(0), myv = useMotionValue(0);
  const sx = useSpring(mxv, { stiffness: 220, damping: 18 }), sy = useSpring(myv, { stiffness: 220, damping: 18 });
  const ease = [0.23, 1, 0.32, 1] as const;
  const start = () => { if (reduce) return onEnter(); setGo(true); jumpAt.current = performance.now(); };

  return (
    <motion.div className="fixed inset-0 overflow-hidden bg-black" exit={{ opacity: 0 }} transition={{ duration: .25 }}>
      {video && <video src="/intro.mp4" autoPlay muted playsInline loop className="absolute inset-0 h-full w-full object-cover opacity-50 mix-blend-screen" />}
      <canvas ref={cvRef} className="absolute inset-0 h-full w-full" />
      <div ref={hud} className="absolute left-5 top-5 font-mono text-[11px] tracking-[.25em] text-sky-200/60" style={{ paddingTop: 'env(safe-area-inset-top)' }} />
      <button onClick={onEnter} className="press absolute right-5 top-5 rounded-full border border-white/15 px-4 py-1.5 font-mono text-[11px] tracking-[.2em] text-neutral-300 hover:bg-white/10" style={{ marginTop: 'env(safe-area-inset-top)' }}>SKIP INTRO</button>

      <motion.div className="absolute inset-x-0 bottom-[10%] flex flex-col items-center px-6 text-center" animate={{ opacity: go ? 0 : 1 }} transition={{ duration: .3 }}>
        <h1 className="font-display text-7xl sm:text-9xl tracking-[.18em] pl-[.18em]" aria-label="Nova">
          {TITLE.split('').map((c, i) => (
            <motion.span key={i} className="inline-block" initial={{ opacity: 0, filter: 'blur(14px)', transform: 'translateY(28px) scale(1.2)' }}
              animate={ready ? { opacity: 1, filter: 'blur(0px)', transform: 'translateY(0px) scale(1)' } : {}} transition={{ duration: reduce ? .2 : .9, delay: reduce ? 0 : i * .1, ease }}>{c}</motion.span>))}
        </h1>
        <motion.p className="mt-3 text-sm tracking-[.3em] text-sky-100/60" initial={{ opacity: 0 }} animate={{ opacity: ready ? 1 : 0 }} transition={{ delay: reduce ? 0 : .6, duration: .8 }}>INTELLIGENCE, AT LIGHTSPEED</motion.p>
        <motion.button onClick={start} disabled={!ready} className="press group relative mt-9 overflow-hidden rounded-full border border-sky-200/40 px-9 py-3.5 text-xs tracking-[.3em] text-white hover:border-sky-200/80 hover:bg-sky-200/10"
          style={{ x: sx, y: sy }} initial={{ opacity: 0, transform: 'translateY(10px)' }} animate={{ opacity: ready ? 1 : 0, transform: ready ? 'translateY(0px)' : 'translateY(10px)' }} transition={{ delay: reduce ? 0 : 1.1, duration: .6, ease }}
          onPointerMove={e => { const r = e.currentTarget.getBoundingClientRect(); mxv.set((e.clientX - r.left - r.width / 2) * .25); myv.set((e.clientY - r.top - r.height / 2) * .35); }}
          onPointerLeave={() => { mxv.set(0); myv.set(0); }}>
          INITIALIZE EXPERIENCE
        </motion.button>
      </motion.div>
    </motion.div>
  );
}
