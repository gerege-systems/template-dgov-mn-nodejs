# Government Template Platform V3.0 — Backend (Node.js)

> _One foundation — every government service._

> 🌐 **English** · [Монгол](README_MN.md)

[![Node.js](https://img.shields.io/badge/Node.js-22-339933.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6.svg)](https://www.typescriptlang.org/)
[![Express](https://img.shields.io/badge/Express-5-000000.svg)](https://expressjs.com/)
[![pg](https://img.shields.io/badge/node--postgres-8-336791.svg)](https://node-postgres.com/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

The Node.js backend of the **Government Template Platform V3.0** — a
production-ready foundation on which *any* digital-government service can be
built. It pairs a disciplined **Clean Architecture** core with hand-written SQL
over **node-postgres** (no ORM), and ships with a full suite of government-grade
capabilities: **eID Mongolia** authentication, **Google** account-linking,
**PAdES** document signing, a **Gemini AI** pipeline, and defense-in-depth
security hardening — all bilingual (mn/en) and observable from day one. Built on
**Express 5** for HTTP, **pg + PostgreSQL** for data, and **Redis** for cache.

> **Port status:** this is the Node.js port of the Go backend. The platform layer
> is complete; domains are landing one at a time. See [../ROADMAP.md](../ROADMAP.md).

## Requirements

- Node **22+** (ESM, native `fetch`, `AbortSignal.timeout`)
- PostgreSQL **16+**
- Redis **7+**

## Getting started

```bash
cp .env.example .env      # set JWT_SECRET (≥32 chars), DB, Redis, EID_* credentials
npm install
npm run migrate           # apply SQL migrations (idempotent, advisory-locked)
npm run dev               # tsx watch → http://localhost:8080
```

Verify:

```bash
curl -s localhost:8080/health   # {"status":true,"message":"service is healthy"}
curl -s localhost:8080/ready    # {"status":true,"checks":{"database":"ok","redis":"ok"}}
```

## Commands

| Command | What |
|---|---|
| `npm run dev` | Hot-reloading dev server (tsx watch) |
| `npm run build` | `tsc` → `dist/` (build tsconfig excludes tests) |
| `npm start` | Run the compiled server |
| `npm run migrate` | Apply migrations (`-- --action=down` to revert) |
| `npm test` | Unit tests (vitest, mocks only, fast) |
| `npm run test:integration` | Integration tests (testcontainers, needs Docker) |
| `npm run openapi` | Regenerate `docs/openapi.json` |
| `npm run lint` / `npm run fmt` | ESLint (type-aware) / Prettier |
| `npm run typecheck` | `tsc --noEmit` over src **including** tests |
| `npm run pre-push` | Everything CI runs, in one go |

## Layout

```
src/
├── domain/           # enterprise entities; imports nothing internal
├── usecases/         # business logic; depends only on repository interfaces
├── datasources/
│   ├── drivers/      # pg pool + withRLS transaction helper + boot RLS guard
│   ├── caches/       # Redis (GETDEL, cache-miss sentinel, op timeouts)
│   ├── migration/    # migration runner (advisory lock, per-file transaction)
│   └── repositories/
│       ├── interface/  # the contracts usecases depend on
│       └── postgres/   # hand-written SQL adapters
├── http/
│   ├── middlewares/  # auth · rbac · rls · ratelimit · cors · security · …
│   ├── handlers/v1/  # request → usecase → response
│   ├── routes/       # one route_<domain>.ts per domain, registered in index.ts
│   └── response.ts   # BaseResponse envelope, wrap(), respondWithError()
├── pkg/              # ctx · jwt · logger · validators · observability · eID · gemini
├── config/           # env loader + validation (fail-closed in production)
├── apperror/         # typed domain errors → HTTP status
└── cmd/              # api · migration · healthcheck · openapi
migrations/           # numbered SQL — identical to the Go edition
```

## Architecture rules

**Dependency direction is inward only:** `handler → usecase → repository → domain`.

- **No ORM.** SQL is hand-written; records are plain interfaces whose keys match
  the column names (snake_case). Queries are always parameterized (`$1, $2 …`).
- **Context is explicit.** There is no ambient request state. Every repository and
  usecase takes `ctx: Ctx` (`pkg/ctx`) first. `Ctx` carries `requestId`, the RLS
  `identity`, the `CurrentUser`, and an `AbortSignal`. This mirrors Go's
  `context.Context` — forgetting to pass identity becomes a compile error instead
  of a silent RLS bypass.
- **Errors.** Usecases throw `apperror.*`; `http/response.ts` maps the type to a
  status code. Wrap library errors with `apperror.internalCause(err)` so their
  text is logged but never returned to the client.
- **Handlers** are `(req, res) => Promise<void>` wrapped by `wrap()`. Decode and
  validate in one step with `decodeBody(req, schema)` — schemas are zod
  `strictObject`, so unknown fields are rejected (the equivalent of Go's
  `DisallowUnknownFields`).
- **Wiring** is manual DI in `src/cmd/api/server/server.ts`. No magic container:
  you can read the whole dependency graph in one file.

### Row-Level Security

The api **must** connect as a non-superuser role — superusers and `BYPASSRLS`
roles skip RLS policies silently. `setupPostgres()` checks this at boot and
**fails closed in production**.

All `users`-table access goes through `db.withRLS(ctx, tx => …)`, which:

1. opens a transaction,
2. sets `app.user_id` / `app.user_role` via `set_config(..., true)` — the
   `SET LOCAL` form, so the values vanish on commit/rollback and **cannot leak to
   the next request on a pooled connection**,
3. runs the callback, then commits.

With no identity in `ctx` the GUCs are empty and the policies deny every row —
a safe default. New per-user tables need their own policies (see
`migrations/7_enable_rls_users.up.sql` for the pattern).

### Auth is fail-closed

Two Redis-backed checks run on every authenticated request:

- **logout deny-list** — `access_deny:<jti>` present ⇒ the token was revoked;
- **password-rotation cutoff** — `pwd_cutoff:<user_id>` ≥ the token's `iat` ⇒ the
  token predates a credential change.

A cache **miss** means "not revoked, continue". A **real** Redis error means the
check could not be made, and the request gets **503** rather than admitting a
possibly-revoked token. Do not "simplify" this into a pass-through.

## Configuration

Every variable is documented in [`.env.example`](.env.example). Config is
validated at boot and the process **refuses to start** on a bad value. Production
additionally requires:

- `DB_POSTGRE_URL` with `sslmode=verify-full` (or `verify-ca` on an internal
  network) — unverified TLS is rejected;
- `ALLOWED_ORIGINS` — no wildcard CORS;
- `VERIFY_API_KEY` — all OTP goes through GeregeCloud Verify (no SMTP anywhere);
- a non-superuser DB role (RLS guard).

`process.env` overrides the `.env` file, so containers can inject configuration
the 12-factor way.

## Observability

| Endpoint | Notes |
|---|---|
| `/health` | Liveness. Always open — orchestrators need it. |
| `/ready` | Readiness: pings Postgres and Redis. Open. |
| `/metrics` | Prometheus (HTTP counters/histograms, pg pool gauges, Node defaults). **Bearer-gated in production**, 404 otherwise. |
| `/swagger/doc.json` | OpenAPI 3.1 document. Same gate. |

Structured JSON logs go through pino (`pkg/logger`), with `request_id` correlated
from the `X-Request-ID` header (validated and length-capped against log
injection). Set `OTEL_EXPORTER=otlp` to emit OpenTelemetry traces; leave it empty
and tracing is a no-op with effectively zero cost.

## Tests

```bash
npm test                  # unit — no Docker, milliseconds
npm run test:integration  # testcontainers: real Postgres + Redis
```

Unit tests cover the platform layer: config validation, typed errors, JWT
(including `alg=none` and issuer-confusion rejection), validator error shapes,
domain rules, migration ordering. Integration tests exercise RLS policies,
migration idempotency and repository SQL against a real database.

## Docs

| Doc | What |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Layers, dependency flow |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | Add-a-feature walkthrough, code style |
| [docs/API_CONTRACT.md](docs/API_CONTRACT.md) | REST endpoints, request/response |
| [docs/AI_PIPELINE.md](docs/AI_PIPELINE.md) | AI assistant internals |
| [docs/SERVICE_WORKFLOW.md](docs/SERVICE_WORKFLOW.md) | Service registry, request state machine, SLA |
| [docs/SECURITY.md](docs/SECURITY.md) | Implemented controls + ASVS roadmap |

---

**Government Template Platform V3.0** — built by the **Gerege Systems Development
Team** and **Claude AI**, 2026.
