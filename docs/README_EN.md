# Government Template Platform V3.0 — Node.js edition

> **The foundation for building digital government** — **eID based · AI enabled** —
> a production-ready base to build any government digital service on.
> This is the **Node.js + React** edition of the platform.

**Government Template Platform V3.0** wires a Clean-Architecture **Node.js
backend**, a **React** frontend and a Gemini AI pipeline into one hardened,
extensible base. You build value, not infrastructure — identity, security, AI and
the service backbone are solved on day one. The reference deployment of this
edition runs at [node.template.dgov.mn](https://node.template.dgov.mn).

> 🌐 [Монгол](../README.md) · **English**

[![Node.js](https://img.shields.io/badge/Node.js-22-339933.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6.svg)](https://www.typescriptlang.org/)
[![Express](https://img.shields.io/badge/Express-5-000000.svg)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791.svg)](https://www.postgresql.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB.svg)](https://react.dev/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](../LICENSE)

The backend pairs an **Express 5 (TypeScript)** router with hand-written SQL over
the [node-postgres](https://node-postgres.com/) driver — **no ORM**. The frontend
is **React**.

## 🔄 Port status

This repo is the Node.js/React port of the Go/Next.js original
([gerege-systems/template-dgov-mn](https://github.com/gerege-systems/template-dgov-mn)).
**The HTTP contract (routes, `BaseResponse` envelope, error semantics) and the SQL
migrations are preserved 1:1**, so clients and databases carry over untouched.

| Layer | Status |
|---|---|
| Platform layer — config · logger · ctx/RLS · apperror · pg (`withRLS`) · Redis · JWT · validators · 13 middleware · migration runner · health · server wiring | ✅ Done (67 unit tests) |
| Domain layer — auth/eID · users · rbac · ai · gov · oidc · relay · registry · gateway · sign · sso … (25 domains) | 🚧 Port in progress |
| Frontend — Vite + React SPA | 🚧 Currently the Next.js 15 BFF app (transitional) |

See [ROADMAP.md](../ROADMAP.md) for details, including the **port contract** that
must hold (HTTP surface, SQL schema, security behaviour).

## 📌 Provenance and open source

The platform's original Go edition derives from the open-source
[snykk/go-rest-boilerplate](https://github.com/snykk/go-rest-boilerplate)
(MIT, Najib Fikri). This Node.js edition reproduces that architecture (Clean
Architecture, ORM-free SQL, RLS, fail-closed auth) in TypeScript. Upstream
attribution is kept in [AUTHORS](../AUTHORS). This project is **MIT licensed** —
[LICENSE](../LICENSE).

## Monorepo layout

```
template-dgov-mn-nodejs/
├── backend/               # Node.js · Express 5 · TypeScript · pg · PostgreSQL · Redis
│   ├── src/
│   │   ├── domain/        # enterprise entities (no outward dependencies)
│   │   ├── usecases/      # business logic (depends only on repository interfaces)
│   │   ├── datasources/   # pg driver (withRLS) · Redis · repository adapters · migration
│   │   ├── http/          # middleware · handlers · routes · unified response envelope
│   │   ├── pkg/           # ctx · jwt · logger · validators · eID · gemini …
│   │   └── cmd/           # api · migration · healthcheck · openapi CLI
│   ├── migrations/        # numbered SQL (identical to the Go edition, untouched)
│   └── docs/              # ARCHITECTURE · DEVELOPMENT · API_CONTRACT · SECURITY (EN/MN)
└── frontend/              # React (Next.js BFF during the transition)
```

## Features

- **Clean Architecture** — `handler → usecase → repository → domain`, no back-imports; the business core never imports a web framework.
- **Explicit context** — every repository and usecase takes `ctx: Ctx` as its first argument (`requestId`, RLS `identity`, `CurrentUser`, `AbortSignal`). This is the equivalent of Go's `context.Context`: forgetting to pass identity is a compile error, not a silent RLS bypass.
- **Authentication — eID + Google** — the only login method is **eID** (eID Mongolia Relying Party: QR code / mobile deep-link / national-ID push + long-poll session), plus **Google OAuth** account linking. Sessions are JWT access + refresh with rotation; logout revokes both (refresh key + access deny-list).
- **Fail-closed auth** — token revocation and password-rotation cutoffs are Redis-backed; a *real* Redis error (not a cache miss) returns 503 rather than admitting a possibly-revoked token.
- **eID PKI profile** — reads the signed-in citizen's eID identity from the IdP: linked organisations and authorised signatories, certificates, registered devices, activity.
- **Organisations and membership** — create/search organisations (verified against the state registry via Gerege Verify/XYP) plus member and permission management, RLS-scoped per user.
- **Government service portal** — the citizen-facing surface: service catalogue, requests, references, notifications, payments, appointments.
- **API gateway** — admin-managed services / routes / consumers / API keys / policies plus request telemetry.
- **OIDC provider (SSO)** — the platform can act as an identity provider itself, driving the login/consent/logout flows so relying parties sign in through it. Enabled once `OAUTH_ISSUER` is configured.
- **Document signing (PAdES)** — server-side PDF signing through eID Mongolia `/v3` with a persistent Document-Signer certificate; the sign relay lets third-party RPs sign through the platform's eID credentials.
- **Third-party integrations** — per-user OAuth connections (Google Drive/Meet, Dropbox) with tokens encrypted at rest (AES-256-GCM), plus **Gerege Space**, the app's own SFTP storage.
- **AI pipeline (Gemini)** — SDK-free REST client with function calling: text and voice chat, speech-to-text, text-to-speech, live translation. A layered system prompt (hardcoded guardrails plus admin-configurable scope/instructions) keeps the assistant inside its remit.
- **Audit log** — hash-chained, append-only audit trail.
- **RBAC and super admin** — dynamic roles plus a permission catalogue; a four-role model (**superadmin → admin → manager → user**).
- **Hardened** — security headers (CSP, HSTS, COOP/COEP/CORP), CORS allow-list, rate limiting, request timeouts, parameterized queries, Postgres Row-Level Security with a boot-time enforcement guard. See [SECURITY.md](../SECURITY.md).
- **Observability** — OpenTelemetry traces + Prometheus metrics + pino structured logs; `/metrics` and `/swagger` are bearer-token gated in production.
- **Tested** — vitest unit tests plus testcontainers integration tests.

## Quick start

**Requirements:** Node 22+, PostgreSQL 16+, Redis 7+ (running the full stack with
Docker is recommended).

```bash
# 1) Backend  →  http://localhost:8080
cd backend
cp .env.example .env          # set JWT_SECRET (≥32), DB, Redis, EID_* RP credentials
npm install
npm run migrate               # apply SQL migrations
npm run dev

# 2) Frontend →  http://localhost:3000
cd ../frontend
cp .env.example .env.local    # BACKEND_URL=http://localhost:8080
npm install
npm run dev
```

Or bring up the whole stack (db + redis + migrate + api + web):

```bash
cp .env.example .env                    # POSTGRES_*, REDIS_PASS, ports
cp backend/.env.example backend.env     # backend configuration
docker compose up -d --build
```

Open **http://localhost:3000** and choose **Sign in with eID** (scan the QR code,
open the eID mobile app, or enter a national ID and accept the push).

### Development gate

```bash
cd backend && npm run pre-push   # fmt + lint + typecheck + test + openapi drift + build
```

## Documentation

| Doc | What |
|-----|------|
| [backend/docs/ARCHITECTURE.md](../backend/docs/ARCHITECTURE.md) | Layers and dependency flow |
| [backend/docs/DEVELOPMENT.md](../backend/docs/DEVELOPMENT.md) | Add-a-feature walkthrough, tests, code style |
| [backend/docs/API_CONTRACT.md](../backend/docs/API_CONTRACT.md) | REST endpoints, request/response |
| [backend/docs/AI_PIPELINE.md](../backend/docs/AI_PIPELINE.md) | AI assistant internals: flow, prompt layers, tools, voice |
| [backend/docs/SERVICE_WORKFLOW.md](../backend/docs/SERVICE_WORKFLOW.md) | Service registry (CPSV-AP passport) → request state machine, SLA |
| [backend/docs/SECURITY.md](../backend/docs/SECURITY.md) | Implemented controls + ASVS roadmap |
| [docs/DEPLOYMENT.md](DEPLOYMENT.md) | VPS deploy runbook (compose, env files, nginx, updates, rollback) |
| [ROADMAP.md](../ROADMAP.md) | What is done, what is next |
| [SECURITY.md](../SECURITY.md) | How to report a vulnerability |
| [CONTRIBUTING.md](../CONTRIBUTING.md) | How to contribute |

## Contributing

Contributions are welcome — please read [CONTRIBUTING.md](../CONTRIBUTING.md) and
the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

[MIT](../LICENSE) — a derivative of snykk/go-rest-boilerplate (MIT); upstream
attribution is kept in [AUTHORS](../AUTHORS).

---

**Government Template Platform V3.0** — built by the **Gerege Systems Development
Team** and **Claude AI**, 2026.
