# Deploy хийх заавар — Node.js хувилбар

> 🌐 [English](DEPLOYMENT.md) · **Монгол**

**Government Template Platform V3.0 — Node.js хувилбар**-ыг нэг VPS дээр Docker
Compose-оор, nginx-ийн ард хэрхэн deploy хийх заавар. Жишээ болгон энэ хувилбарын
эталон deployment **[node.template.dgov.mn](https://node.template.dgov.mn)**-ыг
авав. Stack нь Postgres + Redis + Node/Express API + React web.

## Топологи

Host-ийн loopback хоёр порт гаргана; nginx нь TLS-ийг терминалж, тус бүрийг зөв
контейнер рүү проксилно. `db` болон `redis` нь compose-ийн дотоод сүлжээнээс
хэзээ ч гардаггүй.

```
Интернэт ──► nginx (80/443, Let's Encrypt TLS)
   │
   ├─ /rp/sign/*  (3 дагч RP-уудын eID sign relay)
   │      ─────────────────────────► api  127.0.0.1:${API_PORT}   (backend :8080)
   │
   └─ бусад бүх зүйл — апп + BFF /api/*
          ─────────────────────────► web  127.0.0.1:${WEB_PORT}   (:3000)
                                       │ BACKEND_URL=http://api:8080
                                       ▼
   дотоод compose сүлжээ (нийтийн host порт байхгүй):
        api ──► db (Postgres 16) + redis (7)
        migrate (нэг удаагийн) — SQL хэрэгжүүлээд гарна
```

OIDC provider нь **api-ийн дотор** байрлана (`usecases/oidc` + `oauth_clients`
хүснэгт) — тусдаа Ory Hydra контейнер БАЙХГҮЙ. `OAUTH_ISSUER` тохируулсан үед
`/oauth2/*`, `/userinfo`, `/.well-known/*`-ыг api өөрөө үйлчилнэ; provider-ийг
идэвхжүүлэхдээ тэдгээр замыг api upstream рүү чиглүүлнэ.

> **Frontend тэмдэглэл.** Vite + React SPA шилжилт хийгдэж байх хугацаанд `web`
> нь Next.js BFF контейнер хэвээр бөгөөд дээрх топологи яг зөв. SPA гармагц `web`
> нь статик файл болж, nginx нь `/api/*`-ыг шууд api рүү проксилно —
> [ROADMAP.md](../ROADMAP.md)-г үз.

## Шаардлага

- Docker + compose plugin бүхий VPS (`docker compose version`)
- Host дээр nginx + certbot (эсвэл TLS терминалдаг ямар ч урвуу proxy)
- `node.template.dgov.mn` → серверийн IP руу заасан DNS A бичлэг

## 1. Кодыг татах

```bash
git clone https://github.com/gerege-systems/template-dgov-mn-nodejs.git /srv/template-dgov-mn-nodejs
cd /srv/template-dgov-mn-nodejs
```

## 2. Хоёр env файл үүсгэх (хоёулаа gitignored)

### `./.env` — compose-ийн interpolation

```env
# --- Postgres / Redis ---
POSTGRES_USER=postgres            # superuser — зөвхөн migrate хэрэглэнэ
POSTGRES_PASSWORD=<random>
POSTGRES_DB=gerege_template
APP_DB_USER=app_user              # api-ийн холбогдох хамгийн бага эрхтэй role
APP_DB_PASSWORD=<random>
APP_DB_DSN=postgres://app_user:<дээрхтэй ижил>@db:5432/gerege_template?sslmode=disable
REDIS_PASS=<random>

# --- Апп / origin ---
APP_ORIGIN=https://node.template.dgov.mn   # яг нийтийн origin (CSRF origin шалгалт)
WEB_PORT=3012                     # nginx апп руу проксилдог loopback порт
API_PORT=8085                     # nginx /rp/sign (+ /oauth2) руу проксилдог loopback порт

# --- Web давхаргын хэрэглэдэг OAuth client ID/secret (хоосон = тэр товч inert) ---
GOOGLE_CLIENT_ID=<…>              # Google account холболт (backend.env-д ч тавина)
GOOGLE_DRIVE_CLIENT_ID=<…>        # гуравдагч интеграци
GOOGLE_DRIVE_CLIENT_SECRET=<…>    # redirect_uri = ${APP_ORIGIN}/api/integrations/<provider>/callback
DROPBOX_CLIENT_ID=<…>
DROPBOX_CLIENT_SECRET=<…>
GOOGLE_MEET_CLIENT_ID=<…>
GOOGLE_MEET_CLIENT_SECRET=<…>
```

Host дээр сул байгаа loopback портуудыг сонго — энэ сервер дээр платформын хэд хэдэн
deployment аль хэдийн ажиллаж байгаа (`3008`–`3011` / `8081`–`8084`), тиймээс энд
`3012` / `8085`.

### `./backend.env` — `api` + `migrate`-д `/app/.env` болж mount хийгдэнэ

Энэ нь backend-ийн тохиргооны файл. Бүрэн, тайлбартай схем нь
[`backend/.env.example`](../backend/.env.example) — түүнийг хуулж нууц утгуудаа
бөглө. Гол түлхүүрүүд:

```env
# --- Цөм runtime ---
PORT=8080
ENVIRONMENT=development           # compose stack нь dev горимд ажиллана: дотоод DB-д
                                  # TLS байхгүй (prod guard нь sslmode=verify-full
                                  # шаарддаг); TLS нь nginx дээр терминална
DEBUG=false
DB_POSTGRE_DRIVER=postgres
DB_POSTGRE_DSN=postgres://postgres:<POSTGRES_PASSWORD>@db:5432/gerege_template?sslmode=disable
                                  # ^ superuser DSN — MIGRATE (DDL) хэрэглэнэ.
                                  # api нь үүнийг APP_DB_DSN-ээр дарж бичнэ (§3).
JWT_SECRET=<≥32 random тэмдэгт>
JWT_EXPIRED=5                     # цаг (1–24)
JWT_REFRESH_EXPIRED=7             # хоног
JWT_ISSUER=node.template.dgov.mn
BCRYPT_COST=12
OTP_MAX_ATTEMPTS=5
REDIS_HOST=redis:6379
REDIS_PASS=<.env-тэй ижил>
REDIS_EXPIRED=5                   # минут
ALLOWED_ORIGINS=https://node.template.dgov.mn
TRUSTED_PROXIES=172.16.0.0/12,127.0.0.1   # XFF-д зөвхөн docker сүлжээ + nginx-ээс итгэнэ.
                                  # Proxy-гийн ард ЗААВАЛ: api-д нийтийн апп порт
                                  # байхгүй тул хүсэлт web/nginx-ийн peer-ээс ирнэ.
                                  # Итгэмжит proxy жагсаалтгүй бол api нь
                                  # X-Forwarded-For-ыг үл хэрэгсэж, IP тус бүрийн
                                  # rate limit НЭГ bucket болж хумигдана.

# --- eID Relying Party (цорын ганц интерактив нэвтрэх арга) ---
EID_BASE_URL=https://eidmongolia.mn/v3
EID_RP_UUID=<eID Mongolia-ээс олгосон RP UUID>
EID_RP_NAME=template-node-web
EID_RP_SECRET=<RP secret>
EID_CERT_LEVEL=ADVANCED           # нэвтрэлтэд ADVANCED (гарын үсэгт QUALIFIED/QSCD)
EID_CALLBACK_URL=https://node.template.dgov.mn/login/verify   # IdP-д allowlist-д байх
EID_DISPLAY_TEXT=node.template.dgov.mn

# --- GeregeCloud Verify (бүх email/SMS OTP; SMTP хаана ч байхгүй) ---
VERIFY_API_BASE=https://verify.gecloud.mn/v1
VERIFY_API_KEY=<key>              # ENVIRONMENT=production үед ЗААВАЛ

# --- Google OAuth (eID account холболт; server талд код exchange) ---
GOOGLE_CLIENT_ID=<…>
GOOGLE_CLIENT_SECRET=<…>

# --- Government SSO consumer (sso.dgov.mn OIDC) ---
SSO_ISSUER=https://sso.dgov.mn
SSO_CLIENT_ID=<…>
SSO_CLIENT_SECRET=<…>
SSO_REDIRECT_URI=https://node.template.dgov.mn/sso/callback
SSO_SCOPE=openid profile email

# --- OIDC PROVIDER тал (энэ платформ өөрөө issuer) ---
OAUTH_ISSUER=https://node.template.dgov.mn   # сүүлийн slash-гүй — энэ нь `iss` claim
SSO_STATE_KEY=<≥32 random тэмдэгт>           # login/consent state-ийн HMAC түлхүүр
SSO_FIRSTPARTY_CLIENTS=<csv client_id>       # эдгээрт consent дэлгэц алгасна
SSO_ADMIN_API_KEYS=<csv bootstrap key>
SSO_ADMIN_SUBS=<csv eid_sub>

# --- Gerege платформын үйлчилгээнүүд (бүгд сонголттой) ---
XYP_API_BASE=https://xyp.dgov.mn      # байгууллагын лавлагаа (HTTP Basic)
XYP_CLIENT_ID=<…>
XYP_CLIENT_SECRET=<…>
CORE_API_BASE=https://core.gerege.mn
CORE_API_TOKEN=<service bearer>
GSPACE_HOST=<sftp host>               # Gerege Space хэрэглэгч тус бүрийн SFTP хадгалалт
GSPACE_USER=<…>
GSPACE_PASSWORD=<…>
GSPACE_HOST_KEY=<ssh-ed25519 AAAA…>   # production-д ЗААВАЛ (MITM-ээс хамгаална)

# --- Шифрлэлт / гарын үсэг / observability ---
INTEGRATION_ENC_KEY=<≥32 random тэмдэгт>  # хадгалсан OAuth token + TOTP-ийн AES-256-GCM түлхүүр
SIGN_RELAY_TOKEN=<shared token>           # /rp/sign relay-г идэвхжүүлнэ (хоосон = унтарсан)
SIGN_SIGNER_CERT_FILE=/app/certs/signer.crt   # PAdES signer (prod: ЗААВАЛ, fail-closed;
SIGN_SIGNER_KEY_FILE=/app/certs/signer.key    #  dev-д self-signed руу шилжинэ)
OBSERVABILITY_TOKEN=<random>              # prod-д /metrics + /swagger/doc.json-ий bearer
GEMINI_API_KEY=<AIza…>                    # AI функц; хоосон = AI endpoint 500
RELAY_DEMO_MODE=false                     # production-д унтраа — бодит platform callback хийнэ
```

Нууц утгуудыг `openssl rand -base64 48`-аар үүсгэ.

**`INTEGRATION_ENC_KEY` нь нэг л удаа бичигдэнэ.** Түүнийг сольсноор өмнө
шифрлэсэн бүх утга (хадгалсан OAuth token, superadmin-ийн TOTP secret) тайлагдахаа
болино. CD workflow нь түлхүүр БАЙХГҮЙ тохиолдолд Л `backend.env`-д бичдэг тул
хэзээ ч чимээгүй өөрчлөгдөхгүй.

## 3. Яагаад хоёр DB role вэ (эхний boot-оос ӨМНӨ уншина уу)

Row-Level Security-г superuser нь **чимээгүй алгасдаг**. Тиймээс stack нь хоёр
role хэрэглэнэ:

- `migrate` нь `POSTGRES_USER`-ээр (superuser — `CREATE EXTENSION` болон RLS DDL-д
  шаардлагатай) холбогдоно.
- `api` нь `APP_DB_USER`-ээр (`NOSUPERUSER NOBYPASSRLS`) холбогдоно. Уг role-ыг
  `backend/deploy/initdb/10-create-app-user.sh` нь **хоосон data volume-ийн эхний
  init үед** автоматаар үүсгэнэ.

Api нь **үүнийг boot үед шалгана**: role нь superuser/`BYPASSRLS` бол production
горимд эхлэхээс татгалзаж, development горимд анхааруулга логдоно. **Одоо байгаа**
өгөгдлийн сан дээр deploy хийх бол app role болон grant-уудыг гараар үүсгэ (initdb
скриптийг үз), `APP_DB_DSN`-ыг түүн рүү заа.

## 4. Эхний deploy

```bash
docker compose up -d --build      # api+web build, migrate ажиллаад, бүгд эхэлнэ
docker compose ps                 # хүлээгдэх: db/redis/api/web healthy, migrate Exited (0)
```

### nginx vhost (host дээр)

```nginx
upstream node_tpl_web { server 127.0.0.1:3012; }   # = WEB_PORT
upstream node_tpl_api { server 127.0.0.1:8085; }   # = API_PORT (api :8080)

server {
    server_name node.template.dgov.mn;

    # 3 дагч RP-уудын eID sign relay → api
    location /rp/sign/ { proxy_pass http://node_tpl_api; include /etc/nginx/proxy_params; }

    # OIDC протоколын endpoint-ууд → api (зөвхөн OAUTH_ISSUER тохируулсны дараа)
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

Хуваалцсан `proxy_set_header` мөрүүдийг `/etc/nginx/proxy_params`-д хийж `include`
хий. Дараа нь TLS-д `certbot --nginx -d node.template.dgov.mn`. Compose нь
`COOKIE_SECURE=true` тавьдаг тул сайт **заавал** HTTPS-ээр үйлчлэгдэх ёстой — эс
бөгөөс browser нь auth cookie-г хаяна.

## 5. Ажиллаж байгаа deployment-ыг шинэчлэх

```bash
cd /srv/template-dgov-mn-nodejs
git pull --ff-only origin main
docker compose build              # api + web + migrate
docker compose up -d              # өөрчлөгдсөн контейнерийг дахин үүсгэнэ; migrate
                                  # дахин ажиллана (хэрэгжсэн migration алгасагдана)
```

`db` болон `redis` ажилласаар байна — өгөгдөл хөндөгдөхгүй. Зөвхөн тохиргоо
өөрчилсөн бол `backend.env` / `.env`-ыг зассны дараа `docker compose up -d api web`.

### Автомат deploy (CI/CD)

Deploy нь CI-ийн дотоод job **БИШ**. Хоёр workflow гинжлэгдэнэ:

1. [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) — `main` руу push бүр
   болон PR бүр дээр хаалгууд (`backend`, `frontend`, `secrets-scan`) ажиллана.
2. [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) — CI дууссаны
   ДАРАА `workflow_run`-аар өдөөгдөх **тусдаа** workflow, ингэснээр унасан build
   хэзээ ч гарахгүй. Зөвхөн гинжлэгдсэн CI run нь `main` дээр `success` болсон үед
   (эсвэл гараар `workflow_dispatch`) deploy хийнэ. VPS руу SSH-ээр орж, CI давсан
   ЯГ тэр commit руу `git reset --hard` хийгээд
   [`deploy/deploy.sh`](../deploy/deploy.sh)-г ажиллуулна (rebuild → `up -d` →
   healthy хүлээх → prune).

Нэг удаагийн тохиргоо — **Settings → Secrets and variables → Actions** дор дараах
secret-уудыг нэм:

| Secret | Утга |
|--------|------|
| `DEPLOY_HOST` | VPS-ийн IP / hostname |
| `DEPLOY_USER` | repo checkout-ыг эзэмшдэг, docker ажиллуулж чадах SSH хэрэглэгч |
| `DEPLOY_PATH` | серверийн repo зам (ж: `/srv/template-dgov-mn-nodejs`) |
| `DEPLOY_SSH_KEY` | зориулалтын deploy keypair-ийн **хувийн** түлхүүр; public нь серверийн `~/.ssh/authorized_keys`-д |
| `INTEGRATION_ENC_KEY` | AES-GCM түлхүүр; эхний deploy-д `backend.env`-д нэг удаа бичигдэнэ |
| `DEPLOY_SSH_PORT` | *(сонголттой)* SSH порт, өгөгдмөл `22` |

Keypair-ыг `ssh-keygen -t ed25519 -f deploy_key -N ''`-ээр үүсгэж, `deploy_key.pub`-ыг
deploy хэрэглэгчийн `authorized_keys`-д нэмж, хувийн `deploy_key`-г
`DEPLOY_SSH_KEY`-д хий. Код өөрчлөхгүйгээр Actions tab-аас (**Run workflow**)
deploy өдөөж, эсвэл серверт `bash deploy/deploy.sh`-г гараар ажиллуулж болно.

## 6. Шалгах

```bash
docker compose ps                                                  # бүгд healthy / migrate Exited(0)
docker logs template-dgov-mn-nodejs-migrate-1 | tail -3             # "migration [up] success"
docker logs template-dgov-mn-nodejs-api-1 2>&1 | grep -i error      # хоосон байх ёстой
curl -s -o /dev/null -w '%{http_code}\n' https://node.template.dgov.mn/   # 200
curl -s http://127.0.0.1:8085/ready                                 # {"status":true,"checks":{…}}
```

## 7. Rollback

```bash
git log --oneline                 # сүүлийн сайн commit-ыг ол
git reset --hard <commit>
docker compose build && docker compose up -d
```

Энэ урсгалд SQL migration нь зөвхөн урагшаа. Migration-ыг буцаах шаардлагатай бол
кодыг түүнээс хойш rollback хийхээс ӨМНӨ тохирох `N_*.down.sql`-ыг гараар
хэрэгжүүл.

## Нууцлалын эрүүл ахуй

- `.env` болон `backend.env` нь gitignored — хэзээ ч commit хийхгүй.
- Бүгдийг албадан гаргахын тулд `JWT_SECRET`-ыг соль (бүх токен хүчингүй болно).
- Ажиллаж байгаа deployment дээр `INTEGRATION_ENC_KEY`-г **хэзээ ч** солихгүй — §2-г үз.
- `GEMINI_API_KEY`, OAuth креденшл, `EID_RP_SECRET`, `CORE_API_TOKEN`-ыг тухайн
  console-оос соль, `backend.env`-ыг шинэчил, дараа нь
  `docker compose up -d api web`.

---

**Government Template Platform V3.0** — **Gerege Systems Development Team** болон
**Claude AI** хамтран бүтээв, 2026.
