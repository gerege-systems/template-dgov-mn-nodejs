# Government Template Platform V3.0 — Frontend

> **Цахим засаглалыг бүтээх суурь** — _Нэг суурь — бүх төрийн үйлчилгээ._

**Government Template Platform V3.0**-ийн Next.js 15 frontend — аль ч цахим төрийн
үйлчилгээг дээр нь босгож болох, үйлдвэрлэлд бэлэн суурь. Backend нь Go (chi · pgx ·
PostgreSQL · Redis) — энэ frontend түүн рүү **BFF (Backend-for-Frontend)** загвараар
найдвартай прокси хийж, токеныг browser-т хэзээ ч гаргалгүй, Clean-Architecture Go
backend + Next.js BFF + Gemini AI стекийг нэг цул туршлага болгон нэгтгэдэг.

- Хэл: Next.js App Router (React 19, server components), TypeScript.
- Токен browser-т хэзээ ч ил гарахгүй — httpOnly cookie + server прокси.
- Нэвтрэлт: **eID Mongolia** (QR / mobile deep-link / РД push + long-poll),
  **Google OAuth** (eID-ээр эхлээд холбоно), **dgov SSO** (OIDC consumer). Мөн энэ
  апп нь **OIDC provider (RP-facing)** хуудсуудыг хангадаг (Ory Hydra урдаа).
- Хэмжээ: ~48 хуудас route, ~100 route handler (`/api/*` + `/sso/callback`).

