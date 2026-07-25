# Architecture Overview

> 🌐 [English](ARCHITECTURE.md) · **Монгол**

Энэ баримт нь **Government Template Platform V3.0** (Цахим засаглалыг бүтээх суурь)
— аливаа цахим засаглалын үйлчилгээг дээр нь босгох боломжтой production-д бэлэн
суурийн ерөнхий архитектурыг тайлбарлана. Түүний тэргүүлэх жишиг deployment нь
**Government Template Platform** (**node.template.dgov.mn** дээр байрласан) —
**eID-д суурилсан төрийн үйлчилгээний платформ** (Government SSO-ийн Relying
Party) юм. Стек нь **Node.js 22 · Express 5 · TypeScript (ESM) + node-postgres
(`pg`) + PostgreSQL + Redis + Gemini AI**, Clean Architecture зарчмаар зохион
байгуулагдсан бөгөөд **статик Vite + React SPA**-аар хучигдсан (BFF БАЙХГҮЙ).

> **Хэвлэл.** Энэ repo нь Go/Next.js эх хувилбарын
> ([template.dgov.mn](https://template.dgov.mn)) Node.js/React порт юм. HTTP
> гэрээ, SQL схем, аюулгүй байдлын зан төлөв 1:1 хадгалагдсан —
> [ROADMAP](../../ROADMAP.md)-ыг үз.

Уг жишиг deployment-д платформ нь нэгэн зэрэг **eID Relying Party** (хэрэглэгч
eID-ээр нэвтэрнэ) бөгөөд **OIDC Identity Provider** (бусад төрийн апп-ууд
платформын ӨӨРИЙН provider-ээр дамжин нэвтэрнэ — Ory Hydra ХЭРЭГГҮЙ) болж
ажилладаг. PostgreSQL дахь Row-Level
Security нь хэрэглэгч тус бүрийн тусгаарлалтыг үүрдэг гол хамгаалалтын хил юм —
[Row-Level Security](#row-level-security-rls) хэсгийг үз.

> **Эх сурвалж.** Clean Architecture давхаргалал, өгөгдлийн давхарга, кэш,
> observability, тестийн стратеги нь нээлттэй эх төсөл
> [snykk/go-rest-boilerplate](https://github.com/snykk/go-rest-boilerplate)
> (Najib Fikri, MIT)-оос гаралтай. Auth стек, RLS аюулгүй байдлын загвар,
> eID/SSO/OIDC-provider интеграцууд, доорх feature модулиуд нь энэ платформд
> зориулж бүтээгдсэн. MIT уламжлалт бүтээл болохын хувьд эх зохиогчийн эрхийг
> хадгалсан — [Зохиогчид](#credits--license) хэсгийг үз.

## Давхаргын диаграм (Layer Diagram)

```
┌─────────────────────────────────────────────────────────────────┐
│                        HTTP Layer                                 │
│  src/cmd/api/server → Middleware → src/http/handlers/v1           │
│  src/http/{routes, dto, middlewares, cookies}                     │
├─────────────────────────────────────────────────────────────────┤
│                       Usecase Layer                               │
│  src/usecases/*  (24 bounded contexts)                            │
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

## Feature модулиуд (bounded contexts)

Платформ нь `src/usecases/` дор **24 usecase модулиас** бүрддэг —
тус бүр нь interface + implementation бөгөөд composition root дотор гараар
холбогддог. Boilerplate цөмөөс (`auth`, `users`, `rbac`, `ai`) гадна платформ нь
eID/SSO/төрийн үйлчилгээний гадаргууг нэмдэг:

| Модуль         | Үүрэг |
|----------------|-------|
| `auth`         | **eID нэвтрэлт** (QR / mobile deep-link / РД-аар push + long-poll), **Google OAuth** account холболт, session refresh/logout. Нууц үггүй. |
| `users`        | auth, admin, sign, superadmin-д дахин ашиглагдах хэрэглэгчийн уншилт/бичилт; нэвтрэлтийн lockout; нууц үг солих токены cutoff. |
| `rbac`         | Динамик role + permission каталог, RBAC middleware-ийн permission resolver. |
| `ai`           | Gemini pipeline — function-calling чат, STT/TTS, шууд орчуулга, давхаргат prompt, server-тал tools + мэдлэгийн сан. |
| `org`          | Байгууллага + гишүүнчлэл (eID-тэй холбогдсон; **RLS**). |
| `gov`          | Иргэний "Төрийн үйлчилгээ" портал — хүсэлт, лавлагаа, мэдэгдэл, төлбөр, цаг захиалга (per-user, **RLS**); каталог нийтийн. |
| `gateway`      | API gateway — services / routes / policies + телеметр (service бүр OAuth `scope`-той). |
| `applications` | Нэгдсэн OAuth2 **client бүртгэл** (RP + m2m) — платформын ӨӨРИЙН `oauth_clients` хүснэгтэд; per-service хандалт нь OAuth scope (`application_services` → `gateway_services.scope`). Admin удирдана (`gateway.manage`). Secret нь Argon2id-ээр хадгалагдана; Hydra-гийн PBKDF2 хэлбэрийг ЗӨВХӨН шалгах зорилгоор дэмжсэн тул одоо байгаа client-ууд хэвээр ажиллана. |
| `core`         | Gerege Core (`core.gerege.mn`) USER FIND / ORG FIND лавлагааны wrap. |
| `provider`     | **OIDC Provider** — login/consent/logout цөм нь дотоод `usecases/oidc`-ийн өмнө; платформ өөрөө SSO IdP. |
| `integrations` | Хэрэглэгчийн гуравдагч этгээдийн OAuth (Google Drive/Meet, Dropbox); токеныг **AES-256-GCM шифрлэн** хадгална (**RLS**). |
| `assets`       | Хувь хүний гарын үсгийн зураг + байгууллагын тамга (зураг Google Drive-д, URL DB-д). |
| `gspace`       | Gerege Space — апп-ын өөрийн SFTP хадгалалт, per-user квот (default 2 MB). |
| `audit`        | Persisted **hash-chained, append-only** audit log (admin унших API). |
| `superadmin`   | Админ хэрэглэгчдийг удирдах (үүсгэх / эрх олгох / хасах); мутаци бүр audit log-д бичигдэнэ. |
| `security`     | Security-event ingest (нэвтэрсэн хэрэглэгч бичнэ, admin уншина). |
| `site`         | Сайтын нийтийн харагдацын default (accent / font / density / theme). |
| `sign`         | PDF гарын үсэг (**PAdES**) eidmongolia `/v3`-ээр, серверийн Document-Signer гэрчилгээтэйгээр. |
| `oidc`         | **OIDC issuer** өөрөө — authorize/token/introspect/userinfo/revoke, RSA түлхүүрийн менежер + JWKS, нэг удаагийн code ба refresh токены гэр бүл. |
| `sso`          | Платформ нь SSO-ийн **хэрэглэгч** (`sso.dgov.mn`-ий Relying Party): Redis дэх нэг удаагийн state, иргэний дугаараар eID данстай нэгтгэдэг 3 шатлалт upsert. |
| `ssotoken`     | Хэрэглэгчийн SSO токеныг хадгалж/шинэчилнэ (AES-256-GCM) — PKI-г SSO-гоор унших сонголтот замыг ажиллагаатай болгодог. |
| `registry`     | Үйлчилгээний **регистр** (CPSV-AP паспорт): ноорог, хувилбар, нотлох баримт, амьдралын үйл явдал, нийтлэх/архивлах, once-only зөрчлийн шинжилгээ. Нийтийн `catalog` уншилтыг мөн хангана. |
| `relay`        | Байгууллага хоорондын хүсэлтийн **дамжуулалт**: peer бүртгэл, HMAC гарын үсэгтэй webhook, чиглүүлэлт, SLA sweep + escalation, демо симулятор. |
| `superadmin_onboarding` | Super admin болох ЦОРЫН ГАНЦ хаалга: урилга → Google → eID → и-мэйл OTP → TOTP, нөөц кодтой. TOTP баталгаажих хүртэл ямар ч session олгогдохгүй. |

## Лавлахын бүтэц (Directory Structure)

```
backend/
├── src/
│   ├── cmd/
│   │   ├── api/
│   │   │   ├── main.ts             # Нэвтрэх цэг (config + logger init)
│   │   │   └── server/server.ts    # Composition root (гар DI) — бүх mount ЭНД уншигдана
│   │   ├── migration/              # Migration CLI (зөвхөн SQL; ORM/AutoMigrate БАЙХГҮЙ)
│   │   ├── healthcheck/            # Контейнерийн HEALTHCHECK-д ашиглагдах жижиг binary
│   │   └── openapi/                # docs/openapi.json үүсгэнэ (CI-д drift шалгагдана)
│   ├── apperror/                   # Төрөлжсөн domain алдаа (→ HTTP статус)
│   ├── config/                     # Env ачаалагч + guard-ууд + .env задлагч
│   ├── constants/                  # Env, logger, алдаа, endpoint-ийн тогтмолууд
│   ├── domain/                     # Домэйн entity-үүд (хамгийн дотоод давхарга)
│   ├── usecases/                   # 24 bounded context (interface + impl)
│   ├── datasources/
│   │   ├── caches/                 # redis.ts + memory.ts (хоёр шатлалт)
│   │   ├── drivers/                # pg pool + `withRLS` + RLS мөрдөлтийн boot guard
│   │   ├── migration/              # SQL migration runner (advisory lock-той)
│   │   ├── records/                # snake_case мөрийн interface + record↔domain хөрвүүлэгч
│   │   └── repositories/
│   │       ├── interface/          # Gateway хийсвэрлэл (usecase-ууд ҮҮНЭЭС хамаарна)
│   │       └── postgres/*          # Хэрэгжүүлэлт (гараар бичсэн SQL, withRLS)
│   ├── http/
│   │   ├── cookies.ts              # httpOnly session cookie + CSRF + OAuth state
│   │   ├── dto/                    # request (zod strictObject) + response хэлбэр
│   │   ├── handlers/v1/            # HTTP handler-ууд (модуль тус бүрд)
│   │   ├── middlewares/            # Глобал + route тус бүрийн middleware (16)
│   │   ├── routes/                 # Route бүртгэл — модуль тус бүрд route_<domain>.ts
│   │   └── response.ts             # wrap · decodeBody · BaseResponse дугтуй
│   └── pkg/                        # Framework-ээс хараат бус client болон хэрэгслүүд (21 багц)
│       ├── eid/ google/ xyp/       # Identity: eID RP, Google OAuth, XYP байгууллагын бүртгэл
│       ├── oidc/ jwt/ secrethash/  # OIDC RP client, JWT, Argon2id/PBKDF2 secret hash
│       ├── oauthproviders/ cloudfiles/  # Гуравдагч талын OAuth + Drive/Dropbox/Meet REST
│       ├── gemini/                 # SDK-гүй Gemini REST (function calling, аудио, PCM→WAV)
│       ├── pdf/ gspace/ verify/    # PAdES гарын үсэг, SFTP хадгалалт, Verify API OTP
│       ├── totp/ recovery/ crypto/ # MFA, нөөц код, AES-256-GCM
│       ├── audit/                  # Hash-chain аудит (Go-той байт-нийцтэй)
│       ├── ctx/ logger/ validators/# Ил хүсэлтийн контекст, pino лог, zod туслахууд
│       └── observability/          # OTel tracing + Prometheus metrics тохиргоо
├── migrations/                     # Дугаарласан SQL (N_name.up.sql + .down.sql) — Go-гоос ХЭВЭЭР
├── docs/                           # EN/MN баримт + үүсгэсэн openapi.json
└── scripts/                        # smoke-esm.mjs (CommonJS/ESM interop-ийн gate)
```

> **`internal/` БАЙХГҮЙ.** Go хувилбар нь багцыг хаалттай байлгахдаа Go-гийн
> `internal/` дүрмийг ашигладаг байсан. TypeScript-д тийм механизм байхгүй тул
> хилийг **lint дүрэм + код хяналт + доорх хамаарлын чиглэл** барина, compiler
> БИШ. "usecase нь postgres адаптерыг import хийж болохгүй" гэдгийг `tsc`
> зогсоохгүй ч хатуу дүрэм гэж үзнэ.

## Хамаарлын урсгал (Dependency Flow)

Хамаарал ЗӨВХӨН дотогшоо урсана (Clean Architecture-ийн зарчим):

```
HTTP → Usecase → Repository → Domain
  │        │          │
  ▼        ▼          ▼
 DTO   Interface   pg/SQL
```

- **HTTP давхарга** нь **Usecase**-ийн interface-ээс хамаарна (`AuthUsecase`, `UsersUsecase`, …).
- **Usecase давхарга** нь **Repository**-ийн interface-ээс (`datasources/repositories/interface`) хамаарна — postgres адаптераас ХЭЗЭЭ Ч биш.
- **Repository давхарга** нь **Domain** entity-үүдээс хамаарна.
- **Domain давхарга** нь дотоод юу ч import хийхгүй — зөвхөн `node:*` ба `bcryptjs`.

`src/usecases/**` болон `src/datasources/repositories/**` нь Express-ийн ямар ч
төрлийг import хийхгүй тул бизнес кодыг хөндөлгүйгээр delivery framework-ийг
солих боломжтой.

Гагцхүү нэг хуваалцсан leaf нь `pkg/ctx` — хүсэлт тус бүрийн RLS identity,
requestId болон `AbortSignal`-ыг гурван давхаргад import цикл үүсгэлгүйгээр
зөөнө. **Контекст нь ИЛ**: repository болон usecase бүр `ctx: Ctx`-ийг эхний
аргумент болгон авна. Энэ нь Go-гийн `context.Context`-ийн эквивалент бөгөөд
"identity дамжуулахаа мартах" алдааг чимээгүй RLS тойролт биш **compile алдаа**
болгодог.

## Гол бүрэлдэхүүн хэсгүүд (Key Components)

### 1. HTTP давхарга

**Composition root:** `src/cmd/api/server/server.ts` — гар DI-ийн ЦОРЫН ГАНЦ цэг.
Бүх mount-ыг харахын тулд эхнээс нь дуустал уншина. Энэ нь:

- tracing, `pg` pool (RLS boot guard-тай), Redis + процесс доторх кэш, JWT үйлчилгээ болон гадаад client бүрийг (eID, Google, XYP, OIDC, Gemini, Verify, Gerege Space, Gerege Core) эхлүүлнэ;
- repository → usecase → route-ыг ГАРААР холбоно (глобал singleton, DI контейнер БАЙХГҮЙ);
- Express апп-ыг угсарч, глобал middleware стекийг суулгаж, route модуль бүрийг `/api/v1` дор mount хийнэ;
- OIDC provider-ийн гадаргууг **ҮНДСЭН** замд (`/oauth2/*`, `/userinfo`, `/.well-known/*`) mount хийнэ — эдгээр замыг стандарт тогтоодог тул `/api/v1` дор байрлаж БОЛОХГҮЙ;
- арын ажлуудыг (relay SLA sweep, демо симулятор) эхлүүлж, graceful shutdown-ыг хариуцна (HTTP, rate limiter, pg pool, Redis, tracer, worker-үүдийг цэвэрлэнэ).

**Routes:** `src/http/routes/` — модуль тус бүрд нэг файл (`route_auth.ts`,
`route_gov.ts`, `route_oidc.ts`, …).

> ⚠️ **Express-ийн middleware хүрээ нь chi-ийн `Group` БИШ.**
> chi-д `r.Group(...)` нь middleware-ийг зөвхөн тэр дотор зарласан route-уудад
> хэрэглэдэг. Express-д ийм зүйл байхгүй — `router.use(sub)` нь дэд router-ийн
> `use()`-г тэр цэгээс хойших **БҮХ** хүсэлтэд ажиллуулна. Тиймээс middleware-ийг
> route ТУС БҮРД дамжуулна (`auth.post('/eid/start', strict, wrap(h))`), модуль
> дотор `use()`-ээр ХЭЗЭЭ Ч биш. Үүнийг буруу хийвэл auth эсвэл rate limit нь
> байх ёсгүй endpoint рүү чимээгүй гоожино; `route_auth.test.ts` бодит гинжийг
> барина.

**Handlers:** `src/http/handlers/v1/` — домэйн тус бүрд нэг модуль. Handler-ийн
гарын үсэг нь `(req, res) => Promise<void>`, `wrap()`-аар боогдоно; биеийг
`decodeBody(req, schema)`-ээр НЭГ алхамд задалж баталгаажуулна (zod
`strictObject` — танихгүй талбар татгалзагдана, Go-гийн
`DisallowUnknownFields`-тэй дүйцнэ); хариу нь `newSuccessResponse` /
`respondWithError`-оор явна.

### 2. Middleware stack

Глобал middleware, `server.ts` дотор ЭНЭ дарааллаар (дараалал чухал — requestId
эхэнд байснаар дараагийн лог мөр бүр болон сэргээлтийн хариу `request_id` зөөнө):

1. **Request ID** — `X-Request-ID`-ийг үүсгэж/дамжуулан `ctx` + logger рүү тавина.
2. **Client IP** — дуудагчийн IP-г тогтооно; `X-Forwarded-For`-д **ЗӨВХӨН** `TRUSTED_PROXIES`-ээс ирвэл итгэнэ (fail-safe: анхдагчаар итгэхгүй).
3. **Metrics** — Prometheus-ийн хүсэлтийн тоолуур + хоцролт.
4. **Security headers** — HSTS, CSP (`default-src 'none'` — API нь JSON буцаадаг), nosniff, frame options, referrer policy.
5. **CORS** — origin-ууд `ALLOWED_ORIGINS`-ээс (wildcard зөвхөн production-оос гадуур).
6. **Body size limit** — глобал тааз; route бүлэг тус бүрд илүү чанга хязгаар.
7. **Body parser-ууд** — `/relay/webhook`-д `express.raw` нь `express.json`-оос **ӨМНӨ** (HMAC нь ТҮҮХИЙ байт дээр шалгагддаг; дахин цувуулсан JSON гарын үсгийг эвдэнэ), дараа нь JSON + urlencoded.
8. **CSRF** — cookie-гоор баталгаажсан мутацид double-submit шалгалт (Bearer хүсэлт ambient биш тул алгасна).
9. **Access log** — бүтэцлэгдсэн нэг мөрийн лог.
10. **Timeout** — хүсэлт тус бүрийн хугацаа, `ctx`-ийн `AbortSignal`-тай холбогдсон.

**ХАМГИЙН СҮҮЛД** бүртгэгдэнэ: 404 handler ба **recoverer** (Express 5-ийн
алдааны middleware нь хамгаалж буй route-уудынхаа ДАРАА байх ёстой).

**Бүлэг / route тус бүрийн middleware:**

- **Auth** — JWT-г шалгана (Bearer **эсвэл** `dgov_access` httpOnly cookie), `CurrentUser`-ыг тавьж, **RLS identity-г тогтооно**: админд `withAdmin`, бусад тохиолдолд `withUser`.
- **Service RLS context** — нэргүй `/auth` бүлэгт суудаг тул нэвтрэхээс өмнөх урсгалууд (eID upsert, refresh дэх identity хайлт) итгэмжит `service` RLS үүргээр ажиллана.
- **RBAC** (`requirePermission`, `requireAdmin`, `requireSuperAdmin`) — auth-ийн дараах декларатив эрх олголт; админ эрхийн шалгалтыг тойрно. Resolver алдаа дээр fail-closed.
- **Observability gate** — `/metrics` ба `/swagger/doc.json`-ыг хамгаална ([Ops endpoint-үүд](#ops-endpoint)-ийг үз).
- **Rate limiter-ууд** — дөрөв тусдаа: `/auth` ~5/мин, `/ai` ~20/мин (burst 10, орчуулгын урсгалд), `/auth/eid/poll` ~120/мин (long-poll-д), gov/assets/gspace/eID-профайлын **бичилт** ~30/мин.

### 3. Usecase давхарга

**Байршил:** `src/usecases/` — bounded context бүр interface + хэрэгжүүлэлт
гаргана. Үүрэг: бизнес дүрмийн шалгалт, repository + кэш + гадаад client-ийн
зохион байгуулалт, `apperror.*` шидэх (дотоод шалтгааныг `apperror.internalCause`-
ээр боож, library-ийн алдаа клиентэд ХЭЗЭЭ Ч хүрэхгүй). Usecase нь зөвхөн
`datasources/repositories/interface`-ээс хамаарна — postgres адаптераас биш.

### 4. Repository давхарга

**Байршил:** `src/datasources/repositories/` — `interface/` нь gateway хийсвэрлэл;
`postgres/*` нь `pg` болон гараар бичсэн SQL-ээр хэрэгжүүлнэ. Гол зүйлс:

- Метод бүр `ctx`-ийг эхэнд авна; мөрүүд нь **баганын нэртэй яг таарсан snake_case түлхүүртэй** энгийн interface (`records/`).
- **ЗӨВХӨН параметржүүлсэн query** (`$1, $2 …`) — мөр нийлүүлэлт ХЭЗЭЭ Ч биш.
- Soft delete нь ил `deleted_at IS NULL` предикатаар.
- `store` нь нэг round-trip `INSERT … RETURNING` ашиглана.
- Давхардсан түлхүүрийг PostgreSQL-ийн `23505` кодоор илрүүлж `apperror.conflict` болгоно.
- Хэрэглэгч тус бүрийн repository нь query бүрийг **`withRLS` транзакц** дотор ажиллуулж, хүсэлтийн identity-г `SET LOCAL` хүрээт GUC болгон нийтэлнэ ([Row-Level Security](#row-level-security-rls)-ийг үз).

### 5. Domain давхарга

**Байршил:** `src/domain/` — entity-үүд бизнес дүрэм агуулж, дотоод юунаас ч
хамаарахгүй. `users.ts` нь үүргийн загвар болон eID хэрэглэгчийн конструкторыг
(`newEIDUser` — нууц үггүй, `active = true`, `civil_id`-аар түлхүүрлэгдсэн)
тодорхойлно. Үүргийн тогтмолуудыг [Эрх олголт](#эрх-олголт-authorization)-оос үз.

## Танилт (Authentication)

Платформ нь **JWT access + refresh токен** (`pkg/jwt`) олгодог ч **нууц
үгээр нэвтрэх, email/OTP бүртгэл, нууц үг сэргээх зэрэг байхгүй**. Identity нь
зөвхөн гадаад provider-оос ирнэ. Endpoint-ийн хэлбэрийг
[API_CONTRACT.md](API_CONTRACT_MN.md)-ээс үз; route-ууд нь
`src/http/routes/route_auth.ts`, `route_eidprofile.ts`-д
бүртгэгддэг.

**1. eID-ээр нэвтрэх (үндсэн арга).** Апп нь eID Mongolia-ийн Relying Party
(`pkg/eid`, `EID_*` тохиргоо):
- `POST /api/v1/auth/eid/start` — session эхлүүлж QR код / mobile deep-link буцаана.
- `POST /api/v1/auth/eid/start-id` — иргэний РД-аар эхлүүлж, бүртгэлтэй төхөөрөмж рүү push хийнэ.
- `POST /api/v1/auth/eid/poll` — frontend **long-poll** хийнэ (~2.5с тутам; IdP-г poll бүрд 25с хүртэл барина) eID session `COMPLETE` болтол. Дуусахад хэрэглэгчийг upsert хийж (`civil_id`-ээр түлхүүрлэнэ; нийтийн RP нь `national_id` биш `civil_id` авдаг) токен хос олгоно.

**2. Google OAuth account холболт** (`pkg/google`, `GOOGLE_*`): `POST
/api/v1/auth/google` нь code-ийг exchange хийж, eID хэрэглэгчид холбогдсон Google
account-аар нэвтрүүлнэ (эсвэл холбоно); `DELETE /api/v1/auth/google/link` салгана.

**Session-ийн амьдралын мөчлөг** (нэвтрэх аргаас үл хамаарна):
- `POST /api/v1/auth/refresh` — токен хосыг сэлгэнэ; credential-солих cutoff-оос өмнө олгогдсон токенуудыг татгалзана (`User.TokensRevokedBefore`). `kind` claim guard нь refresh токеныг access болгон ашиглахаас сэргийлнэ.
- `POST /api/v1/auth/logout` — refresh токеныг хүчингүй болгоно.

> **Тэмдэглэл.** Go хувилбарт `auth_login.go`, `auth_register.go`,
> `auth_send_otp.go`, `auth_forgot_password.go`, `auth_reset_password.go` зэрэг
> route-д холбогдоогүй handler файлууд үлдсэн. Тэдгээрийг **порт хийгээгүй** —
> үхмэл код портоор дамжих ёсгүй.
>
> Ганц үл хамаарах зүйл нь `PUT /auth/password/change`: Go хувилбарт handler +
> usecase нь ажиллагаатай байсан ч route-д холбогдоогүй үлдсэн (frontend-ийн
> маягт 404 авдаг байв), тиймээс энэ хэвлэлд **холбогдсон**. Амжилтын дараа
> цуцлалтын тасалбар тэмдэглэгдэж session cookie цэвэрлэгддэг — хэрэглэгч дахин
> нэвтэрнэ.

## Эрх олголт (Authorization)

Эрх олголт хоёр давхаргад хэрэгждэг: HTTP ирмэг дээр **JWT role/permission**, DB
дээр **RLS**.

**Role загвар** (`src/domain/users.ts`; `23_superadmin_role` migration) — зэрэглэлтэй 4
role, `1` = хамгийн дээд:

```ts
RoleSuperAdmin = 1  // админ хэрэглэгчдийг удирдана; RequireSuperAdmin-аар хаагдана
RoleAdmin      = 2  // бүх эрх; IsAdmin() true
RoleManager    = 3
RoleUser        = 4  // шинэ eID хэрэглэгчийн default
```

`isAdmin()` нь `RoleAdmin` **болон** `RoleSuperAdmin` хоёуланд true (super admin нь
admin-ийн JWT/RLS/permission замыг өвлөнө); `isSuperAdmin()` зөвхөн `RoleSuperAdmin`-д
true. Role ID `0` нь claim-гүй хуучин токенуудын sentinel бөгөөд RBAC middleware
үүнийг `RoleUser` рүү буулгана.

**Динамик RBAC** — role-ийн бүдүүн зэрэглэлээс гадна `RBACUsecase` нь role-ийн
permission багцыг DB-ээс шийддэг (`8_rbac_roles_permissions` migration).
`requirePermission(resolver, perm)` нь route-ийг нэрлэсэн permission-оор хаана;
admin давна. Super admin-ыг `SUPERADMIN_EMAIL` (эсвэл DB)-ээс bootstrap хийнэ,
хэзээ ч API-аар биш.

## Row-Level Security (RLS)

RLS нь платформын хэрэглэгч тус бүрийн тусгаарлалтыг үүрдэг гол хамгаалалтын хил —
repository-ийн аль хэдийн бичдэг `WHERE user_id = …` нөхцлийн доор defense-in-depth.
Query-ийн алдаа хүртэл өөр хэрэглэгчийн мөрийг буцааж чадахгүйг баталгаажуулна.

**Context дээрх identity** (`src/pkg/ctx/ctx.ts`) — leaf багц (зөвхөн
стандарт `context`) нь `Identity{ UserID, Role }`-г зөөнө; `Role` нь SQL policy-ийн
литералтай ЯГ таарах ёстой 3 string тогтмолын нэг:

- `service` — итгэмжит нэвтрэхээс өмнөх / системийн урсгал (eID upsert, refresh identity хайлт, bootstrap). `/auth` дээр `serviceRLSContext()`-оор тавигдана; бүрэн эрх.
- `admin` — бүх мөрд бүрэн хандана. admin JWT-д auth middleware `withAdmin`-аар тавина.
- `user` — зөвхөн дуудагчийн өөрийн мөр. auth middleware `withUser`-аар тавина.

**Identity-г нийтлэх** (`src/datasources/drivers/pg.ts`, мөн `org`, `gov`,
`security`, `userintegrations`-т хуулбар) — `withRLS(ctx, fn)` туслах нь
query бүрийг транзакцид боож дараахыг ажиллуулна:

```go
SELECT set_config('app.user_id',   $1, true),   -- is_local = true ⇒ SET LOCAL семантик
       set_config('app.user_role',  $2, true)
```

`set_config(..., true)` нь утгыг транзакцид scope хийдэг тул identity нь pool дахь
холболтуудаар алдагдахгүй. Context-д identity **байхгүй** үед хоёр GUC хоосон болно —
хоосон `app.user_role` нь ямар ч policy-д таарахгүй тул бүх мөр нуугдаж, бүх бичилт
татгалзагдана (**fail-closed**). `audit` repository role-only хувилбар ашигладаг.

**Хүснэгт тус бүрийн policy** — RLS-тэй хүснэгт бүр `ENABLE` **болон** `FORCE ROW
LEVEL SECURITY` ашиглана (FORCE нь хүснэгтийн эзэнд ч RLS-ийг хэрэгжүүлнэ). Policy-ууд
permissive (OR) бөгөөд ижил 3 GUC role-ийг таньдаг. `user` policy нь `user_id =
NULLIF(current_setting('app.user_id', true), '')::uuid`-ээр хаадаг (`NULLIF` нь хоосон
GUC-ийг `NULL` болгож cast алдаанаас сэргийлж мөрийг зүгээр л хасна):

| Migration | Хүснэгт(үүд) | RLS |
|-----------|--------------|-----|
| `7_enable_rls_users`      | `users`                                                                     | ENABLE + FORCE; service / admin / self |
| `14_organizations`        | `organizations`, `organization_memberships`                                 | ENABLE + FORCE; **гишүүнчлэлээр** харагдац |
| `17_org_rls_recursion_fix`| (org policy-уудыг дахин үүсгэнэ)                                             | policy рекурс (SQLSTATE 42P17)-ыг таслах `SECURITY DEFINER` `app_is_org_member()` ашиглана |
| `20_gov_services`         | `gov_applications`, `gov_references`, `gov_notifications`, `gov_payments`, `gov_appointments` | ENABLE + FORCE; service / admin / self. (`gov_services` каталог нийтийн, RLS-гүй) |
| `21_user_integrations`    | `user_integrations`                                                         | ENABLE + FORCE; service / admin / self |

Нийтийн config хүснэгтүүд санаатайгаар **RLS-гүй**; тэдгээрийн DB backstop нь
`app_user` role-ийн эсрэг хүснэгтийн эрхийн `REVOKE` юм
(`17_least_privilege_config_grants` — `permissions` / `role_permissions` /
`ai_prompts` / `ai_knowledge`; `27_site_appearance` — singleton appearance мөр).
Provider хүснэгтүүд (`26_sso_provider`: `developer_apps`, `admin_api_keys`,
`login_events`) болон `org_stamps` (`25`) мөн RLS-гүй, usecase/handler давхаргад
хамгаалагдана.

**Boot үеийн enforceability guard** — RLS-ийг Postgres superuser болон `BYPASSRLS`
role чимээгүй алгасдаг тул `guardRLSEnforceable`
(`src/datasources/drivers/pg.ts`) нь эхлэлд холбогдож буй role-ийн
`pg_roles`-ийг шалгана:

- Role-д `rolsuper` эсвэл `rolbypassrls` байвал: **production fail-closed** (boot зогсоно, pool хаагдана); **development анхааруулга** логоод үргэлжилнэ (migrate/тест superuser хэрэглэж болно).
- Иймд api нь production-д least-privilege non-superuser role-оор (жишээ `app_user`) холбогдох ёстой. (Compose стек санаатайгаар `ENVIRONMENT=development` ажилладаг тул guard зөвхөн production-д хатуу унагана.)

## OIDC Provider (дотоод — Ory Hydra БАЙХГҮЙ)

Платформ өөрөө **Identity Provider** болж чадна: бусад төрийн апп-ууд нэвтрэлтээ
энэ рүү даатгана. **Ory Hydra-г ХАССАН** — provider нь repo дотроо хэрэгжсэн
(`src/usecases/oidc` + `src/usecases/provider` + `oauth_clients`, `oauth_flow`,
`oauth_keys` хүснэгтүүд). `OAUTH_ISSUER` ба `SSO_STATE_KEY` тохируулагдсан үед
идэвхжинэ; эс бөгөөс инерт хэвээр.

- **Стандартын endpoint-ууд** нь `/api/v1` дор БИШ, **ҮНДСЭН** замд байрлана — OIDC стандарт тэдгээрийг тогтоодог: `GET /oauth2/auth`, `POST /oauth2/token`, `POST /oauth2/introspect`, `POST /oauth2/revoke`, `GET /oauth2/sessions/logout`, `GET|POST /userinfo`, `GET /.well-known/openid-configuration`, `GET /.well-known/jwks.json`.
- **Login / consent / logout цөм** — `usecases/provider` нь challenge урсгалыг жолоодно; first-party client-ууд (`SSO_FIRSTPARTY_CLIENTS`) consent UI-г алгасна. `/api/v1/provider` дор mount.
- **Applications (client бүртгэл)** — `usecases/applications` (`/api/v1/applications`, `gateway.manage`-ээр хамгаалагдсан) нь OAuth2 client бүртгэнэ: RP апп-ууд (`web`/`spa`/`native` → `authorization_code`; `spa`/`native` нь public → PKCE, secret-гүй) болон m2m client (`client_credentials`). Per-service хандалт нь OAuth scope-оор илэрхийлэгдэнэ (`application_services` → `gateway_services.scope`); confidential `client_secret` нь create/rotate үед **нэг удаа** харагдаж, зөвхөн Argon2id hash-аар хадгалагдана.
- **Гарын үсгийн түлхүүр** — `usecases/oidc/keys.ts` нь RSA-2048 түлхүүр удирдана; `kid` нь RFC 7638 thumbprint. Хувийн түлхүүр **AES-256-GCM-ээр шифрлэгдэж** хадгалагдана; эргэлт хийхэд хуучин нийтийн түлхүүр JWKS-д үлдэх тул дамжиж буй токен шалгагдсаар байна.

**Мэдэх нь зүйтэй аюулгүй байдлын шинжүүд** (бүгд тесттэй):

- `redirect_uri` нь **ЯГ** тулгагдана — prefix эсвэл wildcard-аар ХЭЗЭЭ Ч биш. Client эсвэл redirect буруу бол алдааг RP руу **ЧИГЛҮҮЛЭХГҮЙ**, тиймээс баталгаажаагүй хаяг руу чиглүүлэх нь бүтцийн хувьд боломжгүй.
- Public client-д PKCE ЗААВАЛ, зөвхөн `S256`.
- Authorization code нь **НЭГ УДААГИЙН**: дахин ирвэл тухайн иргэн+апп-ийн бүх токен цуцлагдана. Хэрэглэгдсэн *refresh* токен дахин ирвэл **ГЭР БҮЛ** бүхэлдээ цуцлагдана (RFC 9700 §4.14.2).
- Client-ийн зарласан auth арга хатуу мөрдөгдөнө (downgrade хаалттай); public client нь introspect/revoke хийж чадахгүй.
- `google` claim-ууд зөвхөн `google` scope-той үед л гарна (data minimization).

> **Мөрдөлтийн анхааруулга (Go хувилбартай адил).** Апп-д service олгох нь тухайн
> client-ийн OAuth **scope**-ыг тогтооно — энэ нь зөвхөн бүртгэл/тохиргоо.
> *Ажиллах үеийн* хүсэлт тус бүрийн мөрдөлт нь өгөгдсөн токеныг route бүрийн
> service scope-той тулгаж introspect хийдэг gateway прокси шаардана, тэр прокси
> **хараахан байхгүй**. Олголтыг мөрдөгдсөн эрх олголт гэж бүү андуур.

## Өгөгдлийн сан (Database)

- **Driver:** [node-postgres](https://node-postgres.com/) (`pg`) холболтын сантай, гараар бичсэн SQL — **ORM-гүй**.
- **Database:** PostgreSQL, **Row-Level Security**-г хэрэглэгч тус бүрийн хил болгосон.
- **Migrations:** `migrations/` доторх дугаарласан SQL файлууд (`N_name.up.sql` + `.down.sql`), `migrate` compose service / `src/cmd/migration`-оор хэрэгжинэ. Файлууд нь **Go хувилбартай байт-ижил** тул нэг өгөгдлийн сан хоёуланд үйлчилнэ. **AutoMigrate байхгүй** — schema нь зөвхөн `*.up.sql` файлуудаас гарна. Runner нь advisory lock-той, идемпотент тул зэрэг boot хийхэд аюулгүй.
- **Tracing:** `@opentelemetry/auto-instrumentations-node`-оор OpenTelemetry (`pg` болон HTTP-г автоматаар instrument хийнэ).

> **Migration дугаарлалтын мөргөлдөөн.** Хоёр migration `17_` prefix-ийг хуваалцана:
> `17_least_privilege_config_grants` болон `17_org_rls_recursion_fix`. Тэдгээр нь
> хамааралгүй бөгөөд хоёул хэрэгжинэ; runner нь дугаарласан файлуудыг эрэмбэлдэг тул
> `18_`-аас дээш migration нэмэх эсвэл хэрэгжих дарааллыг тооцоолохдоо үүнийг санана уу.

### Холболтын удирдлага (Connection Management)

Pool нь env-ээс тохируулагдана (`src/datasources/drivers/pg.ts`,
`SetupPgxPostgres`):

```go
poolCfg.MaxConns        = cfg.MaxConns    // DB_MAX_OPEN_CONNS   (default 25)
poolCfg.MinConns        = cfg.MinConns    // DB_MAX_IDLE_CONNS   (default 5)
poolCfg.MaxConnLifetime = cfg.MaxLifetime // DB_CONN_MAX_LIFE_MINS (default 15)
```

Production нь TLS-баталгаажсан DSN шаардана (`sslmode=verify-full` эсвэл `verify-ca`)
— config guard-аар хэрэгжинэ.

## Observability

### Logging
- **Сан:** Zap (бүтэцлэгдсэн), `pkg/logger`-ээр. production-д JSON, development-д console. Request ID + trace ID нь `*WithContext` туслахуудаар дамжина.

### Metrics
- **Сан:** Prometheus, endpoint `GET /metrics` (хаалттай — [Ops endpoint-ууд](#ops-endpoint-үүд)-ийг үз). HTTP хүсэлтийн тоолуур/latency, давхарга бүрийн кэш hit/miss/error, OTP илгээлтийн үр дүн, `pg` pool-ийн бодит статистик.

### Tracing
- **Сан:** OpenTelemetry; exporter-ийг `OTEL_EXPORTER`-оор сонгоно (хоосон = noop, `stdout`, эсвэл `otlp`), sampling-ийг `OTEL_SAMPLE_RATIO`-оор.

## Ops endpoint-үүд

| Endpoint | Хандалт |
|----------|---------|
| `GET /health` | Нээлттэй — liveness (load balancer / orchestrator-т). |
| `GET /ready`  | Нээлттэй — readiness: DB ping (`pg` pool) + Redis probe. |
| `GET /metrics` | **Хаалттай** `observabilityGate`-аар. |
| `GET /swagger/doc.json` | **Хаалттай** `observabilityGate`-аар. |

`observabilityGate` (`src/http/middlewares/observability_gate.ts`) нь операторын мэдрэмжтэй 2
endpoint-ийг хамгаална: **development**-д үргэлж нээлттэй; **production**-д
`Authorization: Bearer <OBSERVABILITY_TOKEN>` (constant-time харьцуулна) шаардаж,
аливаа таарахгүй эсвэл `OBSERVABILITY_TOKEN` хоосон үед **404** (401 биш) буцаана —
ингэснээр endpoint-ийн оршин байгаа нь reconnaissance-аас нуугдана.

## Аюулгүй байдлын онцлогууд (Security Features)

| Онцлог             | Хэрэгжүүлэлт                              | Байршил |
|--------------------|-------------------------------------------|----------|
| Row-Level Security | per-user DB тусгаарлалт + boot guard      | `pkg/ctx`, `datasources/drivers/pg.ts`, migrations `7/14/20/21` |
| Танилт (identity)  | eID RP + Google OAuth                     | `usecases/auth`, `pkg/{eid,google}` |
| Session зөөвөрлөлт | httpOnly cookie + давхар CSRF             | `http/cookies.ts`, `http/middlewares/csrf.ts` |
| Эрх олголт         | 4-role загвар + динамик RBAC              | `domain/users.ts`, `http/middlewares/rbac.ts` |
| Аюулгүй толгой     | API: `default-src 'none'`; SPA: бүрэн CSP | `http/middlewares/security.ts`, `frontend/nginx-security-headers.conf` |
| CORS               | env whitelist, wildcard зөвхөн dev        | `http/middlewares/cors.ts` |
| Rate limiting      | per-IP (auth / ai / poll / gov-write)     | `http/middlewares/ratelimit.ts` |
| Биеийн хязгаар     | глобал + `/auth`-д илүү чанга             | `http/middlewares/bodysizelimit.ts` |
| Ops endpoint-ийн gate | bearer token, prod-д 404               | `http/middlewares/observability_gate.ts` |
| Оролтын шалгалт    | zod `strictObject` (танихгүй талбар → 422)| `http/dto/requests/` |
| Шифрлэсэн нууц     | AES-256-GCM (OAuth токен, TOTP, OIDC түлхүүр)| `pkg/crypto`, `usecases/integrations` (`INTEGRATION_ENC_KEY`) |
| Secret hash        | Argon2id (+ Hydra PBKDF2 шалгалт)         | `pkg/secrethash` |
| SQL injection      | зөвхөн параметржүүлсэн query (`$1, $2 …`) | `datasources/repositories/postgres/` |
| PDF гарын үсэг     | Сервэрийн Document-Signer гэрчилгээгээр PAdES | `usecases/sign` (`SIGN_SIGNER_*`) |
| Нийлүүлэлтийн гинж | Модуль бүрийн ESM import smoke            | `scripts/smoke-esm.mjs` (CI gate) |

## API дизайн (API Design)

Бүх API route нь `/api/v1` дор; модуль тус бүр `/v1/<module>`-ийг mount хийнэ:
`auth`, `users`, `users/me/eid`, `rbac`, `org`, `gov`, `integrations`, `assets`,
`gspace`, `gateway`, `core`, `sso`, `admin`, `superadmin`, `ai`, `audit`,
`security`, `site`, `sign`, болон (Hydra тохируулагдсан үед) `provider` +
`applications`. Infra endpoint
(`/health`, `/ready`, `/metrics`, `/swagger`) болон provider гадаргуу (`/admin`,
`/rp/sign`) нь root дээр байрлана. **Endpoint-ийн бүрэн хүснэгтийг
[API_CONTRACT.md](API_CONTRACT_MN.md)** болон үүсгэсэн OpenAPI spec (`/swagger`)-ээс үз.

### Хариуны формат (Response Format)

Нэг envelope (`src/http/response.ts`):

**Амжилт**
```json
{ "status": true, "message": "login success", "data": { }, "request_id": "…" }
```

**Алдаа**
```json
{ "status": false, "message": "user not found", "request_id": "…" }
```

**Validation алдаа (422)**
```json
{ "status": false, "message": "validation failed",
  "data": { "errors": { "national_id": "national_id is required" } }, "request_id": "…" }
```

Domain алдаанууд (`src/apperror`) нь статус кодуудад буудаг: NotFound→404,
Unauthorized→401, Forbidden→403, Conflict→409, BadRequest→400, Internal→500.
5xx-ийн шалтгаануудыг log-д бичиж, body дотор ерөнхий мессежээр сольдог.

## Тестийн стратеги (Testing Strategy)

- **Unit тестүүд** — usecase + handler давхаргууд, [vitest](https://vitest.dev/)-ийн ГАРААР бичсэн mock-оор (repository interface-д тааруулсан энгийн объект — codegen байхгүй). Хурдан, Docker-гүй: `npm test`. **45 файлд 775 тест.**
- **Integration тестүүд** — repository-уудыг (RLS policy-уудыг оруулаад) [testcontainers](https://testcontainers.com/)-оор жинхэнэ Postgres + Redis-ийн эсрэг: `npm run test:integration` (Docker шаардана).
- **Route-ийн холболтын тестүүд** — Express-ийн middleware хүрээ нь chi-ийн `Group`-оос ялгаатай тул `route_*.test.ts` нь БОДИТ router-ыг босгож, аль зам дээр аль middleware үнэхээр ажилласныг батална.
- **Байт-нийцлийн вектор** — аудитын hash гинж болон Argon2id secret hash нь **Go хувилбараас гаргасан эталон вектороор** бэхлэгдсэн тул шилжилтийн үед хоёр хэвлэл нэг өгөгдлийн санг хуваалцаж чадна.
- **ESM import smoke** — `scripts/smoke-esm.mjs` нь build хийсэн модуль бүрийг (219) импортлож, төрлийн шалгалтад үл харагдах CommonJS/ESM interop-ийн эвдрэлийг барина.

## Тохиргоо (Configuration)

Гараар бичсэн ачаалагч нь `.env` / environment-аас ачаална
(`src/config/config.ts`; `backend/.env.example`-ийг үз) — Viper-ийн эквивалент
байхгүй, зүгээр л ил задлагч. Config guard нь production-ийн шаардлагуудыг
(TLS DSN, `ALLOWED_ORIGINS`, `VERIFY_API_KEY`, JWT secret урт) хэрэгжүүлнэ. Сонгосон
key-үүд:

| Бүлэг | Variable-ууд |
|-------|--------------|
| **Server** | `PORT`, `ENVIRONMENT` (`development`/`production`), `DEBUG` |
| **Database** | `DB_POSTGRE_DRIVER`, `DB_POSTGRE_DSN` (dev), `DB_POSTGRE_URL` (prod; `sslmode=verify-full`/`verify-ca`), `DB_MAX_OPEN_CONNS` (25), `DB_MAX_IDLE_CONNS` (5), `DB_CONN_MAX_LIFE_MINS` (15) |
| **JWT** | `JWT_SECRET` (≥32), `JWT_EXPIRED` (ц, 1–24), `JWT_ISSUER`, `JWT_REFRESH_EXPIRED` (өдөр, 7) |
| **Redis** | `REDIS_HOST`, `REDIS_PASS`, `REDIS_EXPIRED` (мин) |
| **Crypto** | `BCRYPT_COST` (12) |
| **Verify (OTP)** | `OTP_MAX_ATTEMPTS` (5), `VERIFY_API_BASE`, `VERIFY_API_KEY` (prod заавал), `VERIFY_CHANNEL` |
| **eID** | `EID_BASE_URL` (`…/v3`), `EID_RP_UUID`, `EID_RP_NAME`, `EID_RP_SECRET`, `EID_CERT_LEVEL` (ADVANCED), `EID_CALLBACK_URL`, `EID_DISPLAY_TEXT`, `SIGN_RELAY_TOKEN` |
| **Sign** | `SIGN_SIGNER_CERT_FILE`, `SIGN_SIGNER_KEY_FILE` (prod fail-closed) |
| **Google OAuth** | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| **XYP** | `XYP_API_BASE` (`https://xyp.dgov.mn`), `XYP_CLIENT_ID`, `XYP_CLIENT_SECRET` |
| **Gerege Space** | `GSPACE_HOST`, `GSPACE_PORT` (22), `GSPACE_USER`, `GSPACE_PASSWORD`, `GSPACE_BASE_PATH` (gerege-space), `GSPACE_QUOTA_BYTES` (2 MB) |
| **Gemini AI** | `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_TTS_MODEL`, `GEMINI_VOICE`, `GEMINI_API_BASE`, `AI_SCOPE_PROMPT` |
| **Gerege Core** | `CORE_API_BASE` (`https://core.gerege.mn`), `CORE_API_TOKEN` |
| **Integrations** | `INTEGRATION_ENC_KEY` (AES-256-GCM; prod заавал) |
| **OIDC Provider (дотоод)** | `OAUTH_ISSUER`, `SSO_STATE_KEY` (≥32), `SSO_FIRSTPARTY_CLIENTS` — **Hydra-гийн хувьсагч БАЙХГҮЙ** |
| **Гуравдагч талын интеграц** | `APP_ORIGIN`, `GOOGLE_DRIVE_CLIENT_ID`/`_SECRET`, `DROPBOX_CLIENT_ID`/`_SECRET`, `GOOGLE_MEET_CLIENT_ID`/`_SECRET` |
| **Cookie** | `COOKIE_SECURE` (заагаагүй ⇒ production-д Secure) |
| **Observability** | `OTEL_EXPORTER` (``/`stdout`/`otlp`), `OTEL_SAMPLE_RATIO`, `OBSERVABILITY_TOKEN` |
| **Networking** | `ALLOWED_ORIGINS` (prod заавал), `TRUSTED_PROXIES` |
| **Bootstrap** | `SUPERADMIN_EMAIL` |

## Deployment

```bash
go build ./...                 # build
docker compose up -d --build   # db + redis + migrate (one-off) + api + web
```

Health check: `curl http://localhost:8080/health`. deployment топологийг
`docs/DEPLOYMENT.md`-ээс үз.

## Credits & License

Энэ платформ нь нээлттэй эх кодын ажил дээр тулгуурласан:

| Project | Author | License | What we used |
|---------|--------|---------|--------------|
| [snykk/go-rest-boilerplate](https://github.com/snykk/go-rest-boilerplate) | Najib Fikri | MIT | Clean Architecture давхаргалал, кэш, observability, тестийн стратеги |

Уламжлал нь: boilerplate-ийн delivery давхарга Go хувилбарт **Gin → chi
(net/http)**, өгөгдлийн давхарга нь **sqlx → pgx** болж хөрвүүлсэн; энэ хэвлэл нь
тэдгээрийг цааш **Express 5** болон **node-postgres (`pg`)** руу портлов. Гурвуулан
дамжиж үлдсэн зүйл нь *хэлбэр* — давхаргалал, кэшийн стратеги, observability-ийн
холболт, тестийн стратеги. Auth стек, RLS аюулгүй байдлын загвар,
eID/SSO/OIDC-provider интеграцууд, feature модулиудыг энэ платформд зориулж
бүтээсэн. MIT уламжлалт бүтээл болохын хувьд эх зохиогчийн эрхийн мэдэгдлийг
хадгалж, энэ код MIT License-ийн дор тараагдана (`LICENSE`-ийг үз).

---

**Government Template Platform V3.0** — **Gerege Systems Development Team** болон **Claude AI** хамтран бүтээв, 2026.
