# CLAUDE.md

Government Template Platform V3.0 — **Node.js edition** (eID based, AI enabled).
Production-ready full-stack template: **Node.js backend** (Express 5 · TypeScript
· node-postgres + PostgreSQL + Redis) + **React** frontend + Gemini AI pipeline.
Docs index is in [README.md](README.md#documentation); deep dives in
`backend/docs/` (EN/MN pairs) and `docs/DEPLOYMENT.md`. The **published docs
site** (MkDocs Material, mn + en) lives in `docs-site/` and ships to GitHub Pages
on every push that touches it: https://gerege-systems.github.io/template-dgov-mn-nodejs/

> This repo is the Node.js/React port of the Go/Next.js original
> ([gerege-systems/template-dgov-mn](https://github.com/gerege-systems/template-dgov-mn)).
> **The port is complete** (25/25 domains) — see [ROADMAP.md](ROADMAP.md). The HTTP
> contract (routes, `BaseResponse` envelope, error semantics, SQL migrations) is
> preserved 1:1, so clients and the database carry over unchanged. Treat that
> contract as frozen: adding an endpoint is fine, changing an existing one is not.
>
> One deliberate superset: the Next.js BFF is gone (the frontend is a static SPA),
> so operations that need a `client_secret` or the user's OAuth token now live in
> the API under `/integrations/*`. See ROADMAP for the list.

## Commands

```bash
# Backend (run from backend/)
npm run build             # tsc → dist/
npm run dev               # tsx watch (hot reload)
npm test                  # unit tests (vitest, mocks only, fast)
npm run test:integration  # testcontainers (needs Docker)
npm run openapi           # regenerate docs/openapi.json after touching routes/DTOs
npm run pre-push          # mirror CI: fmt + lint + typecheck + test + openapi drift + build

# Frontend (run from frontend/)
npm run dev               # local dev
npm run build             # build + lint + typecheck (CI runs this)

# Full stack
docker compose up -d --build   # db + redis + migrate (one-off) + api + web
```

## CI gates (push to main runs .github/workflows/ci.yml)

- **prettier** — `npm run fmt:check` must pass; run `npm run fmt` before committing
- **eslint** — type-aware (`recommendedTypeChecked`), `--max-warnings 0`
- **typecheck** — `tsc --noEmit` over src **including tests**
- **openapi drift** — if you add/change a route or DTO, run `npm run openapi` and
  commit `backend/docs/openapi.json`, or CI fails
- vitest unit tests; frontend `npm run lint` + `npm run build`; gitleaks secrets scan

## Conventions

- **Language:** code identifiers and commit messages in English; comments and
  UI strings in Mongolian. Every source file starts with the two-line
  `Government Template Platform V3.0` header (copy from any existing file).
- **Commits:** conventional commits (`feat:`, `fix:`, `chore:`, `docs:`…).
- **EN/MN doc pairs:** when you touch `backend/docs/X.md`, update `X_MN.md`
  too (same for READMEs and `frontend/src/lib/i18n.ts` — every key exists in
  both `mn` and `en`).
- **TypeScript:** `strict` + `noUncheckedIndexedAccess`. ESM only (`"type":
  "module"`), so **relative imports must carry the `.js` extension** even in
  `.ts` files — that is what Node resolves at runtime.

## Backend architecture rules

- Clean Architecture: `handler → usecase → repository → domain`; usecases
  depend only on repository **interfaces** (`datasources/repositories/interface`),
  never on postgres adapters; `domain/` imports nothing internal.
- **No ORM** — hand-written SQL via `pg`; records are plain interfaces with
  snake_case keys matching the column names. Parameterized queries only
  (`$1, $2 …`) — never string interpolation.
- **Context is explicit.** There is no ambient request state: every repository
  and usecase takes `ctx: Ctx` (`pkg/ctx`) as its first argument. `Ctx` carries
  `requestId`, the RLS `identity`, the `CurrentUser` and an `AbortSignal`. This
  mirrors Go's `context.Context` and makes "forgot to pass identity" a compile
  error rather than a silent RLS bypass.
- Errors: usecases throw `apperror.*` (mapped to HTTP status in
  `http/response.ts`); wrap internal causes with `apperror.internalCause` so
  library errors never reach clients.
- Handlers: `(req, res) => Promise<void>` wrapped by `wrap()`; decode+validate
  with `decodeBody(req, schema)` (zod `strictObject` → unknown fields rejected),
  respond via `newSuccessResponse` / `respondWithError`.
- Wiring is manual DI in `src/cmd/api/server/server.ts`; routes register in
  `src/http/routes/index.ts` (one `route_<domain>.ts` per domain).
- Migrations: numbered SQL files in `backend/migrations/` (`N_name.up.sql` +
  `.down.sql`) — **unchanged from the Go version**; the `migrate` compose
  service applies them on every `up` (idempotent, advisory-locked).
- **RLS:** the api must connect as a non-superuser role (boot guard enforces
  this in production). `users`-table queries go through `db.withRLS(ctx, …)`,
  which opens a transaction and sets `app.user_id` / `app.user_role` via
  `set_config(..., true)` — `SET LOCAL` semantics, so identity cannot leak
  across pooled connections. New per-user tables need their own policies.
- Add-a-feature walkthrough: `backend/docs/DEVELOPMENT.md`.

## AI pipeline (backend/docs/AI_PIPELINE.md)

- `pkg/gemini` is SDK-free REST; usecase layer is `usecases/ai`.
- System prompt = hardcoded guardrails + DB-configurable `scope`/
  `instructions` (`ai_prompts` table, admin API). Never make the guardrail
  layer configurable.
- Tools (`ai.ToolDef`) run server-side with the request context; register in
  `server.ts`. Knowledge base lives in `ai_knowledge`.
- Chat degrades to a Mongolian fallback reply (`degraded: true`) on transient
  Gemini failures — don't turn that into a 5xx.

## Frontend rules

- **Vite + React SPA** served as static files, with nginx proxying `/api/*` to
  the api container (same-origin). Auth tokens stay in **httpOnly cookies set by
  the API itself** (`dgov_access` / `dgov_refresh`) — they never reach client JS
  — and mutating requests carry the `x-dgov-csrf` double-submit header.
- **No BFF.** The browser calls `/api/v1/*` directly (same origin, proxied by
  nginx). `lib/client.ts` is the only place that talks to the API: it sends
  `credentials: 'same-origin'` and attaches `x-dgov-csrf` (read from the
  JS-readable `dgov_csrf` cookie) to every mutating request. Never call `fetch`
  against the API from a component — go through `getJSON`/`sendJSON`.
- **Auth guards live in the route table** (`src/App.tsx`): `RequireAuth` and
  `RequirePermission`. Pages must not re-implement them. The real decision is
  always server-side; these only route the UI.
- **Never put a secret in the frontend** — it ships as static files. Non-secret
  runtime config comes from `GET /config`.
- Server data fetching uses TanStack Query (`getJSON` + `useQuery`, invalidate
  on mutations); provider is in `components/Providers.tsx`.
- UI strings via `useT()` + `lib/i18n.ts` keys (mn + en).

## Gotchas

- `backend/.env` and root `.env`/`backend.env` are gitignored secrets — never
  commit; document new env vars in `backend/.env.example` **and** the READMEs.
- The `.go-reference/` Go source tree is **gone** (the port is done). If you ever
  need to compare against the original, clone
  [gerege-systems/template-dgov-mn](https://github.com/gerege-systems/template-dgov-mn)
  outside this repo — do not re-add it here.
- `/ai/*` rate limit is ~20 req/min per IP (live translation streams ~8
  chunks/min); auth endpoints ~5/min with a 4 KiB body cap.
- The compose stack runs `ENVIRONMENT=development` on purpose (internal DB
  has no TLS; the production guard requires `sslmode=verify-full`).
- Password hashes use **bcryptjs** (pure JS, no node-gyp) — wire-compatible with
  the Go version's `$2a`/`$2b` hashes, so existing credentials keep working.
- Redis is **fail-closed** for auth: a real Redis error (not a cache miss) on the
  revocation/rotation check returns 503 rather than admitting a possibly-revoked
  token. Don't "simplify" that into a pass-through.
