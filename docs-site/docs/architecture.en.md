# Architecture

The platform follows **Clean Architecture**: `handler → usecase → repository →
domain`. The business core never imports the web framework.

## Components

```
Internet ──► nginx (TLS)
   │
   ├─ /oauth2/*, /.well-known/*, /userinfo ─► Go API — built-in OIDC issuer
   ├─ /rp/sign/*   ─► eID sign relay (backend)
   ├─ /rp/eid/*     ─► eID service proxy — personal (backend)
   ├─ /rp/eid-org/* ─► eID service proxy — organizations (backend)
   └─ everything else ─► Next.js BFF (web) ──► backend API (:8080)
                                                   │
   internal network:  db (PostgreSQL) · redis
```

## Layers

| Layer | Technology | Notes |
|---|---|---|
| **Backend** | Go · chi (net/http) · pgx (no ORM) | Clean Architecture, RLS, hand-written SQL |
| **Frontend** | Next.js 15 (BFF) | The browser talks only to same-origin routes; tokens never reach client JS |
| **OIDC provider** | Built-in (Go, usecases/oidc) | the platform drives login/consent/logout itself |
| **Identity** | eID Mongolia RP | electronic-ID verification |
| **Cache/queue** | Redis | session deny-list, transient state |
| **AI** | Gemini (SDK-free REST) | chat, voice, translation |

## Security

- **Row-Level Security (RLS)** — each user sees only their own rows; a boot-time
  enforceability guard (requires a non-superuser role in production).
- **BFF pattern** — tokens live in httpOnly cookies, never in browser JS.
- **Double CSRF** — custom header + origin check.
- **Security headers** — CSP, HSTS, COOP/COEP/CORP; per-IP rate limiting.
- **Audit** — hash-chained, append-only trail.

## Backend layout (overview)

```
backend/
├── cmd/api/server/        # manual DI wiring (server.go)
├── internal/
│   ├── business/
│   │   ├── domain/         # pure domain (no internal imports)
│   │   └── usecases/       # business logic (depends on interfaces)
│   ├── datasources/
│   │   ├── repositories/   # pgx adapters + interfaces
│   │   └── caches/         # redis
│   └── http/
│       ├── handlers/       # func(w,r) error, v1.Wrap
│       ├── middlewares/    # auth, oauth-bearer, rate-limit, ...
│       └── routes/         # route grouping
├── pkg/                    # eid, oidc, secrethash, gemini, ...
└── migrations/             # numbered SQL (N_name.up/down.sql)
```
