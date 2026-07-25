# App integration (Government SSO / OIDC RP)

Connect your app as a relying party of **Government SSO (sso.dgov.mn)**. When the
user clicks sign in, they are redirected to sso.dgov.mn, authenticate with eID,
and return to your app.

## 1. Register your app as an RP client

Two ways:

=== "Admin UI"

    In **Admin → Applications → New app**, enter the name, redirect URI and tag,
    then save. Grant the eID services you need (e.g. eid-proxy) via checkboxes.
    You receive a `client_id` / `client_secret`.

=== "CLI helper"

    On the server, `register-rp.sh` sets both the login redirect **and** the
    post-logout redirect URI correctly (so logout won't fail):

    ```bash
    cd /srv/sso-dgov-mn
    ./scripts/register-rp.sh "My app" https://myapp.dgov.mn
    # → prints client_id + client_secret
    #   redirect_uri            = https://myapp.dgov.mn/sso/callback
    #   post_logout_redirect_uri= https://myapp.dgov.mn/
    ```

## 2. App configuration

If your app is built on this template, set in `backend.env`:

```env
SSO_ISSUER=https://sso.dgov.mn
SSO_CLIENT_ID=<client_id>
SSO_CLIENT_SECRET=<client_secret>
SSO_REDIRECT_URI=https://myapp.dgov.mn/sso/callback
SSO_SCOPE=openid profile email
```

## 3. The sign-in flow

1. The user clicks **“Sign in with Government SSO”** → `/api/auth/sso/start`.
2. The backend `/sso/start` creates state (Redis) and builds the authorize URL at
   `sso.dgov.mn/oauth2/auth`; the browser is redirected there.
3. The user authenticates with eID at sso.dgov.mn.
4. sso.dgov.mn redirects back to `https://myapp.dgov.mn/sso/callback?code&state`.
5. The backend `/sso/callback` exchanges the code for tokens, upserts the citizen
   by `sso_sub`, and issues the app's own session (JWT).

## 4. Logout

RP-initiated logout redirects to `sso.dgov.mn/oauth2/sessions/logout` with an
`id_token_hint` and a `post_logout_redirect_uri`. That post-logout URI must be
**registered on the client** (`register-rp.sh` sets it automatically).

!!! warning "Register the post-logout redirect"
    If an app is registered with only a login redirect, logout fails with
    *"post_logout_redirect_uri is not whitelisted"*. `register-rp.sh` and the Admin
    UI set the login **and** post-logout URIs together, so this error won't happen.

## Granting add-on services

Beyond sign-in, if your app needs SSO's **add-on** services (e.g. the eID proxy),
the admin grants that service to the app. See [eID Service Proxy](eid-services.md)
and [API Gateway](api-gateway.md).