> **Жишиг deployment:** **DAN-Government SSO** ([sso.dgov.mn](https://sso.dgov.mn))
> — eID-д суурилсан үндэсний нэгдсэн нэвтрэлт (Single Sign-On) — нь энэ суурин дээр
> бүтээгдсэн бодит үйлчилгээний нэг жишээ.

> Нууц үг / имэйл / OTP-аар нэвтрэх, бүртгүүлэх, нууц үг сэргээх урсгал **байхгүй**.
> Цорын ганц хүний баталгаа нь eID. (Backend-д `auth_register.go`,
> `auth_send_otp.go` зэрэг файл байгаа ч ямар ч route-д холбогдоогүй.)

---

## Архитектур — BFF (Backend-for-Frontend)

```
Browser ──(адил origin)──► Next.js route handler (/api/*) ──(server→server)──► Go API /api/v1
   ▲                                │
   └── httpOnly cookie (токен) ◄────┘
```

- **Токен browser-т хэзээ ч ил гарахгүй.** Access/refresh JWT-г `httpOnly`
  cookie-д (`dgov_access`, `dgov_refresh`) хадгална → XSS-д тэсвэртэй. SSO-ээр
  нэвтэрсэн session-ий RP-initiated logout URL нь `dgov_sso_logout` cookie-д
  байна (гарах үед SSO дээр session-ийг дуусгахад ашиглана). Cookie-ийн
  тодорхойлолт: `src/lib/cookies.ts`.
- **Browser↔Go хооронд CORS хэрэггүй.** Browser зөвхөн Next.js рүү (адил origin)
  хандана; Go API руу зөвхөн Next.js server прокси хийнэ (`connect-src 'self'`,
  `src/next.config.mjs` CSP-д хатуу).
- **Reactive refresh.** Хамгаалагдсан дуудлага `401` авбал refresh токеноор нэг
  удаа автоматаар шинэчилж, дахин оролдоно (`authedFetch` — `src/lib/api.ts`).
  Refresh нь token **rotation** хийдэг тул cookie бичих боломжгүй (RSC render)
  контекстод `tryRefresh` огт хийгдэхгүй — `canPersistSession()` эхэлж cookie
  бичих боломжийг шалгаж, хүчинтэй сессиэ дэмий шатаахаас сэргийлнэ.
- **Давхар CSRF хамгаалалт.** Бүх state-changing BFF route хоёр давхар шалгалт
  шаардана (`checkOrigin` — `src/lib/bff.ts`): (1) `x-dgov-csrf: 1` custom header
  (cross-site form POST custom header тавьж чаддаггүй), (2) `Origin` толгойг
  `APP_ORIGIN`-той тулгах. Header-ийг browser талаас `src/lib/client.ts`-ийн
  `sendJSON`/`postJSON` нэг газраас тавьдаг.
- **Токен ил гаргахгүй прокси хариу.** Backend хариуг browser рүү буцаахдаа
  зөвхөн `ok/status/message/fieldErrors`-ыг (`toClientResponse`), эсвэл нэмээд
  нууц БУС `data`-г (`proxyResult`) дамжуулна — токен зэрэг талбар хэзээ ч гарахгүй.
- **TanStack Query.** GET өгөгдөл (admin/RBAC жагсаалт, gov/gateway дэлгэц г.м.)
  кэш + deduplication + mutation-ы дараах invalidation-тэй. `getJSON` +
  `useQuery`; provider нь `src/components/Providers.tsx`.

---

## Хавтасны бүтэц

```
src/
  app/
    page.tsx                     # Landing (анон) / нэвтэрсэн бол dashboard руу
    layout.tsx, globals.css      # root layout + gerege theme токенууд
    login/                       # eID нэвтрэх (LoginForm) + /login/verify
    auth/eid/callback/           # App2App (same-device) буцах цэг
    app/eid/callback/            # native/app callback bridge
    sso/callback/route.ts        # dgov SSO redirect URI (route handler)
    oauth/                       # OIDC provider (RP-facing): login/consent/logout/error
    me/                          # нэвтэрсэн хэрэглэгчийн бүх дэлгэц (layout=AreaShell)
    admin/                       # админ/RBAC/gateway (layout=AreaShell + RBAC)
    manager/                     # менежерийн дэлгэц
    profile/, settings/          # legacy → /me/* руу redirect
    api/                         # BFF route handler-ууд (доор дэлгэрэнгүй)
  components/
    AppShell, AreaShell, Providers   # layout + TanStack Query provider
    SigninShell, UserMenu, NavSearch, AppearanceControls, …
    landing/  me/  admin/  gateway/  gov/  ui/   # домэйн бүрийн view компонентууд
  lib/
    api.ts          # server→Go fetch + reactive refresh (authedFetch/authedRaw)
    bff.ts          # checkOrigin (CSRF), proxyResult/toClientResponse, ID шалгалт
    client.ts       # browser→BFF fetch (CSRF header + getJSON/postJSON/sendJSON)
    session.ts      # httpOnly токен cookie set/get/clear + canPersistSession
    cookies.ts      # cookie нэр/сонголт (dgov_access/refresh/sso_logout)
    i18n.ts, lang.tsx   # mn/en dictionary + useT() hook
    aiBff.ts, audio.ts  # AI route audio whitelist + MediaRecorder бичлэг/playback
    pki.ts, integrations.ts, driveClient.ts, dropboxClient.ts
    govTypes.ts, gatewayTypes.ts, preferences.ts, format.ts, navigation.ts, types.ts
  middleware.ts     # route хамгаалалт (доор)
```

`src/middleware.ts`: `/me`, `/profile`, `/settings`, `/admin`, `/manager` замууд
refresh cookie байхгүй бол `/login?next=…` руу чиглүүлнэ; нэвтэрсэн хэрэглэгчийг
`/login`-оос буцаана. `/admin`, `/manager` нь нэмэлтээр server талд RBAC-аар
шалгагдана (эрх resolve хийж, дутуу бол дотор нь буулгана).

---

## Хуудаснууд (route map)

🔒 = нэвтрэлт шаардана (middleware). Backend endpoint нь `/api/v1` угтвартай.

### Нэвтрэлт ба нэвтрэлтийн үйлчилгээ

| Зам | Тайлбар |
|-----|---------|
| `/` | Landing (анон) / нэвтэрсэн бол dashboard руу |
| `/login` | eID нэвтрэх — РД push эсвэл QR (device-link); Google холбох сонголт |
| `/login/verify` | eID баталгаажуулалтын хүлээх/буцах дэлгэц |
| `/auth/eid/callback` | App2App (same-device) буцах — `?sessionId=` poll хийж дуусгана |
| `/app/eid/callback` | native/app callback bridge (iOS) |
| `/sso/callback` | dgov SSO OIDC redirect URI (route handler) |
| `/oauth/login` 🅟 | OIDC provider: RP-ээс нэвтрэх (eID/Google) → challenge accept |
| `/oauth/consent` 🅟 | OIDC provider: scope зөвшөөрөл |
| `/oauth/logout` 🅟 | OIDC provider: RP-initiated logout баталгаа |
| `/oauth/error` 🅟 | OIDC provider: алдааны дэлгэц |
| `/profile`, `/settings` | legacy — `/me/profile`, `/me/settings` руу redirect |

🅟 = OIDC provider (RP-facing). Ory Hydra browser-ыг `login_challenge` /
`consent_challenge`-тэй энд чиглүүлж, DAN өөрийн дизайнаар иргэнийг eID-ээр
баталгаажуулаад Hydra-д subject-ыг өгнө (BFF: `api/provider/*`).

### Миний систем (`/me/*`) 🔒

| Зам | Тайлбар |
|-----|---------|
| `/me/dashboard` | Хувийн хяналтын самбар |
| `/me/profile` | Профайл (eID-ээс ирсэн иргэний мэдээлэл, латин нэр, зураг) |
| `/me/settings` | Тохиргоо (харагдац, гарах) |
| `/me/ai` | AI туслах — текст/дуут чат (🎤 STT, 🔊 TTS) |
| `/me/translate` | Шууд орчуулга — микрофоны сегментүүдийг live орчуулна |
| `/me/eid/id` | eID үнэмлэх (иргэний ID мэдээлэл) |
| `/me/eid/certificates` | PKI гэрчилгээнүүд |
| `/me/eid/devices` | Холбогдсон төхөөрөмжүүд |
| `/me/eid/logs` | eID үйл ажиллагааны түүх |
| `/me/eid/security` | eID аюулгүй байдал |
| `/me/eid/sign` | Баримт цахим гарын үсгээр баталгаажуулах |
| `/me/organizations` | Хэрэглэгчийн байгууллагууд (жагсаалт) |
| `/me/organizations/[id]` | Байгууллагын дэлгэрэнгүй + гишүүд |
| `/me/organizations/eid/[regNo]` | eID-ээс регистрээр байгууллага (тамга/гарын үсэг зурагчид) |
| `/me/applications` | Төрийн үйлчилгээний хүсэлтүүд |
| `/me/appointments` | Цаг захиалга |
| `/me/payments` | Төлбөрүүд |
| `/me/notifications` | Мэдэгдэлүүд |
| `/me/references` | Лавлагаа |
| `/me/services` | Төрийн үйлчилгээний каталог |
| `/me/integrations` | Гуравдагч интеграц (Google Drive/Dropbox/Meet/GSpace) |

### Админ систем (`/admin/*`) 🔒 (RBAC)

| Зам | Тайлбар |
|-----|---------|
| `/admin/dashboard` | Админ тойм |
| `/admin/users` | Хэрэглэгч удирдлага (идэвх, role) |
| `/admin/roles` | RBAC — role + permission |
| `/admin/superadmin` | Супер админ — админ томилох/хасах |
| `/admin/audit` | Аудит лог (tamper-evident, verify) |
| `/admin/security` | Аюулгүй байдлын үйл явдлууд |
| `/admin/settings` | Систем тохиргоо + AI prompt давхарга + сайтын харагдац |
| `/admin/core` | Gerege Core хайлт (хэрэглэгч/байгууллага регистрээр) |
| `/admin/gateway/overview` | API Gateway — 24 цагийн ачаалал/алдаа/латент |
| `/admin/gateway/services` | Upstream backend сервисүүд |
| `/admin/gateway/routes` | Маршрут (зам/арга → сервис) |
| `/admin/gateway/consumers` | API хэрэглэгч + түлхүүр |
| `/admin/gateway/policies` | rate-limit / auth / CORS бодлого |
| `/admin/gateway/logs` | Gateway хүсэлтийн лог |

### Менежер систем (`/manager/*`) 🔒 (RBAC)

| Зам | Тайлбар |
|-----|---------|
| `/manager/dashboard` | Менежерийн самбар |
| `/manager/users` | Хэрэглэгчийн жагсаалт (хязгаарлагдсан эрх) |

---

## BFF `/api/*` route map

Бүх mutating route эхлээд `checkOrigin` (CSRF header + Origin) шалгана.
Хамгаалагдсан дуудлага `authedFetch`-ээр (Bearer + reactive refresh) явна.

| Бүлэг | Route-ууд | Зорилго |
|-------|-----------|---------|
| **auth** | `auth/eid/{start,start-id,poll}` · `auth/google/{start,callback}` · `auth/sso/{start,native}` · `auth/logout` · `auth/expired` · `auth/change-password` | eID/Google/dgov SSO нэвтрэлт, гарах |
| **provider** | `provider/login{,/accept,/reject}` · `provider/consent{,/accept,/reject}` · `provider/logout/accept` | OIDC provider (Hydra) challenge зохицуулалт |
| **me** | `me` · `me/latin-name` · `me/signature` · `me/eid/{summary,certificates,devices,activity}` · `me/eid/organizations/*` | Профайл, eID/PKI, латин нэр, гарын үсэг |
| **org** | `org` · `org/[id]` · `org/[id]/members[/userID]` · `org/lookup/[regNo]` | Байгууллага ба гишүүд |
| **gov** | `gov/{overview,services,applications,appointments,payments,notifications,references}` (+ `/[id]/cancel`, `/[id]/pay`, `/[id]/read`, `/read-all`) | Төрийн үйлчилгээ |
| **sign** | `sign/init` · `sign/[id]` · `sign/[id]/download` | Баримтын цахим гарын үсэг |
| **integrations** | `integrations/[provider]/{connect,callback,disconnect}` · `integrations/google-drive/*` · `integrations/dropbox/*` · `integrations/google-meet/create-space` · `integrations/google-login/disconnect` | Google Drive/Dropbox/Meet OAuth + файл |
| **gspace** | `gspace` · `gspace/upload` · `gspace/download` | GSpace файлын орон зай |
| **ai** | `ai/{chat,stt,tts,translate}` | Gemini pipeline (audio whitelist `aiBff.ts`) |
| **rbac** | `rbac/me` · `rbac/permissions` · `rbac/roles[/id][/permissions]` | Role/permission удирдлага |
| **admin** | `admin/users[/id][/role][/active]` · `admin/ai/prompts[/key]` · `admin/site/appearance` | Хэрэглэгч, AI prompt, сайтын харагдац (admin scope) |
| **superadmin** | `superadmin/admins[/id][/grant]` | Админ томилол |
| **audit / security** | `audit` · `audit/verify` · `security/events` | Аудит лог + баталгаажуулалт |
| **gateway** | `gateway/{overview,services,routes,consumers,policies,logs}` (+ `/[id]`, `consumers/[id]/keys`, `keys/[keyId][/revoke]`) | API Gateway админ |
| **core** | `core/users` · `core/organizations` | Gerege Core хайлт |
| **site** | `site/appearance` | Нийтийн (auth-гүй) харагдацын default |
| **aasa** | `aasa` | Apple App Site Association (iOS Universal Links) |

`/.well-known/apple-app-site-association` → `api/aasa` руу `next.config.mjs`
rewrite-ээр холбогдоно.

---

## Нэвтрэлтийн урсгал

### eID (үндсэн)
1. `/login` дээр РД оруулах эсвэл QR арга сонгоно.
2. Browser → `api/auth/eid/start` (QR) эсвэл `api/auth/eid/start-id` (РД push).
   Backend session үүсгэж `session_id`, `device_link_url`, `verification_code`,
   `expires_at` буцаана (энд токен үүсэхгүй тул `proxyResult`-аар шууд дамжина).
3. **Cross-device** (desktop): browser ~2.5 сек тутам `api/auth/eid/poll` хийж
   `COMPLETE` болтол хүлээнэ. **Same-device** (mobile browser): `callbackUrl`
   дамжуулж eID апп-ыг deep-link (`geregesmartid://` / Universal Link)-ээр нээж,
   утас approve хийсний дараа browser `/auth/eid/callback?sessionId=…` руу буцаж
   тэндээ poll хийж дуусгана.
4. `COMPLETE` → backend токен хос буцаана; BFF `session.ts`-ээр httpOnly cookie-д
   суулгаж, browser-ийг `next` руу hard-redirect хийнэ.

### Google OAuth
eID-ээр эхэлж баталгаажуулсны дараа Google account-ыг холбоно. `api/auth/google/start`
→ Google consent → `api/auth/google/callback`. Эхний удаа (glink) eID-ээр
баталгаажуулахыг шаардана. `GOOGLE_CLIENT_ID` хоосон бол товч "тохируулаагүй" руу заана.

### dgov SSO (OIDC consumer)
`api/auth/sso/start` → backend `POST /sso/start` (Redis state) → `sso.dgov.mn`
authorize URL руу redirect → `/sso/callback` (route handler) → токен хос →
cookie. iOS native апп нь `api/auth/sso/native`-аар (ASWebAuthenticationSession +
PKCE, public client) кодоо солино.

### OIDC provider (RP-facing)
DAN нь Ory Hydra-гийн урд login/consent/logout challenge-уудыг зохицуулна:
`/oauth/login` дээр иргэнийг eID-ээр нэвтрүүлээд `provider/login/accept`,
`/oauth/consent` дээр scope зөвшөөрөөд `provider/consent/accept` хийж Hydra руу
subject-ыг өгнө.

---

## Орчны хувьсагч

`src/lib/cookies.ts`, `src/lib/api.ts`, `docker-compose.yml (web)`-д ашиглагдана.
`.env.example`-д зөвхөн эхний хоёр байгаа — бусад нь compose дээр (эсвэл prod дээр)
хэрэгтэй.

| Хувьсагч | Анхдагч | Тайлбар |
|----------|---------|---------|
| `BACKEND_URL` | `http://localhost:8080` | Go API-ийн суурь (`api/v1` угтваргүй). Зөвхөн server тал уншина. |
| `COOKIE_SECURE` | prod-д `true` | HTTPS дээр `true`. Заагаагүй бол production-д fail-closed Secure. |
| `APP_ORIGIN` | хүсэлтийн origin | CSRF `Origin` шалгалт + integration redirect_uri суурь. Prod-д заавал. |
| `GOOGLE_CLIENT_ID` | — | Google нэвтрэлтийн consent URL (нууц биш). Хоосон бол Google inert. |
| `GOOGLE_DRIVE_CLIENT_ID` / `_SECRET` | — | Google Drive интеграцийн OAuth (BFF талд token exchange). |
| `DROPBOX_CLIENT_ID` / `_SECRET` | — | Dropbox интеграцийн OAuth. |
| `GOOGLE_MEET_CLIENT_ID` / `_SECRET` | — | Google Meet орон зай үүсгэх OAuth. |

Интеграцийн `redirect_uri` = `${APP_ORIGIN}/api/integrations/<provider>/callback`.
OAuth тохируулаагүй интеграц нь "Удахгүй" төлөвтэй inert — тухайн хост руу хэзээ ч
хандахгүй.

---

## Ажиллуулах

```bash
# 1) Backend-ийг асаа (repo-ийн backend/ дор, өөр терминал дээр)
cd ../backend && make run        # http://localhost:8080
# эсвэл бүтэн стек:  docker compose up -d --build

# 2) Орчны хувьсагч
cp .env.example .env.local       # шаардлагатай бол BACKEND_URL-ийг засна

# 3) Frontend
npm install
npm run dev                      # http://localhost:3000

npm run build                    # CI: build + lint + typecheck
npm run lint
npm run test                     # vitest (bff/i18n/navigation unit test)
```

Docker дээр `web` сервис нь `output: 'standalone'` build-ээр нимгэн image болж,
дотоод сүлжээгээр `api:8080` руу прокси хийнэ (`docker-compose.yml`).

---

## gerege theme

Дизайн систем `src/app/globals.css` дотор — OKLCH токен (DAN blue `#1767E7`),
гэгээн/харанхуй загвар, Inter + JetBrains Mono фонт. Хэрэглэгчийн харагдацын
сонголт (accent/font/density/theme) нь `localStorage`-д хадгалагдаж, FOUC-аас
сэргийлэх `public/theme-bootstrap.js`-ээр render-ийн өмнө тусгагдана. Админ нь
`api/admin/site/appearance`-аар сайт-даяарх default-ыг тохируулна; нийтийн
(auth-гүй) утгыг `api/site/appearance` буцаана.

UI мөрүүд `useT()` + `src/lib/i18n.ts` (mn + en) түлхүүрээр гарна.

AI боломжуудын дотоод бүтцийг [../backend/docs/AI_PIPELINE_MN.md](../backend/docs/AI_PIPELINE_MN.md)-аас үз.
