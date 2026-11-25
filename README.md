# Nova — AI chat (React + Vite + Express + OpenAI streaming)

## Where the API key goes
1. Create a NEW key at platform.openai.com/api-keys (revoke any key you've pasted anywhere).
2. `cp backend/env.example backend/.env` and put it in `LLM_API_KEY=`. Only the backend reads it. Never commit it.

## Run (dev) — needs Node 20.6+
    cd backend && npm install && npm run dev      # API on :8787
    cd frontend && npm install && npm run dev     # UI on :5173 (proxies /api)

## Deploy
    cd frontend && npm install && npm run build
    cd ../backend && npm install && npm start     # serves API + frontend/dist on one port
Host on Render/Railway/Fly with the env vars from .env.example and a persistent disk
(or replace data/db.json with Postgres/SQLite).

## Intro video layer (optional)
Put an ~8s warp/space clip at `frontend/public/intro.mp4` (muted, H.264). It is auto-detected and blended behind the canvas.
