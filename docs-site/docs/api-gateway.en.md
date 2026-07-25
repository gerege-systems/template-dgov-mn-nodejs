# API Gateway

The API Gateway is a **service catalog + telemetry**, managed from the admin
system. Each exposed service (e.g. the eID proxy) is registered in the catalog and
granted to apps with per-app authorization.

## Service catalog

| Service | Path | Type | Authorization |
|---|---|---|---|
| **SSO login** | `/oauth2` | Base (built-in) | Automatic for all apps |
| **`eid-sign`** | `/rp/sign` | Add-on | Per-app grant |
| **`eid-proxy`** | `/rp/eid` | Add-on | Per-app grant |
| **`eid-org-proxy`** | `/rp/eid-org` | Add-on | Per-app grant |

!!! note "SSO login is not in the catalog"
    SSO sign-in is a **base** service — served to every registered app
    automatically via the base OIDC scopes, so it needs no grant/checkbox. It is
    therefore not shown as a grantable gateway service.

## Managing services (Admin)

In **Admin → Gateway → Services** you list, create, edit, and **enable/disable**
services. Creating a service automatically derives an `svc:<name>` scope so it can
be granted to apps.

- The **enabled** flag takes effect at runtime: the eID proxy route checks whether
  the service is enabled and returns `503` when disabled.

## Granting a service to an app

In **Admin → Applications → the app → SERVICES**, grant services via checkboxes.
Granting adds `svc:<name>` to the app's OAuth2 client allowed scope; revoking
removes it. This is **immediate** — the proxy checks the client's current grant.

```text
App "template.dgov.mn"
  ├─ SSO login .............. automatic (built-in)
  ├─ [x] eid-sign ........... svc:eid-sign
  ├─ [ ] eid-proxy .......... not granted → /rp/eid → 403
  └─ [ ] eid-org-proxy ...... not granted → /rp/eid-org → 403
```

## Telemetry

The gateway records real requests to `/api` (method, path, status, latency) and
shows them under **Admin → Gateway → Overview / Logs**.

## Adding a new proxy service (developers)

Use this pattern to add other internal services to the gateway and manage them
from admin:

1. Seed a `gateway_services` row (migration) — name, path, tags.
2. Check the runtime toggle on the route via `gatewayUC.ServiceEnabled(name)`.
3. Check the `svc:<name>` grant in the OAuth middleware.
4. Add a public path in nginx (`/rp/<name>/` → backend).
