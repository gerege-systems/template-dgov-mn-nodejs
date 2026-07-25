# Architecture Overview

> 🌐 **English** · [Монгол](ARCHITECTURE_MN.md)

This document describes the high-level architecture of the **Government Template
Platform V3.0** (Цахим засаглалыг бүтээх суурь) — a production-ready foundation on
which any digital-government service can be built. Its flagship reference
deployment is **Government Template Platform** (at **node.template.dgov.mn**), an
**eID-based government service platform** — a Relying Party of Government SSO. The
stack is **Node.js 22 · Express 5 · TypeScript (ESM) + node-postgres (`pg`) +
PostgreSQL + Redis + Gemini AI**, organized along Clean Architecture lines and
fronted by a **static Vite + React SPA** (no BFF).

> **Edition.** This repo is the Node.js/React port of the Go/Next.js original
> ([template.dgov.mn](https://template.dgov.mn)). The HTTP contract, SQL schema
> and security behaviour are preserved 1:1 — see [ROADMAP](../../ROADMAP.md).

In that reference deployment the platform serves as both an **eID Relying Party**
(users log in with eID) and an **OIDC Identity Provider** (other government apps
log in *through* it via the built-in provider — no Ory Hydra). Row-Level Security in PostgreSQL is the
load-bearing per-user isolation boundary — see
[Row-Level Security](#row-level-security-rls).

> **Origin.** The Clean-Architecture layering, data layer, caching,
> observability, and test strategy descend (via the Go edition) from the
> open-source [snykk/go-rest-boilerplate](https://github.com/snykk/go-rest-boilerplate)
> by Najib Fikri (MIT). The auth stack, RLS security model, eID/SSO/OIDC-provider
> integrations, and the feature modules below were built for this platform. As an
> MIT derivative the upstream copyright is retained — see
> [Credits](#credits--license).

## Layer Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        HTTP Layer                                 │
│  src/cmd/api/server → Middleware → src/http/handlers/v1           │
│  src/http/{routes, dto, middlewares, cookies}                     │
├─────────────────────────────────────────────────────────────────┤
│                       Usecase Layer                               │
│  src/usecases/*  (25 bounded contexts)                            │
│  (Business logic, validation, orchestration)                      │
├─────────────────────────────────────────────────────────────────┤
│                     Repository Layer                              │
│  src/datasources/repositories/{interface, postgres}               │
│  (hand-written SQL via `pg`, RLS transactions, soft-delete)       │
├─────────────────────────────────────────────────────────────────┤
│                       Domain Layer                                │
│  src/domain                                                       │
│  (Entities, value objects, business rules)                        │
└─────────────────────────────────────────────────────────────────┘
```

## Feature Modules (bounded contexts)

The platform is composed of **24 usecase modules** under `src/usecases/`, each an
interface + implementation wired by hand in the composition root. Beyond the boilerplate core (`auth`, `users`, `rbac`, `ai`)
the platform adds the eID/SSO/government-service surface:

| Module         | Responsibility |
|----------------|----------------|
| `auth`         | **eID login** (QR / mobile deep-link / national-ID push + long-poll), **Google OAuth** account-linking, session refresh/logout. No passwords. |
| `users`        | User reads/writes reused by auth, admin, sign, superadmin; login lockout; password-change token cutoff. |
| `rbac`         | Dynamic roles + permissions catalogue and the permission resolver used by RBAC middleware. |
| `ai`           | Gemini pipeline — function-calling chat, STT/TTS, live translation, layered prompts, server-side tools + knowledge base. |
| `org`          | Organizations + memberships (eID-linked; **RLS**). |
| `gov`          | Citizen "Government services" portal — applications, references, notifications, payments, appointments (per-user, **RLS**) over a public service catalogue. |
| `gateway`      | API gateway — services / routes / policies + telemetry (each service carries an OAuth `scope`). |
| `applications` | Unified OAuth2 **client registry** (RP + m2m) backed by the platform's **own** `oauth_clients` table — merges the old gateway consumers/API-keys and the SSO RP registration; per-service access = OAuth scopes (`application_services` → `gateway_services.scope`). Admin-managed (`gateway.manage`). Secrets stored as Argon2id; Hydra's PBKDF2 format is still *verified* so existing clients keep working. |
| `core`         | Gerege Core (`core.gerege.mn`) USER FIND / ORG FIND lookup wrapper. |
| `provider`     | **OIDC Provider** — login/consent/logout core in front of the built-in `usecases/oidc`; the platform is itself an SSO IdP. |
| `integrations` | User third-party OAuth (Google Drive/Meet, Dropbox); tokens stored **AES-256-GCM encrypted** (**RLS**). |
| `assets`       | Personal signature image + organization stamp (images to Google Drive, URL in DB). |
| `gspace`       | Gerege Space — the app's own SFTP storage, per-user quota (default 2 MB). |
| `audit`        | Persisted **hash-chained, append-only** audit log (admin read API). |
| `superadmin`   | Manage admin users (create / grant / revoke); every mutation written to the audit log. |
| `security`     | Security-event ingest (authenticated users write, admin reads). |
| `site`         | Site-wide appearance defaults (accent / font / density / theme). |
| `sign`         | PDF signing (**PAdES**) via eidmongolia `/v3` with a server-held Document-Signer certificate. |
| `oidc`         | The **OIDC issuer** itself — authorize/token/introspect/userinfo/revoke, RSA key manager + JWKS, single-use codes and refresh-token families. |
| `sso`          | The platform as an SSO **consumer** (Relying Party of `sso.dgov.mn`): one-time state in Redis, 3-tier user upsert that merges an SSO identity into the existing eID account by civil ID. |
| `ssotoken`     | Stores/refreshes the user's SSO tokens (AES-256-GCM), which is what makes the optional PKI-over-SSO proxy path work. |
| `registry`     | Service **registry** (CPSV-AP passport): drafts, versions, evidences, life events, publish/archive, once-only violation analysis. Also serves the public `catalog` read model. |
| `relay`        | Inter-agency request **relay**: peer registry, HMAC-signed webhooks, routing, SLA sweep with escalation, plus a demo simulator. |
| `superadmin_onboarding` | The only door to super admin: invite → Google → eID → email OTP → TOTP, with backup codes. No session is minted until TOTP is verified. |

## Directory Structure

```
backend/
├── src/
│   ├── cmd/
│   │   ├── api/
│   │   │   ├── main.ts             # Entry point (config + logger init)
│   │   │   └── server/server.ts    # Composition root (manual DI) — every mount is read here
│   │   ├── migration/              # Migration CLI (SQL only; NO ORM/AutoMigrate)
│   │   ├── healthcheck/            # Tiny binary used by the container HEALTHCHECK
│   │   └── openapi/                # Emits docs/openapi.json (drift-checked in CI)
│   ├── apperror/                   # Typed domain errors (→ HTTP status)
│   ├── config/                     # Env loader + guards + .env parser
│   ├── constants/                  # Env, logger, error, endpoint constants
│   ├── domain/                     # Enterprise entities (innermost circle)
│   ├── usecases/                   # 25 bounded contexts (interface + impl)
│   ├── datasources/
│   │   ├── caches/                 # redis.ts + memory.ts (two-tier)
│   │   ├── drivers/                # pg pool + `withRLS` + RLS-enforceability boot guard
│   │   ├── migration/              # SQL migration runner (advisory-locked)
│   │   ├── records/                # snake_case row interfaces + record↔domain mappers
│   │   └── repositories/
│   │       ├── interface/          # Gateway abstractions (what usecases depend on)
│   │       └── postgres/*          # Implementations (hand-written SQL, withRLS)
│   ├── http/
│   │   ├── cookies.ts              # httpOnly session cookies + CSRF + OAuth state
│   │   ├── dto/                    # requests (zod strictObject) + response shapes
│   │   ├── handlers/v1/            # HTTP handlers (per module)
│   │   ├── middlewares/            # Global + per-route middleware (16)
│   │   ├── routes/                 # Route registration — one route_<domain>.ts per module
│   │   └── response.ts             # wrap · decodeBody · the BaseResponse envelope
│   └── pkg/                        # Framework-agnostic clients & utilities (21 packages)
│       ├── eid/ google/ xyp/       # Identity: eID RP, Google OAuth, XYP org registry
│       ├── oidc/ jwt/ secrethash/  # OIDC RP client, JWT, Argon2id/PBKDF2 secret hashing
│       ├── oauthproviders/ cloudfiles/  # 3rd-party OAuth + Drive/Dropbox/Meet REST
│       ├── gemini/                 # SDK-free Gemini REST (function calling, audio, PCM→WAV)
│       ├── pdf/ gspace/ verify/    # PAdES signing, SFTP storage, Verify API OTP
│       ├── totp/ recovery/ crypto/ # MFA, backup codes, AES-256-GCM
│       ├── audit/                  # Hash-chained audit (byte-compatible with Go)
│       ├── ctx/ logger/ validators/# Explicit request context, pino logging, zod helpers
│       └── observability/          # OTel tracing + Prometheus metrics setup
├── migrations/                     # Numbered SQL (N_name.up.sql + .down.sql) — UNCHANGED from Go
├── docs/                           # EN/MN docs + generated openapi.json
└── scripts/                        # smoke-esm.mjs (CommonJS/ESM interop gate)
```

> **No `internal/`.** The Go edition used Go's `internal/` visibility rule to keep
> packages private. TypeScript has no such mechanism, so the boundary is enforced
> by **lint rules + review + the dependency direction below** instead of by the
> compiler. Treat "usecases must not import a postgres adapter" as a hard rule
> even though `tsc` will not stop you.

## Dependency Flow

Dependencies flow inward only (Clean Architecture principle):

```
HTTP → Usecase → Repository → Domain
  │        │          │
  ▼        ▼          ▼
 DTO   Interface   pg/SQL
```

- **HTTP Layer** depends on **Usecase** interfaces (`AuthUsecase`, `UsersUsecase`, …).
- **Usecase Layer** depends on **Repository** interfaces
  (`datasources/repositories/interface`), never on postgres adapters.
- **Repository Layer** depends on **Domain** entities.
- **Domain Layer** imports nothing internal — only `node:*` and `bcryptjs`.

`src/usecases/**` and `src/datasources/repositories/**` import **no** Express
type, so the delivery framework can be swapped without touching business code.

The one shared leaf is `pkg/ctx` — it carries the per-request RLS identity,
request ID and `AbortSignal` across all three layers without creating an import
cycle. **Context is explicit**: every repository and usecase takes `ctx: Ctx` as
its first argument. That is the Node equivalent of Go's `context.Context`, and it
makes "forgot to pass the identity" a **compile error** rather than a silent RLS
bypass.

## Key Components

### 1. HTTP Layer

**Composition root:** `src/cmd/api/server/server.ts` — the single manual-DI wiring
point. Read it end-to-end to see every mount. It:

- Initializes tracing, the `pg` pool (with the RLS boot guard), Redis + the in-process cache, the JWT service, and every external client (eID, Google, XYP, OIDC, Gemini, Verify, Gerege Space, Gerege Core).
- Wires repositories → usecases → routes by hand (no global singletons, no DI container).
- Builds the Express app, installs the global middleware stack, and mounts each route module under `/api/v1`.
- Mounts the OIDC-provider surface at the **root** (`/oauth2/*`, `/userinfo`, `/.well-known/*`) — those paths are defined by the spec and cannot live under `/api/v1`.
- Starts the background workers (relay SLA sweep, demo simulators) and owns graceful shutdown (drains HTTP, rate limiters, pg pool, Redis, tracer, workers).

**Routes:** `src/http/routes/` — one file per module (`route_auth.ts`,
`route_gov.ts`, `route_oidc.ts`, …).

!!! warning "Express middleware scope is NOT chi's `Group`"
    In chi, `r.Group(...)` applies middleware only to routes declared inside it.
    Express has no equivalent — `router.use(sub)` runs the sub-router's `use()` for
    **every** request from that point on. So middleware is passed **per route**
    (`auth.post('/eid/start', strict, wrap(h))`), never via `use()` inside a
    module. Getting this wrong silently leaks auth or rate limits onto endpoints
    that must not have them; `route_auth.test.ts` pins the real chain.

**Handlers:** `src/http/handlers/v1/` — one module per domain. The handler
signature is `(req, res) => Promise<void>`, wrapped by `wrap()`; bodies are
decoded and validated in one step with `decodeBody(req, schema)` (zod
`strictObject` — unknown fields are rejected, matching Go's
`DisallowUnknownFields`), and responses go through `newSuccessResponse` /
`respondWithError`.

### 2. Middleware Stack

Global middleware, applied in this order in `server.ts` (order matters — request
ID first so every later log line and the recovery response carry a `request_id`):

1. **Request ID** — generates / propagates `X-Request-ID` into `ctx` + logger.
2. **Client IP** — resolves the caller IP, trusting `X-Forwarded-For` **only** from `TRUSTED_PROXIES` (fail-safe: no trust by default).
3. **Metrics** — Prometheus request counters + latency.
4. **Security headers** — HSTS, CSP (`default-src 'none'` — the API returns JSON), nosniff, frame options, referrer policy.
5. **CORS** — origins from `ALLOWED_ORIGINS` (wildcard only outside production).
6. **Body size limit** — global ceiling; tighter caps per route group.
7. **Body parsers** — `express.raw` for `/relay/webhook` **before** `express.json` (HMAC is verified over the *raw* bytes; a re-serialized body would break the signature), then JSON + urlencoded.
8. **CSRF** — double-submit check on cookie-authenticated mutations (skipped for Bearer requests, which are not ambient).
9. **Access log** — structured one-line access log.
10. **Timeout** — per-request deadline wired to the `ctx` `AbortSignal`.

Registered **last**: the 404 handler and the **recoverer** (Express 5 error
middleware must come after the routes it protects).

**Per-group / per-route middleware:**

- **Auth** — validates the JWT (Bearer **or** the `dgov_access` httpOnly cookie), stashes `CurrentUser`, and **sets the RLS identity**: `withAdmin` for admins, `withUser` otherwise.
- **Service RLS context** — installed on the anonymous `/auth` group so pre-auth flows (eID upsert, refresh identity lookup) run under the trusted `service` RLS role.
- **RBAC** (`requirePermission`, `requireAdmin`, `requireSuperAdmin`) — declarative authorization after auth; admins bypass permission checks. Fail-closed on resolver error.
- **Observability gate** — guards `/metrics` and `/swagger/doc.json` (see [Ops Endpoints](#ops-endpoints)).
- **Rate limiters** — four separate limiters: `/auth` ~5/min, `/ai` ~20/min (burst 10, for translation streams), `/auth/eid/poll` ~120/min (for long-poll), and gov/assets/gspace/eID-profile **writes** ~30/min.

### 3. Usecase Layer

**Location:** `src/usecases/` — each bounded context exposes an interface + an
implementation. Responsibilities: business-rule validation, orchestration of
repository + cache + external clients, and throwing `apperror.*` values (wrapping
internal causes with `apperror.internalCause` so library errors never reach
clients). Usecases depend only on `datasources/repositories/interface`, never on
postgres adapters.

### 4. Repository Layer

**Location:** `src/datasources/repositories/` — `interface/` holds the gateway
abstractions; `postgres/*` implements them with `pg` and hand-written SQL. Key
points:

- Every method takes `ctx` first; rows are plain interfaces with **snake_case keys matching the column names** (`records/`).
- **Parameterized queries only** (`$1, $2 …`) — never string interpolation.
- Soft delete via explicit `deleted_at IS NULL` predicates.
- `store` uses a single round-trip `INSERT … RETURNING`.
- Duplicate keys are detected via PostgreSQL error code `23505` → `apperror.conflict`.
- Per-user repositories run each query inside a **`withRLS` transaction** that publishes the request identity as `SET LOCAL`-scoped GUCs (see [Row-Level Security](#row-level-security-rls)).

### 5. Domain Layer

**Location:** `src/domain/` — entities carry business rules and depend on nothing
internal. `users.ts` defines the role model and the eID user constructor
(`newEIDUser` — passwordless, `active = true`, keyed on `civil_id`). See
[Authorization](#authorization) for the role constants.

## Authentication

The platform issues **JWT access + refresh tokens** (`pkg/jwt`) but has **no
password login, no email/OTP registration, and no password reset**. Identity comes
only from external providers. Endpoint shapes are documented in
[API_CONTRACT.md](API_CONTRACT.md); routes are registered in
`src/http/routes/route_auth.ts` and `route_eidprofile.ts`.

**1. Login with eID (the primary method).** The app is a Relying Party of eID
Mongolia (`pkg/eid`, `EID_*` config):
- `POST /api/v1/auth/eid/start` begins a session and returns a QR code / mobile deep-link.
- `POST /api/v1/auth/eid/start-id` starts by national-ID (реестр), pushing to the citizen's registered device.
- `POST /api/v1/auth/eid/poll` is **long-polled** by the frontend (~every 2.5 s; the IdP is held up to 25 s per poll) until the eID session reaches `COMPLETE`. On completion the user is upserted (keyed on `civil_id`; public RPs receive `civil_id`, not `national_id`) and a token pair is issued.

**2. Google OAuth account-linking** (`pkg/google`, `GOOGLE_*`): `POST
/api/v1/auth/google` exchanges the code and links (or logs in via) a Google account
attached to the eID user; `DELETE /api/v1/auth/google/link` unlinks.

**Session lifecycle** (independent of the login method):
- `POST /api/v1/auth/refresh` rotates the token pair; tokens issued before a credential-change cutoff are rejected (`tokensRevokedBefore`). A `kind` claim guard prevents using a refresh token as an access token.
- **Cookies.** On every session mint the API also sets `dgov_access` / `dgov_refresh` (httpOnly) plus a JS-readable `dgov_csrf`. The token pair stays in the response body too, so Bearer clients are unaffected.
- `POST /api/v1/auth/logout` revokes the refresh token.

> **Note.** The Go edition still carries unrouted handler files (`auth_login.go`,
> `auth_register.go`, `auth_send_otp.go`, `auth_forgot_password.go`,
> `auth_reset_password.go`). Those were **not ported** — dead code should not
> survive a port.
>
> The one exception is `PUT /auth/password/change`: the Go edition had a working
> handler + usecase that was never wired to a route (the frontend's form got a
> 404), so this edition **wires it**. On success it records a revocation cutoff
> and clears the session cookies, forcing a fresh sign-in.

## Authorization

Authorization is enforced at two layers: **JWT role/permission** at the HTTP edge
and **RLS** at the database.

**Role model** (`src/domain/users.ts`; migration `23_superadmin_role`) — four
ranked roles, `1` = highest:

```ts
RoleSuperAdmin = 1; // manages admin users; gated by requireSuperAdmin
RoleAdmin      = 2; // full access; isAdmin() true
RoleManager    = 3;
RoleUser       = 4; // default for new eID users
```

`isAdmin()` returns true for `RoleAdmin` **and** `RoleSuperAdmin` (super admin
inherits the admin JWT/RLS/permission paths); `isSuperAdmin()` is true only for
`RoleSuperAdmin`. Role ID `0` is a sentinel for legacy claim-less tokens and is
downgraded to `RoleUser` by the RBAC middleware.

**Dynamic RBAC** — beyond the coarse role rank, `RBACUsecase` resolves a role's
permission set from the database (migration `8_rbac_roles_permissions`).
`requirePermission(resolver, perm)` gates a route on a named permission; admins
bypass. Super admin is bootstrapped from `SUPERADMIN_EMAIL` (or by DB), never via
API.

## Row-Level Security (RLS)

RLS is the platform's load-bearing per-user isolation boundary — defense-in-depth
beneath the `WHERE user_id = …` clauses the repositories already write. It ensures
that even a query bug cannot return another user's rows.

**Identity on the context** (`src/pkg/ctx/ctx.ts`) — a leaf module carries an
`identity: { userId, role }` where `role` is one of three string constants that
**must** match the SQL policy literals:

- `service` — trusted pre-auth / system flows (eID upsert, refresh identity lookup, bootstrap). Set by `serviceRLSContext()` on `/auth`; full access.
- `admin` — full access to every row. Set by the auth middleware via `withAdmin` for admin JWTs.
- `user` — only the caller's own rows. Set by the auth middleware via `withUser`.

**Publishing the identity** (`src/datasources/drivers/pg.ts`) — the shared
`db.withRLS(ctx, fn)` helper wraps each query in a transaction and runs:

```go
SELECT set_config('app.user_id',   $1, true),   -- is_local = true ⇒ SET LOCAL semantics
       set_config('app.user_role',  $2, true)
```

`set_config(..., true)` scopes the values to the transaction so identity cannot
leak across pooled connections. When the context carries **no** identity, both
GUCs are empty — the empty `app.user_role` matches no policy, so every row is
hidden and every write rejected (**fail-closed**). The `audit` repository uses a
role-only variant.

**Per-table policies** — every RLS-enabled table uses `ENABLE` **and** `FORCE ROW
LEVEL SECURITY` (FORCE applies RLS even to the table owner). Policies are
permissive (OR'd) and recognize the same three GUC roles. The `user` policy gates
on `user_id = NULLIF(current_setting('app.user_id', true), '')::uuid` (the `NULLIF`
turns an empty GUC into `NULL` so the cast never errors and the row is simply
excluded):

| Migration | Table(s) | RLS |
|-----------|----------|-----|
| `7_enable_rls_users`      | `users`                                                                     | ENABLE + FORCE; service / admin / self |
| `14_organizations`        | `organizations`, `organization_memberships`                                 | ENABLE + FORCE; visibility by **membership** |
| `17_org_rls_recursion_fix`| (recreates the org policies)                                                | uses `SECURITY DEFINER` `app_is_org_member()` to break policy recursion (SQLSTATE 42P17) |
| `20_gov_services`         | `gov_applications`, `gov_references`, `gov_notifications`, `gov_payments`, `gov_appointments` | ENABLE + FORCE; service / admin / self. (`gov_services` catalogue is public, no RLS) |
| `21_user_integrations`    | `user_integrations`                                                         | ENABLE + FORCE; service / admin / self |

Global config tables are deliberately **not** RLS-protected; their DB backstop is
table-privilege `REVOKE`s against the `app_user` role
(`17_least_privilege_config_grants` for `permissions` / `role_permissions` /
`ai_prompts` / `ai_knowledge`; `27_site_appearance` for the singleton appearance
row). The provider tables (`26_sso_provider`: `developer_apps`, `admin_api_keys`,
`login_events`) and `org_stamps` (`25`) are also non-RLS, guarded in the
usecase/handler layer.

**Boot-time enforceability guard** — RLS is silently bypassed by Postgres
superusers and `BYPASSRLS` roles, so `guardRLSEnforceable`
(`src/datasources/drivers/pg.ts`) inspects `pg_roles` for the
connecting role at startup:

- If the role has `rolsuper` or `rolbypassrls`: **production fails closed** (boot aborts, pool closed); **development logs a warning** and continues (migrate/tests may run as superuser).
- The api must therefore connect as a least-privilege non-superuser role (e.g. `app_user`) in production. (The compose stack runs `ENVIRONMENT=development` on purpose, so the guard only hard-fails in production.)

## OIDC Provider (built in — no Ory Hydra)

The platform can itself act as an **Identity Provider**: other government apps
delegate login to it. **Ory Hydra has been removed** — the provider is implemented
in-repo (`src/usecases/oidc` + `src/usecases/provider` + the `oauth_clients`,
`oauth_flow` and `oauth_keys` tables). The surface activates when `OAUTH_ISSUER`
and `SSO_STATE_KEY` are set; otherwise it stays inert.

- **Spec endpoints** are mounted at the **root**, not under `/api/v1`, because the OIDC spec fixes them: `GET /oauth2/auth`, `POST /oauth2/token`, `POST /oauth2/introspect`, `POST /oauth2/revoke`, `GET /oauth2/sessions/logout`, `GET|POST /userinfo`, `GET /.well-known/openid-configuration`, `GET /.well-known/jwks.json`.
- **Login / consent / logout core** — `usecases/provider` drives the challenge flow; first-party clients (`SSO_FIRSTPARTY_CLIENTS`) skip the consent UI. Mounted under `/api/v1/provider`.
- **Applications (client registry)** — `usecases/applications` (`/api/v1/applications`, guarded by `gateway.manage`) registers OAuth2 clients: RP apps (`web`/`spa`/`native` → `authorization_code`; `spa`/`native` are public → PKCE, no secret) and m2m clients (`client_credentials`). Per-service access is expressed as OAuth scopes (`application_services` → `gateway_services.scope`); a confidential `client_secret` is revealed **once** on create/rotate and stored only as an Argon2id hash.
- **Signing keys** — `usecases/oidc/keys.ts` manages RSA-2048 keys whose `kid` is the RFC 7638 thumbprint. Private keys are stored **AES-256-GCM encrypted**; rotation keeps the old public key in JWKS so tokens in flight still verify.

**Security properties worth knowing** (all covered by tests):

- `redirect_uri` is matched **exactly** — never by prefix or wildcard. If the client or redirect is invalid the error is **not** redirected back to the RP, so redirecting to an unverified address is structurally impossible.
- PKCE is mandatory for public clients, and only `S256` is accepted.
- An authorization code is **single-use**: replaying one revokes every token for that subject+client pair. Replaying a *refresh* token revokes the whole token **family** (RFC 9700 §4.14.2).
- The client's declared auth method is enforced strictly (no downgrade); public clients cannot call introspect/revoke.
- `google` claims are only released with the `google` scope (data minimization).

> **Enforcement caveat (unchanged from the Go edition).** Assigning services to an
> application sets that client's OAuth **scopes** — that is registration/config
> only. *Runtime* per-request enforcement would need a gateway proxy that
> introspects the presented token against each route's service scope, and that
> proxy **does not exist yet**. Do not mistake the assignment for enforced authz.

## Database

- **Driver:** [node-postgres](https://node-postgres.com/) (`pg`) with a connection pool, hand-written SQL — **no ORM**.
- **Database:** PostgreSQL, with **Row-Level Security** as the per-user boundary.
- **Migrations:** numbered SQL files in `migrations/` (`N_name.up.sql` + `.down.sql`), applied by the `migrate` compose service / `src/cmd/migration`. The files are **byte-identical to the Go edition** — the same database serves either. There is **no AutoMigrate**; the schema comes only from the `*.up.sql` files. The runner is advisory-locked and idempotent, so concurrent boots are safe.
- **Tracing:** OpenTelemetry via `@opentelemetry/auto-instrumentations-node` (instruments `pg` and HTTP automatically).

> **Migration-numbering collision.** Two migrations share the prefix `17_`:
> `17_least_privilege_config_grants` and `17_org_rls_recursion_fix`. They are
> independent and both applied; the runner orders numbered files, so keep this in
> mind when adding an `18_`-and-up migration or reasoning about apply order.

### Connection Management

Pool configured from env (`src/datasources/drivers/pg.ts`, `setupPostgres`):

```ts
max:                 AppConfig.DB_MAX_OPEN_CONNS,            // default 25
min:                 AppConfig.DB_MAX_IDLE_CONNS,            // default 5
maxLifetimeSeconds:  AppConfig.DB_CONN_MAX_LIFE_MINS * 60,   // default 15 min
idleTimeoutMillis:   5 * 60 * 1000,
```

Production requires a TLS-verified DSN (`sslmode=verify-full` or `verify-ca`) —
enforced by the config guard.

## Observability

### Logging
- **Library:** [pino](https://getpino.io/) (structured), via `pkg/logger`. JSON in production, pretty in development. Request ID + trace ID propagated through the `*WithContext` helpers, which take `ctx` explicitly.

### Metrics
- **Library:** `prom-client`, endpoint `GET /metrics` (gated — see [Ops Endpoints](#ops-endpoints)). HTTP request counters/latency, cache hit/miss/error per layer, OTP send outcomes, and live `pg` pool stats.

### Tracing
- **Library:** OpenTelemetry; exporter selected by `OTEL_EXPORTER` (empty = noop, `stdout`, or `otlp`), sampling by `OTEL_SAMPLE_RATIO`.

## Ops Endpoints

| Endpoint | Access |
|----------|--------|
| `GET /health` | Open — liveness (for load balancers / orchestrators). |
| `GET /ready`  | Open — readiness: DB ping (`pg` pool) + Redis probe. |
| `GET /metrics` | **Gated** by `ObservabilityGate`. |
| `GET /swagger/doc.json` | **Gated** by `ObservabilityGate`. |

`observabilityGate` (`src/http/middlewares/observability_gate.ts`) protects the two
operator-sensitive endpoints: in **development** they are always open; in
**production** they require `Authorization: Bearer <OBSERVABILITY_TOKEN>` (constant-time
compared) and return **404** — not 401 — on any mismatch or when
`OBSERVABILITY_TOKEN` is unset, so their very existence stays hidden from
reconnaissance.

## Security Features

| Feature            | Implementation                            | Location |
|--------------------|-------------------------------------------|----------|
| Row-Level Security | per-user DB isolation + boot guard        | `pkg/ctx`, `datasources/drivers/pg.ts`, migrations `7/14/20/21` |
| Auth (identity)    | eID RP + Google OAuth                     | `usecases/auth`, `pkg/{eid,google}` |
| Session transport  | httpOnly cookies + double-submit CSRF     | `http/cookies.ts`, `http/middlewares/csrf.ts` |
| Authorization      | 4-role model + dynamic RBAC               | `domain/users.ts`, `http/middlewares/rbac.ts` |
| Security headers   | API: `default-src 'none'`; SPA: full CSP  | `http/middlewares/security.ts`, `frontend/nginx-security-headers.conf` |
| CORS               | env whitelist, wildcard dev-only          | `http/middlewares/cors.ts` |
| Rate limiting      | per-IP (auth / ai / poll / gov-write)     | `http/middlewares/ratelimit.ts` |
| Body size limit    | global + tighter caps on `/auth`          | `http/middlewares/bodysizelimit.ts` |
| Ops-endpoint gate  | bearer token, 404 in prod                 | `http/middlewares/observability_gate.ts` |
| Input validation   | zod `strictObject` (unknown fields → 422) | `http/dto/requests/` |
| Encrypted secrets  | AES-256-GCM (OAuth tokens, TOTP, OIDC keys)| `pkg/crypto`, `usecases/integrations` (`INTEGRATION_ENC_KEY`) |
| Secret hashing     | Argon2id (+ Hydra PBKDF2 verify)          | `pkg/secrethash` |
| SQL injection      | parameterized queries only (`$1, $2 …`)   | `datasources/repositories/postgres/` |
| PDF signing        | PAdES via server Document-Signer cert     | `usecases/sign` (`SIGN_SIGNER_*`) |
| Supply chain       | ESM import smoke over every module        | `scripts/smoke-esm.mjs` (CI gate) |

## API Design

All API routes live under `/api/v1`; each module mounts `/v1/<module>`:
`auth`, `users`, `users/me/eid`, `me` (assets), `rbac`, `org`, `gov`, `registry`,
`catalog`, `relay`, `integrations`, `gspace`, `gateway`, `core`, `sso`, `admin`,
`superadmin`, `ai`, `audit`, `security`, `site`, `themes`, `sign`, `provider` and
`applications`. Infra endpoints (`/health`, `/ready`, `/metrics`, `/swagger`) and
the **OIDC spec endpoints** (`/oauth2/*`, `/userinfo`, `/.well-known/*`) sit at the
root. **Full endpoint tables live in [API_CONTRACT.md](API_CONTRACT.md)** and the
generated OpenAPI spec (`docs/openapi.json`, served at `/swagger`).

The spec is **drift-checked in CI**: add or change a route/DTO without running
`npm run openapi` and the build fails.

### Response Format

A single envelope (`src/http/response.ts`):

**Success**
```json
{ "status": true, "message": "login success", "data": { }, "request_id": "…" }
```

**Error**
```json
{ "status": false, "message": "user not found", "request_id": "…" }
```

**Validation error (422)**
```json
{ "status": false, "message": "validation failed",
  "data": { "errors": { "national_id": "national_id is required" } }, "request_id": "…" }
```

Domain errors (`src/apperror`) map to status codes: NotFound→404,
Unauthorized→401, Forbidden→403, Conflict→409, BadRequest→400, Internal→500.
5xx causes are logged and replaced with a generic message in the body.

## Testing Strategy

- **Unit tests** — usecase + handler layers with hand-written [vitest](https://vitest.dev/) mocks (plain object literals typed to the repository interface — no codegen). Fast, no Docker: `npm test`. **775 tests across 45 files.**
- **Integration tests** — repositories (including RLS policies) against a real Postgres + Redis via [testcontainers](https://testcontainers.com/): `npm run test:integration` (needs Docker).
- **Route-wiring tests** — Express's middleware scope differs from chi's `Group`, so `route_*.test.ts` boots the real router and asserts which middleware actually runs on which path.
- **Byte-compatibility vectors** — the audit hash chain and Argon2id secret hashing are pinned against **reference vectors produced by the Go edition**, so both editions can share one database during a migration.
- **ESM import smoke** — `scripts/smoke-esm.mjs` imports every built module (219) to catch CommonJS/ESM interop breakage that type-checking cannot see.

## Configuration

Loaded from `.env` / environment by a hand-written loader (`src/config/config.ts`;
see `backend/.env.example`) — no Viper equivalent, just an explicit parser plus a
guard that enforces production invariants (TLS DSN, `ALLOWED_ORIGINS`,
`VERIFY_API_KEY`, JWT secret length, RLS role). Selected keys:

| Group | Variables |
|-------|-----------|
| **Server** | `PORT`, `ENVIRONMENT` (`development`/`production`), `DEBUG` |
| **Database** | `DB_POSTGRE_DRIVER`, `DB_POSTGRE_DSN` (dev), `DB_POSTGRE_URL` (prod; `sslmode=verify-full`/`verify-ca`), `DB_MAX_OPEN_CONNS` (25), `DB_MAX_IDLE_CONNS` (5), `DB_CONN_MAX_LIFE_MINS` (15) |
| **JWT** | `JWT_SECRET` (≥32), `JWT_EXPIRED` (h, 1–24), `JWT_ISSUER`, `JWT_REFRESH_EXPIRED` (d, 7) |
| **Redis** | `REDIS_HOST`, `REDIS_PASS`, `REDIS_EXPIRED` (min) |
| **Crypto** | `BCRYPT_COST` (12) |
| **Verify (OTP)** | `OTP_MAX_ATTEMPTS` (5), `VERIFY_API_BASE`, `VERIFY_API_KEY` (prod required), `VERIFY_CHANNEL` |
| **eID** | `EID_BASE_URL` (`…/v3`), `EID_RP_UUID`, `EID_RP_NAME`, `EID_RP_SECRET`, `EID_CERT_LEVEL` (ADVANCED), `EID_CALLBACK_URL`, `EID_DISPLAY_TEXT`, `SIGN_RELAY_TOKEN` |
| **Sign** | `SIGN_SIGNER_CERT_FILE`, `SIGN_SIGNER_KEY_FILE` (prod fail-closed) |
| **Google OAuth** | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| **XYP** | `XYP_API_BASE` (`https://xyp.dgov.mn`), `XYP_CLIENT_ID`, `XYP_CLIENT_SECRET` |
| **Gerege Space** | `GSPACE_HOST`, `GSPACE_PORT` (22), `GSPACE_USER`, `GSPACE_PASSWORD`, `GSPACE_BASE_PATH` (gerege-space), `GSPACE_QUOTA_BYTES` (2 MB) |
| **Gemini AI** | `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_TTS_MODEL`, `GEMINI_VOICE`, `GEMINI_API_BASE`, `AI_SCOPE_PROMPT` |
| **Gerege Core** | `CORE_API_BASE` (`https://core.gerege.mn`), `CORE_API_TOKEN` |
| **Integrations** | `INTEGRATION_ENC_KEY` (AES-256-GCM; prod required) |
| **OIDC Provider (built in)** | `OAUTH_ISSUER`, `SSO_STATE_KEY` (≥32), `SSO_FIRSTPARTY_CLIENTS` — **no Hydra variables** |
| **3rd-party integrations** | `APP_ORIGIN`, `GOOGLE_DRIVE_CLIENT_ID`/`_SECRET`, `DROPBOX_CLIENT_ID`/`_SECRET`, `GOOGLE_MEET_CLIENT_ID`/`_SECRET` |
| **Cookies** | `COOKIE_SECURE` (unset ⇒ Secure in production) |
| **Observability** | `OTEL_EXPORTER` (``/`stdout`/`otlp`), `OTEL_SAMPLE_RATIO`, `OBSERVABILITY_TOKEN` |
| **Networking** | `ALLOWED_ORIGINS` (prod required), `TRUSTED_PROXIES` |
| **Bootstrap** | `SUPERADMIN_EMAIL` |

## Deployment

```bash
cd backend && npm run build    # tsc → dist/
docker compose up -d --build   # db + redis + migrate (one-off) + api + web
```

Health check: `curl http://localhost:8080/health`. See `docs/DEPLOYMENT.md` for
the deployment topology, and `npm run pre-push` to mirror the full CI gate
locally (fmt · lint · typecheck · test · OpenAPI drift · build · ESM smoke).

## Credits & License

This platform builds on open-source work:

| Project | Author | License | What we used |
|---------|--------|---------|--------------|
| [snykk/go-rest-boilerplate](https://github.com/snykk/go-rest-boilerplate) | Najib Fikri | MIT | Clean Architecture layering, caching, observability, and test strategy |

The lineage is: the boilerplate's delivery layer went **Gin → chi (net/http)** and
its data layer **sqlx → pgx** in the Go edition; this edition then ported those to
**Express 5** and **node-postgres (`pg`)**. What survived across all three is the
*shape* — the layering, the caching strategy, the observability wiring and the test
strategy. The auth stack, RLS security model, eID/SSO/OIDC-provider integrations
and the feature modules were built for this platform. As an MIT derivative the
upstream copyright notice is retained and this code is distributed under the MIT
License (see `LICENSE`).

---

**Government Template Platform V3.0** — Co-developed by the **Gerege Systems Development Team** and **Claude AI**, 2026.
