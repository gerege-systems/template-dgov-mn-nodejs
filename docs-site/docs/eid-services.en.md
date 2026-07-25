# eID Service Proxy

Registered apps call **Government SSO's** eID services on behalf of their users
via a **proxy**. The SSO identifies the user from the token's subject and fetches
the data with **its own** eidmongolia.mn RP credentials — so apps never need to
hold eID credentials.

## Two services

| Service | Public path | Endpoints |
|---|---|---|
| **`eid-proxy`** (personal) | `https://sso.dgov.mn/rp/eid/*` | `summary` · `certificates` · `devices` · `activity` |
| **`eid-org-proxy`** (organizations) | `https://sso.dgov.mn/rp/eid-org/*` | `organizations` · `organizations/{regNo}/signers` |

All are **read-only** (GET). Personal and organization services are grouped
separately so the admin can manage them independently.

## Calling the proxy

```bash
GET https://sso.dgov.mn/rp/eid/summary
Authorization: Bearer <the user's SSO access token>
```

The response is that user's eID data (fetched with the SSO's RP credentials).

## Authorization

The app must be **granted** the service. The grant is expressed as the **service
scope** (`svc:eid-proxy` / `svc:eid-org-proxy`) in the client's OAuth2 allowed
scope — granting the service to the app in the admin adds this scope.

On every request the SSO:

1. Introspects the token (RFC 7662) → `active` + `sub`.
2. Looks up the client by the token's `client_id` and checks whether the service
   scope is granted (it checks the **current** grant, so granting/revoking is
   immediate).
3. Resolves the user from `sub` and fetches the data from eID Mongolia.

| Condition | Response |
|---|---|
| No token / expired | `401` |
| App not granted the service | `403` |
| Service disabled in the gateway | `503` |
| Success | `200` + data |

!!! tip "How to grant?"
    Admin → Applications → the app → check **eid-proxy** / **eid-org-proxy** →
    Save. An ungranted app gets 403. See [API Gateway](api-gateway.md) for details.

## Runtime toggle

Both services are registered in the **API gateway catalog** and can be
**enabled/disabled** from the admin gateway UI at runtime (disabled → `503`).
Personal eID can be turned off while organization eID keeps working (independent).
