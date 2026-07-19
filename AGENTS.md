# AGENTS.md

## Cursor Cloud specific instructions

This repo (**逐日 / Zhuri**, an AI goal-coaching product) is a monorepo with three
independently-runnable components. The update script already runs `npm install` at the
repo root and in `mobile/`, so dependencies are present on startup.

### Components & how to run them

| Component | Path | Dev command | Notes |
|-----------|------|-------------|-------|
| Web app (Next.js 16) | repo root (`app/`, `components/`, `lib/`) | `npm run dev` (port 3000) | The "early web version". Fully runnable/testable in Chrome. Build+lint scripts in root `package.json`. |
| Mobile app (Expo SDK 54) | `mobile/` | `npx expo start` | The primary current product (iOS). No iOS simulator on Linux — use `npx expo start --web` to preview in a browser. Prefix with `CI=1` to disable the interactive watcher. Scripts (`lint`, `typecheck`) in `mobile/package.json`. |
| AI proxy (Cloudflare Worker) | `worker/` | `npx wrangler dev` (port 8787) | No `package.json`; run via `npx wrangler`. `wrangler dev` auto-simulates the KV binding locally. |

### Lint / typecheck (all pre-existing, not env issues)

- Root `npm run lint` runs `eslint-config-next` over the **entire repo** (including `mobile/`
  and `worker/`) and currently reports ~52 pre-existing errors (mostly `no-explicit-any`).
  This is existing code state, not a setup problem.
- `mobile/` has its own clean tooling: `npm run lint` (`expo lint`) and `npm run typecheck`
  (`tsc --noEmit`) both pass.

### Non-obvious gotchas

- **AI requires a MiniMax key.** The Worker's AI endpoints need the `API_KEY` secret (a
  MiniMax "Token Plan" key, `sk-cp-` prefix). Without it, `POST /` returns
  `{"error":"API Key not configured"}` (HTTP 500). Set it with `npx wrangler secret put API_KEY`
  (deploy) or a local `worker/.dev.vars` file (`API_KEY=...`) for `wrangler dev`.
- **Web app calls the hardcoded production Worker** (`WORKER_URL` in `lib/ai.ts`), whose key is
  currently unauthorized (returns 401). So the goal-creation UI shows the "AI 生成失败了"
  error screen and does **not** auto-fall-back to default tasks in the UI. To exercise the core
  loop without AI, either provide a MiniMax key via `localStorage.zhuri_custom_api_key`, or seed
  a goal directly into `localStorage` under key `zhuri_goals` (shape = `Goal[]` from
  `lib/types.ts`) and reload.
- **Onboarding gate:** the web app shows an onboarding flow until `localStorage.zhuri_onboarding`
  is set (and a cloud banner until `localStorage.zhuri_cloud_banner_seen`).
- Worker deploy is `npx wrangler deploy` from `worker/`; it needs Cloudflare auth + the KV
  namespace in `worker/wrangler.toml` — not needed for local dev.
