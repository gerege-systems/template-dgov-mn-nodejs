# Architecture

The platform follows **Clean Architecture**: `handler → usecase → repository →
domain`. The business core never imports the web framework.

## Components

```
Internet ──► nginx (TLS)
   │
   ├─ /oauth2/*, /.well-known/*, /userinfo ─► api — the platform's own OIDC issuer
   ├─ /rp/sign/*    ─► eID sign relay (api)
   ├─ /rp/eid/*     ─► eID service proxy — personal (api)
   ├─ /rp/eid-org/* ─► eID service proxy — organizations (api)
   ├─ /api/v1/*     ─► api (:8080)
   └─ everything else ─► web — static React SPA (nginx)
                                                   │
   internal network:  db (PostgreSQL) · redis
```

!!! info "No BFF"
    In the Go/Next.js edition the browser talked to Next.js BFF routes which
    proxied to the backend. The Node.js edition **has no such layer**: `web` is
    pure static files (no server-side code) and the browser calls same-origin
    `/api/v1/*` **directly**. One network hop fewer, and no "the path is written
    in two places" duplication.

    Tokens still never reach browser JS — the API itself sets httpOnly cookies
    (see *Security* below).

## Layers

| Layer | Technology | Notes |
|---|---|---|
| **Backend** | Node.js 22 · Express 5 · TypeScript (ESM) · `pg` (no ORM) | Clean Architecture, RLS, hand-written SQL |
| **Frontend** | Vite · React 19 · React Router 7 · TanStack Query | Static SPA served by nginx; no server-side code |
| **OIDC provider** | The platform's own code (`usecases/oidc`) | drives login/consent/logout itself (no Hydra/Keycloak) |
| **Identity** | eID Mongolia RP | electronic-ID verification |
| **Database** | PostgreSQL 16 | Row-Level Security is the load-bearing per-user boundary |
| **Cache/queue** | Redis 7 | session deny-list, transient state, rate limiting |
| **AI** | Gemini (SDK-free REST) | chat, voice, translation |
| **Observability** | pino · prom-client · OpenTelemetry | structured logs · `/metrics` · traces |

## Security

- **Row-Level Security (RLS)** — each user sees only their own rows.
  `db.withRLS(ctx, …)` opens a transaction and sets `app.user_id` /
  `app.user_role` via `set_config(..., true)` (`SET LOCAL` semantics), so an
  identity **cannot leak** across pooled connections. A boot-time guard requires
  a non-superuser role in production.
- **httpOnly cookies + double-submit CSRF** — the **API itself** sets the
  access/refresh tokens as `dgov_access` / `dgov_refresh` cookies (JS cannot read
  them). Every mutating request carries an `x-dgov-csrf` header copied from the
  JS-readable `dgov_csrf` cookie. Tokens are still returned in the response body,
  so mobile and m2m clients keep using Bearer.
- **Fail-closed auth** — a real Redis error (not a cache miss) on the
  revocation/rotation check returns 503 rather than admitting a possibly-revoked
  token.
- **Security headers** — the SPA's nginx sets CSP · X-Frame-Options ·
  X-Content-Type-Options · Referrer-Policy · Permissions-Policy; the API sends
  `default-src 'none'` (it returns JSON). Per-IP rate limiting at the middleware
  layer.
- **Audit** — hash-chained, append-only trail. The canonical JSON is
  **byte-compatible** with the Go version, so both editions can share one chain
  during a migration.

## Backend layout (overview)

```
backend/
├── src/
│   ├── cmd/api/server/     # manual DI wiring (server.ts)
│   ├── domain/             # pure domain (no internal imports)
│   ├── usecases/           # business logic (depends only on repository INTERFACES)
│   ├── datasources/
│   │   ├── repositories/   # interface + postgres adapters (hand-written SQL)
│   │   ├── caches/         # redis
│   │   └── drivers/        # pg pool + withRLS
│   ├── http/
│   │   ├── handlers/v1/    # (req,res) => Promise<void>, wrapped by `wrap()`
│   │   ├── middlewares/    # auth · rbac · rls · ratelimit · csrf · …
│   │   ├── routes/         # one route_<domain>.ts per domain
│   │   └── dto/            # zod strictObject requests + response shapes
│   ├── pkg/                # eid · oidc · gemini · pdf · secrethash · cloudfiles …
│   └── apperror/           # typed domain errors → HTTP status
└── migrations/             # numbered SQL (N_name.up/down.sql) — IDENTICAL to the Go version
```

!!! tip "One ESM quirk"
    The package is `"type": "module"`, so **every relative import carries a `.js`
    extension** — even inside `.ts` files. That is what Node resolves at runtime.

## Frontend layout (overview)

```
frontend/
├── src/
│   ├── App.tsx             # the route table — RequireAuth / RequirePermission live HERE
│   ├── app/                # pages (route tree)
│   ├── components/         # reusable UI
│   ├── lib/
│   │   ├── client.ts       # the ONLY place that talks to the API (CSRF + cookies)
│   │   ├── session.tsx     # useSession / useMe / usePermissions
│   │   └── i18n.ts         # every key exists in both mn and en
│   └── styles/
├── nginx.conf              # SPA fallback + security headers
└── public/.well-known/     # apple-app-site-association (iOS Universal Links)
```

!!! warning "Guards live in the route table"
    `RequireAuth` / `RequirePermission` are centralised in `App.tsx` — pages do
    not re-implement them, which makes "forgot the check" structurally
    impossible. The real decision is always **server-side**; these only route the
    UI.
