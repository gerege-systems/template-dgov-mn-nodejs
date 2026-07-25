# Апп холбох (Government SSO / OIDC RP)

Апп-аа **Government SSO (sso.dgov.mn)**-ий relying party болгож холбоно. Нэвтрэх
товч дарахад хэрэглэгч sso.dgov.mn руу шилжиж, eID-ээр нэвтэрч, апп руугаа буцна.

## 1. Апп-аа RP client болгож бүртгүүлэх

Хоёр арга:

=== "Admin UI"

    **Admin → Applications → Шинэ апп** дээр нэр, redirect URI, tag оруулж
    хадгална. Хэрэгтэй eID service-үүдийг (eid-proxy г.м.) checkbox-оор олгоно.
    `client_id` / `client_secret` буцна.

=== "CLI helper"

    Сервер дээр `register-rp.sh` нь login redirect **болон** post-logout redirect
    URI-г хамт зөв тавьдаг (logout алдаа гарахгүй):

    ```bash
    cd /srv/sso-dgov-mn
    ./scripts/register-rp.sh "Миний апп" https://myapp.dgov.mn
    # → client_id + client_secret хэвлэнэ
    #   redirect_uri            = https://myapp.dgov.mn/sso/callback
    #   post_logout_redirect_uri= https://myapp.dgov.mn/
    ```

## 2. Апп-ын тохиргоо

RP апп (энэ template-ийг ашиглаж байвал) `backend.env`-д:

```env
SSO_ISSUER=https://sso.dgov.mn
SSO_CLIENT_ID=<client_id>
SSO_CLIENT_SECRET=<client_secret>
SSO_REDIRECT_URI=https://myapp.dgov.mn/sso/callback
SSO_SCOPE=openid profile email
```

## 3. Нэвтрэлтийн урсгал

1. Хэрэглэгч апп дээр **«Government SSO-оор нэвтрэх»** дарна → `/api/auth/sso/start`.
2. Backend `/sso/start` нь state үүсгэж (Redis), `sso.dgov.mn/oauth2/auth` руу
   authorize URL байгуулна; браузер тийш шилжинэ.
3. Хэрэглэгч sso.dgov.mn дээр eID-ээр нэвтэрнэ.
4. sso.dgov.mn нь `https://myapp.dgov.mn/sso/callback?code&state` руу буцаана.
5. Backend `/sso/callback` нь code-ийг токен болгож солин, иргэнийг `sso_sub`-ээр
   upsert хийж, апп-ын өөрийн session (JWT) олгоно.

## 4. Гарах (logout)

RP-initiated logout нь `sso.dgov.mn/oauth2/sessions/logout` руу `id_token_hint` +
`post_logout_redirect_uri`-тай шилжинэ. Тухайн post-logout URI **client-д
бүртгэгдсэн** байх ёстой (`register-rp.sh` автоматаар тавьдаг).

!!! warning "Post-logout redirect бүртгэл"
    Апп-ыг зөвхөн login redirect-тэй бүртгэвэл logout нь *"post_logout_redirect_uri
    is not whitelisted"* алдаа өгнө. `register-rp.sh` эсвэл Admin UI нь login **ба**
    post-logout URI-г хамт тавьдаг тул энэ алдаа гарахгүй.

## Нэмэлт service олгох

Апп нь нэвтэрснээс гадна SSO-ий **нэмэлт** service-үүдийг (eID proxy г.м.) ашиглахыг
хүсвэл Admin-аас тухайн service-ийг апп-д олгоно. Дэлгэрэнгүйг
[eID Service Proxy](eid-services.md) болон [API Gateway](api-gateway.md)-аас үзнэ үү.
