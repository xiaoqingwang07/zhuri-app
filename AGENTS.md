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

- **AI backend + auth token.** The web app (`lib/ai.ts`) and mobile app call the Worker with an
  `x-app-token` header that must match `APP_TOKEN` in `worker/wrangler.toml` (currently committed as
  `zhuri_app_token_2026_v1_m3x9k2`). Calling the Worker **without** that header returns
  `{"error":"Unauthorized","code":"bad_token"}` (HTTP 401) — this is expected, not a broken key.
  The live production Worker (`WORKER_URL` in `lib/ai.ts`) is deployed with a valid `API_KEY`, so
  the web UI's "AI 目标拆解" flow works out of the box.
- **AI generation is intermittently flaky (pre-existing bug).** MiniMax-M3 sometimes wraps its JSON
  in `<think>`/markdown fences that the Worker's `extractJSON()` can't parse, yielding
  `POST / 500` `{"error":"Failed to parse AI response"}` and the UI's "AI 生成失败了" screen.
  Retrying usually succeeds. This is a Worker code issue, not an env/key problem.
- **Running the Worker locally with AI.** The AI endpoints need `API_KEY` (a MiniMax "Token Plan"
  key, `sk-cp-` prefix); without it `POST /` returns `{"error":"API Key not configured"}` (500).
  If `API_KEY` is available as a Cursor Secret / env var, wire it into a **gitignored**
  `worker/.dev.vars` before `wrangler dev`: `printf 'API_KEY=%s\n' "$API_KEY" > worker/.dev.vars`.
  For deploy use `npx wrangler secret put API_KEY`. Endpoints are rate-limited per `x-device-id`
  (free tier ~10/day), so vary the id when probing.
- **No UI fallback when AI fails.** When AI fails, the `isFallback` render path shows the error
  screen and does **not** surface default tasks. To exercise the core loop (dashboard + 打卡)
  without AI, seed a goal directly into `localStorage.zhuri_goals` (shape = `Goal[]` from
  `lib/types.ts`) and reload, or set a personal key in `localStorage.zhuri_custom_api_key`.
- **Onboarding gate:** the web app shows an onboarding flow until `localStorage.zhuri_onboarding`
  is set (and a cloud banner until `localStorage.zhuri_cloud_banner_seen`).
- Worker deploy is `npx wrangler deploy` from `worker/`; it needs Cloudflare auth + the KV
  namespace in `worker/wrangler.toml` — not needed for local dev.
