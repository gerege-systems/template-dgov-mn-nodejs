# Deployment Guide — Node.js edition

> 🌐 **English** · [Монгол](DEPLOYMENT_MN.md)

How to deploy the **Government Template Platform V3.0 — Node.js edition** to a
single VPS with Docker Compose behind nginx. The worked example is this edition's
reference deployment, **[node.template.dgov.mn](https://node.template.dgov.mn)**.
The stack is Postgres + Redis + Node/Express API + React web.

## Topology

Two host loopback ports are published; nginx terminates TLS and reverse-proxies
each to the right container. `db` and `redis` never leave the internal compose
network.

```
Internet ──► nginx (80/443, TLS via Let's Encrypt)
   │
   ├─ /rp/sign/*  (eID sign relay for 3rd-party Relying Parties)
   │      ─────────────────────────► api  127.0.0.1:${API_PORT}   (backend :8080)
   │
   └─ everything else — app + BFF /api/*
          ─────────────────────────► web  127.0.0.1:${WEB_PORT}   (:3000)
                                       │ BACKEND_URL=http://api:8080
                                       ▼
   internal compose network (no public host ports):
        api ──► db (Postgres 16) + redis (7)
        migrate (one-off) — applies SQL, then exits
```

The OIDC provider is **part of the api** (`usecases/oidc` + the `oauth_clients`
table) — there is no separate Ory Hydra container. `/oauth2/*`, `/userinfo` and
`/.well-known/*` are served by the api once `OAUTH_ISSUER` is set; route them to
the api upstream when you enable the provider.

> **Frontend note.** While the Vite + React SPA conversion is landing, `web` is the
> Next.js BFF container and the topology above is correct as written. Once the SPA
> ships, `web` becomes static files and nginx proxies `/api/*` straight to the api —
> see [ROADMAP.md](../ROADMAP.md).

## Prerequisites

- A VPS with Docker + the compose plugin (`docker compose version`)
- nginx + certbot on the host (or any reverse proxy that terminates TLS)
- A DNS A record for `node.template.dgov.mn` pointing at the server

## 1. Get the code

```bash
git clone https://github.com/gerege-systems/template-dgov-mn-nodejs.git /srv/template-dgov-mn-nodejs
cd /srv/template-dgov-mn-nodejs
```

## 2. Create the two env files (both gitignored)

### `./.env` — compose interpolation

```env
# --- Postgres / Redis ---
POSTGRES_USER=postgres            # superuser — used by migrate only
POSTGRES_PASSWORD=<random>
POSTGRES_DB=gerege_template
APP_DB_USER=app_user              # least-privilege role the api connects as
APP_DB_PASSWORD=<random>
APP_DB_DSN=postgres://app_user:<same>@db:5432/gerege_template?sslmode=disable
REDIS_PASS=<random>

# --- App / origin ---
APP_ORIGIN=https://node.template.dgov.mn   # exact public origin (CSRF origin check)
WEB_PORT=3012                     # loopback port nginx proxies the app to
API_PORT=8085                     # loopback port nginx proxies /rp/sign (+ /oauth2) to

# --- OAuth client IDs/secrets used by the web layer (empty = that button inert) ---
GOOGLE_CLIENT_ID=<…>              # Google account-linking (also set in backend.env)
GOOGLE_DRIVE_CLIENT_ID=<…>        # third-party integrations
GOOGLE_DRIVE_CLIENT_SECRET=<…>    # redirect_uri = ${APP_ORIGIN}/api/integrations/<provider>/callback
DROPBOX_CLIENT_ID=<…>
DROPBOX_CLIENT_SECRET=<…>
GOOGLE_MEET_CLIENT_ID=<…>
GOOGLE_MEET_CLIENT_SECRET=<…>
```

Pick loopback ports that are free on the host — this server already runs several
platform deployments (`3008`–`3011` / `8081`–`8084`), hence `3012` / `8085` here.

### `./backend.env` — mounted into `api` + `migrate` at `/app/.env`

This is the backend config file. The full, commented schema is
[`backend/.env.example`](../backend/.env.example) — copy it and fill in secrets.
The load-bearing keys:

```env
# --- Core runtime ---
PORT=8080
ENVIRONMENT=development           # the compose stack runs dev mode: the internal DB
                                  # has no TLS (the prod guard requires
                                  # sslmode=verify-full); TLS terminates at nginx
DEBUG=false
DB_POSTGRE_DRIVER=postgres
DB_POSTGRE_DSN=postgres://postgres:<POSTGRES_PASSWORD>@db:5432/gerege_template?sslmode=disable
                                  # ^ superuser DSN — used by MIGRATE (DDL).
                                  # The api overrides this with APP_DB_DSN (see §3).
JWT_SECRET=<≥32 random chars>
JWT_EXPIRED=5                     # hours (1–24)
JWT_REFRESH_EXPIRED=7             # days
JWT_ISSUER=node.template.dgov.mn
BCRYPT_COST=12
OTP_MAX_ATTEMPTS=5
REDIS_HOST=redis:6379
REDIS_PASS=<same as .env>
REDIS_EXPIRED=5                   # minutes
ALLOWED_ORIGINS=https://node.template.dgov.mn
TRUSTED_PROXIES=172.16.0.0/12,127.0.0.1   # trust XFF only from the docker net + nginx.
                                  # REQUIRED behind the proxy: the api has no public
                                  # app port, so requests arrive from the web/nginx
                                  # peer. Without a trusted-proxy list the api ignores
                                  # X-Forwarded-For and all per-IP rate limits collapse
                                  # into one bucket.

# --- eID Relying Party (the ONLY interactive login method) ---
EID_BASE_URL=https://eidmongolia.mn/v3
EID_RP_UUID=<RP UUID issued by eID Mongolia>
EID_RP_NAME=template-node-web
EID_RP_SECRET=<RP secret>
EID_CERT_LEVEL=ADVANCED           # ADVANCED for login (QUALIFIED/QSCD for signing)
EID_CALLBACK_URL=https://node.template.dgov.mn/login/verify   # allowlisted at the IdP
EID_DISPLAY_TEXT=node.template.dgov.mn

# --- GeregeCloud Verify (all email/SMS OTP; no SMTP anywhere) ---
VERIFY_API_BASE=https://verify.gecloud.mn/v1
VERIFY_API_KEY=<key>              # REQUIRED when ENVIRONMENT=production

# --- Google OAuth (eID account-linking; server-side code exchange) ---
GOOGLE_CLIENT_ID=<…>
GOOGLE_CLIENT_SECRET=<…>

# --- Government SSO consumer (sso.dgov.mn OIDC) ---
SSO_ISSUER=https://sso.dgov.mn
SSO_CLIENT_ID=<…>
SSO_CLIENT_SECRET=<…>
SSO_REDIRECT_URI=https://node.template.dgov.mn/sso/callback
SSO_SCOPE=openid profile email eid offline_access nationalid

# --- OIDC PROVIDER side (this platform as an issuer) ---
OAUTH_ISSUER=https://node.template.dgov.mn   # no trailing slash — it is the `iss` claim
SSO_STATE_KEY=<≥32 random chars>             # login/consent state HMAC key
SSO_FIRSTPARTY_CLIENTS=<csv client_ids>      # skip the consent screen for these
SSO_ADMIN_API_KEYS=<csv bootstrap keys>
SSO_ADMIN_SUBS=<csv eid_subs>

# --- Gerege platform services (all optional) ---
XYP_API_BASE=https://xyp.dgov.mn      # org lookup (HTTP Basic)
XYP_CLIENT_ID=<…>
XYP_CLIENT_SECRET=<…>
CORE_API_BASE=https://core.gerege.mn
CORE_API_TOKEN=<service bearer>
GSPACE_HOST=<sftp host>               # Gerege Space per-user SFTP storage
GSPACE_USER=<…>
GSPACE_PASSWORD=<…>
GSPACE_HOST_KEY=<ssh-ed25519 AAAA…>   # REQUIRED in production (MITM protection)

# --- Encryption / signing / observability ---
INTEGRATION_ENC_KEY=<≥32 random chars>  # AES-256-GCM key for stored OAuth tokens + TOTP
SIGN_RELAY_TOKEN=<shared token>         # enables /rp/sign relay (empty = off)
SIGN_SIGNER_CERT_FILE=/app/certs/signer.crt   # PAdES signer (prod: REQUIRED, fail-closed;
SIGN_SIGNER_KEY_FILE=/app/certs/signer.key    #  dev falls back to self-signed)
OBSERVABILITY_TOKEN=<random>            # bearer for /metrics + /swagger/doc.json in prod
GEMINI_API_KEY=<AIza…>                  # AI features; empty = AI endpoints return 500
RELAY_DEMO_MODE=false                   # off in production — real platforms call back
```

### Registering as an RP on Government SSO

`sso.dgov.mn` does **not** support dynamic registration (RFC 7591) — the client is
created once through the SSO side's operator API. This deployment is already
registered:

| Field | Value |
|---|---|
| `client_id` | `node-template-dgov-mn` |
| `redirect_uri` | `https://node.template.dgov.mn/sso/callback` |
| post-logout | `https://node.template.dgov.mn/` |
| scope | `openid profile email eid offline_access nationalid` |
| auth method | `client_secret_basic` |
| grants | `authorization_code`, `refresh_token` |

The `redirect_uri` is matched **exactly**, so `SSO_REDIRECT_URI` and the
registration must agree character for character. The SPA **must** have a
`/sso/callback` route — without it the catch-all swallows `?code` and login fails
silently.

Re-register / rotate the secret (from the SSO host, with an admin API key):

```bash
# List registrations
curl -H "X-API-Key: $KEY" http://127.0.0.1:8081/admin/api/v1/clients

# Rotate — the NEW secret is returned ONCE
curl -X POST -H "X-API-Key: $KEY" \
  http://127.0.0.1:8081/admin/api/v1/clients/node-template-dgov-mn/rotate-secret
```

Put the new secret in the `SSO_CLIENT_SECRET` GitHub secret and the next deploy
writes it into `backend.env` (`deploy/deploy.sh`); same for `SSO_CLIENT_ID`. If
neither is provided the deploy leaves the server's values untouched.



Generate secrets with `openssl rand -base64 48`.

**File permissions matter.** The api image runs as the distroless `nonroot` user
(uid **65532**), and `backend.env` is bind-mounted into it. A root-owned `chmod
600` file is unreadable to that user and the container exits with
`failed to load config file: .env: EACCES`. Keep the file private *and* readable
by the container:

```bash
chown 65532:65532 backend.env && chmod 600 backend.env
```

**`INTEGRATION_ENC_KEY` is write-once.** Rotating it makes every previously
encrypted value (stored OAuth tokens, superadmin TOTP secrets) undecryptable. The
CD workflow writes it into `backend.env` only if the key is absent, so it never
changes behind your back.

## 3. Why two DB roles (read before first boot)

Row-Level Security is **silently bypassed** by superusers. The stack therefore
uses two roles:

- `migrate` connects as `POSTGRES_USER` (superuser — needed for
  `CREATE EXTENSION` and RLS DDL).
- `api` connects as `APP_DB_USER` (`NOSUPERUSER NOBYPASSRLS`), created
  automatically by `backend/deploy/initdb/10-create-app-user.sh` **on first init
  of an empty data volume**.

The api **verifies this at boot**: if its role is superuser/`BYPASSRLS` it refuses
to start in production mode and logs a warning in development mode. Deploying onto
an *existing* database? Create the app role and grants by hand (see the initdb
script) and point `APP_DB_DSN` at it.

## 4. First deploy

```bash
docker compose up -d --build      # builds api+web, runs migrate, starts everything
docker compose ps                 # expect: db/redis/api/web healthy, migrate Exited (0)
```

### nginx vhost (host)

```nginx
upstream node_tpl_web { server 127.0.0.1:3012; }   # = WEB_PORT
upstream node_tpl_api { server 127.0.0.1:8085; }   # = API_PORT (api :8080)

server {
    server_name node.template.dgov.mn;

    # eID sign relay for 3rd-party Relying Parties → api
    location /rp/sign/ { proxy_pass http://node_tpl_api; include /etc/nginx/proxy_params; }

    # OIDC protocol endpoints → api (only once OAUTH_ISSUER is configured)
    # location /oauth2/                          { proxy_pass http://node_tpl_api; include /etc/nginx/proxy_params; }
    # location = /userinfo                       { proxy_pass http://node_tpl_api; include /etc/nginx/proxy_params; }
    # location /.well-known/openid-configuration { proxy_pass http://node_tpl_api; include /etc/nginx/proxy_params; }

    location / {
        proxy_pass http://node_tpl_web;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Put the shared `proxy_set_header` lines in `/etc/nginx/proxy_params` and `include`
them. Then `certbot --nginx -d node.template.dgov.mn` for TLS. The compose file
sets `COOKIE_SECURE=true`, so the site **must** be served over HTTPS or browsers
will drop the auth cookies.

## 5. Updating a running deployment

```bash
cd /srv/template-dgov-mn-nodejs
git pull --ff-only origin main
docker compose build              # api + web + migrate
docker compose up -d              # recreates changed containers; migrate re-runs
                                  # (already-applied migrations are skipped)
```

`db` and `redis` keep running — data is untouched. Config-only change? Edit
`backend.env` / `.env` and `docker compose up -d api web`.

### Automated deploys (CI/CD)

Deploy is **not** a job inside CI. Two workflows chain:

1. [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) — the pre-flight gates
   (`backend`, `frontend`, `secrets-scan`) run on every push to `main` and every PR.
2. [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) — a **separate**
   workflow triggered by `workflow_run` **after CI completes**, so a red build never
   ships. It only deploys when the chained CI run concluded `success` on `main` (or
   on manual `workflow_dispatch`). It SSHes into the VPS, `git reset --hard` to the
   exact CI-passed commit, and runs [`deploy/deploy.sh`](../deploy/deploy.sh)
   (rebuild → `up -d` → wait-for-healthy → prune).

One-time setup — add these repo secrets under **Settings → Secrets and variables →
Actions**:

| Secret | Value |
|--------|-------|
| `DEPLOY_HOST` | the VPS IP / hostname |
| `DEPLOY_USER` | SSH user that owns the repo checkout and can run docker |
| `DEPLOY_PATH` | repo path on the server (e.g. `/srv/template-dgov-mn-nodejs`) |
| `DEPLOY_SSH_KEY` | **private** key of a dedicated deploy keypair; its public key is in the server's `~/.ssh/authorized_keys` |
| `INTEGRATION_ENC_KEY` | AES-GCM key; written into `backend.env` once, on first deploy |
| `DEPLOY_SSH_PORT` | *(optional)* SSH port, defaults to `22` |

Generate the keypair with `ssh-keygen -t ed25519 -f deploy_key -N ''`, append
`deploy_key.pub` to the deploy user's `authorized_keys`, and paste the private
`deploy_key` into `DEPLOY_SSH_KEY`. You can trigger a deploy without a code change
from the Actions tab (**Run workflow**), or run `bash deploy/deploy.sh` on the
server by hand.

## 6. Verify

```bash
docker compose ps                                                  # all healthy / migrate Exited(0)
docker logs template-dgov-mn-nodejs-migrate-1 | tail -3             # "migration [up] success"
docker logs template-dgov-mn-nodejs-api-1 2>&1 | grep -i error      # should be empty
curl -s -o /dev/null -w '%{http_code}\n' https://node.template.dgov.mn/   # 200
curl -s http://127.0.0.1:8085/ready                                 # {"status":true,"checks":{…}}
```

## 7. Rollback

```bash
git log --oneline                 # find the last good commit
git reset --hard <commit>
docker compose build && docker compose up -d
```

SQL migrations are forward-only in this flow; if a migration must be reverted,
apply the matching `N_*.down.sql` by hand before rolling the code back past it.

## Secrets hygiene

- `.env` and `backend.env` are gitignored — never commit them.
- Rotate `JWT_SECRET` to force-logout everyone (all tokens invalidate).
- **Never** rotate `INTEGRATION_ENC_KEY` on a live deployment — see §2.
- Rotate `GEMINI_API_KEY`, the OAuth credentials, `EID_RP_SECRET` and
  `CORE_API_TOKEN` from their consoles, update `backend.env`, then
  `docker compose up -d api web`.

---

**Government Template Platform V3.0** — Co-developed by the **Gerege Systems
Development Team** and **Claude AI**, 2026.
