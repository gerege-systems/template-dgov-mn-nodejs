# Government Template Platform V3.0

> **The foundation to build digital governance** — a production-ready,
> security-hardened full stack for building any digital-government service on top.

**Government Template Platform V3.0** is the *foundation on which digital
governance is built*. You build the value, not the plumbing — identity, security,
AI and service scaffolding come solved from day one.

!!! tip "Open Source"
    This platform is an **open-source** project — read the full source, fork it,
    and run it for your own organization.
    :material-github: [View on GitHub](https://github.com/gerege-systems/template-dgov-mn)

<div class="grid cards" markdown>

- :material-shield-key: **eID + Government SSO**  
  Electronic-ID (eID) based sign-in + an OpenID Connect (built-in Go provider)
  SSO provider. Apps connect with a single tap.

- :material-layers: **Clean Architecture**  
  Go (chi · net/http · pgx, no ORM) backend + Next.js 15 BFF frontend. Clear
  layers, easy to extend.

- :material-account-network: **eID Service Proxy**  
  Registered apps call the SSO's eID services by authorization (proxy) — they
  never need to hold eID credentials themselves.

- :material-tune: **Admin-managed API Gateway**  
  Service catalog, per-app authorization, telemetry — all from the admin system.

</div>

## The ecosystem

The platform is composed of several independent services:

| Domain | Role |
|---|---|
| **sso.dgov.mn** | Government SSO — OIDC provider + eID Relying Party (holds the eID credentials) |
| **template.dgov.mn** | Example app — a relying party of Government SSO (signs in via SSO) |

Apps (such as `template.dgov.mn`) sign in through **sso.dgov.mn** and call the
authorized eID services via a proxy. Only the SSO holds the RP credentials that
talk to eID Mongolia, so apps are freed from that security burden.

## Key capabilities

- **Authentication** — eID (QR / App2App / national-ID push) + Google linking + Government SSO (OIDC).
- **OIDC provider** — built on its own Go code; apps `Sign in with Government SSO`.
- **eID PKI profile** — organizations, certificates, devices, activity.
- **Document signing (PAdES)** — third-party apps sign through the eID sign relay.
- **eID Service Proxy** — personal (`eid-proxy`) and organization (`eid-org-proxy`), separately.
- **API Gateway** — service catalog, per-app authorization, request telemetry.
- **AI assistant (Gemini)** — chat, voice, translation.
- **RBAC & super admin**, **audit log**, **security hardening** (RLS, CSP, HSTS, CSRF).

!!! tip "Where to start?"
    To connect your app to Government SSO, see [App integration](sso-integration.md).
    To fetch eID data through the proxy, see [eID Service Proxy](eid-services.md).
