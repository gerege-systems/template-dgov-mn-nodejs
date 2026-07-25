# Байршуулалт (Deployment)

Платформыг ганц VPS дээр **Docker Compose + nginx**-ээр байршуулна. Stack:
PostgreSQL + Redis + Go API (өөрийн OIDC issuer-ийг мөн хангадаг) + Next.js BFF.

## Шаардлага

- Docker + compose plugin
- nginx + certbot (TLS)
- Домэйний DNS сервер рүү заасан байх

## Топологи

```
Internet ──► nginx (80/443, Let's Encrypt)
   ├─ /oauth2/*, /.well-known/*, /userinfo ─► api (OIDC issuer)
   ├─ /rp/sign/*      ─► api relay
   ├─ /rp/eid/*, /rp/eid-org/* ─► api (eID proxy)
   └─ бусад бүх         ─► web (Next.js BFF) ──► api
   internal: db (Postgres 16) · redis (7)
```

## Env файлууд (gitignored)

- **`.env`** — compose interpolation (Postgres/Redis нууц, ports, домэйн).
- **`backend.env`** — API-ийн тохиргоо (JWT_SECRET, EID_RP_*, OAUTH_ISSUER, SSO_*, …).

!!! warning "Секрет тусад нь"
    Тусдаа deployment бүр өөрийн `JWT_SECRET`, `SSO_STATE_KEY`, RP креденшлтэй байх ёстой
    — deployment хооронд хуваалцахгүй.

## Deploy алхмууд

```bash
# 1) код авах
git clone git@github.com:gerege-systems/sso-dgov-mn.git /srv/sso-dgov-mn
cd /srv/sso-dgov-mn

# 2) env файлуудыг бэлдэх (.env + backend.env)

# 3) stack өргөх — migrate автоматаар schema-г тавина
docker compose up -d --build

# эсвэл дахин deploy:
bash deploy/deploy.sh
```

## nginx (жишээ)

```nginx
server {
    server_name sso.dgov.mn;
    client_max_body_size 30m;

    location /oauth2/                           { proxy_pass http://127.0.0.1:4446; include /etc/nginx/proxy_params; }
    location = /.well-known/openid-configuration { proxy_pass http://127.0.0.1:4446; include /etc/nginx/proxy_params; }
    location = /.well-known/jwks.json            { proxy_pass http://127.0.0.1:4446; include /etc/nginx/proxy_params; }
    location = /userinfo                         { proxy_pass http://127.0.0.1:4446; include /etc/nginx/proxy_params; }

    location /rp/sign/    { proxy_pass http://127.0.0.1:8081/rp/sign/; include /etc/nginx/proxy_params; }
    location /rp/eid/     { proxy_pass http://127.0.0.1:8081/api/v1/eid/;     include /etc/nginx/proxy_params; }
    location /rp/eid-org/ { proxy_pass http://127.0.0.1:8081/api/v1/eid-org/; include /etc/nginx/proxy_params; }

    location / { proxy_pass http://127.0.0.1:3008; include /etc/nginx/proxy_params; }
    listen 443 ssl;  # certbot managed
}
```

## Compose project нэр

Нэг сервер дээр олон deployment зэрэгцүүлэн ажиллуулж болно. Тус бүр өөрийн
`.env` дэх `COMPOSE_PROJECT_NAME`, порт, volume-той байх ёстой — эс бөгөөс image
tag / volume мөргөлдөнө.

| Deployment | Домэйн | Порт (жишээ) |
|---|---|---|
| `sso-dgov-mn` | sso.dgov.mn | web 3008 |
| `template-dgov-mn` | template.dgov.mn | web 3009 |
