# Архитектур

Платформ нь **Clean Architecture** зарчмаар бүтээгдсэн: `handler → usecase →
repository → domain`. Business core нь web framework-ийг import хийдэггүй.

## Бүрэлдэхүүн

```
Internet ──► nginx (TLS)
   │
   ├─ /oauth2/*, /userinfo, /.well-known/*  ─► api — платформын өөрийн OIDC issuer
   ├─ /api/v1/*                              ─► api (:8080)
   └─ бусад бүх                              ─► web — статик React SPA (nginx)
                                                   │
   дотоод сүлжээ:  db (PostgreSQL 16) · redis (7)
```

!!! warning "Go хувилбарын зарим гадаргуу энд БАЙХГҮЙ"
    Эх хувилбарт `/rp/sign/*` (eID sign relay), `/rp/eid/*` · `/rp/eid-org/*`
    (eID service proxy) болон `/admin` (RP OAuth2 client-ийн операторын API,
    `developer_apps`) гэсэн нэмэлт гадаргуунууд байдаг. Эдгээр нь портын 25
    домэйнд ОРООГҮЙ тул Node.js хэвлэлд **хараахан байхгүй**.

    Энд байгаа `/api/v1/admin/*` нь ӨӨР зүйл — хэрэглэгчийн удирдлага ба AI
    prompt тохиргоо (`users.manage` / `settings.manage` эрхээр).

!!! info "BFF БАЙХГҮЙ"
    Go/Next.js хувилбарт browser нь Next.js-ийн BFF route-уудтай харилцаж, тэр нь
    backend руу прокси хийдэг байв. Node.js хэвлэлд **тэр давхарга байхгүй**:
    `web` нь цэвэр статик файл (server талын код агуулаагүй), browser нь ижил
    origin дээрх `/api/v1/*` рүү ШУУД ханддаг. Сүлжээний нэг үсрэлт цөөрч,
    "зам хоёр газарт бичигдэх" давхардал арилсан.

    Токен нь энэ загварт ч browser-ийн ЖС-д ХҮРДЭГГҮЙ — API өөрөө httpOnly
    cookie тавьдаг (доорх *Аюулгүй байдал*-ыг үз).

## Давхаргууд

| Давхарга | Технологи | Тайлбар |
|---|---|---|
| **Backend** | Node.js 22 · Express 5 · TypeScript (ESM) · `pg` (ORM-гүй) | Clean Architecture, RLS, гараар бичсэн SQL |
| **Frontend** | Vite · React 19 · React Router 7 · TanStack Query | Статик SPA; nginx үйлчилнэ, server талын код байхгүй |
| **OIDC provider** | Платформын өөрийн код (`usecases/oidc`) | login/consent/logout урсгалыг платформ өөрөө жолоодоно (Hydra/Keycloak хэрэггүй) |
| **Identity** | eID Mongolia RP | Цахим үнэмлэхээр баталгаажуулалт |
| **Өгөгдлийн сан** | PostgreSQL 16 | Row-Level Security нь хэрэглэгч хоорондын тусгаарлалтын тулгуур |
| **Cache/queue** | Redis 7 | session deny-list, түр төлөв, rate limit |
| **AI** | Gemini (SDK-гүй REST) | чат, дуу хоолой, орчуулга |
| **Ажиглалт** | pino · prom-client · OpenTelemetry | бүтэцлэгдсэн лог · `/metrics` · trace |

## Аюулгүй байдал

- **Row-Level Security (RLS)** — хэрэглэгч бүр зөвхөн өөрийн мөрийг хардаг.
  `db.withRLS(ctx, …)` нь транзакц нээж `app.user_id` / `app.user_role`-ыг
  `set_config(..., true)`-оор тавина (`SET LOCAL` семантик) тул identity нь
  холболтын сангаар дамжин **гоожихгүй**. Boot үед production-д non-superuser
  role шаардах guard ажиллана.
- **httpOnly cookie + давхар CSRF** — access/refresh токеныг **API өөрөө**
  `dgov_access` / `dgov_refresh` cookie-д тавина (ЖС уншихгүй). Мутацийн хүсэлт
  бүр `x-dgov-csrf` толгойг ЖС-д уншигддаг `dgov_csrf` cookie-оос хуулж зөөнө
  (double-submit). Хариуны биед токен хэвээр буцдаг тул мобайл/m2m клиент
  Bearer-ээр ажилласаар байна.
- **Fail-closed auth** — Redis-ийн бодит алдаа (кэш промах БИШ) нь цуцлалт/эргэлт
  шалгах үед 503 буцаана; цуцлагдсан байж болзошгүй токеныг ХЭЗЭЭ Ч нэвтрүүлэхгүй.
- **Аюулгүй байдлын толгой** — SPA-ийн nginx нь CSP · X-Frame-Options ·
  X-Content-Type-Options · Referrer-Policy · Permissions-Policy тавина; API нь
  `default-src 'none'` (JSON хариу). Per-IP rate limit давхаргын хэмжээнд.
- **Аудит** — hash-chain холбоост, зөвхөн-нэмэх бүртгэл. Canonical JSON нь Go
  хувилбартай **байт-нийцтэй** тул шилжилтийн үед хоёр хувилбар нэг гинжийг
  хуваалцаж чадна.

## Backend бүтэц (тойм)

```
backend/
├── src/
│   ├── cmd/api/server/     # гар DI wiring (server.ts)
│   ├── domain/             # цэвэр домэйн (дотоод import-гүй)
│   ├── usecases/           # бизнес логик (зөвхөн repository INTERFACE-ээс хамаарна)
│   ├── datasources/
│   │   ├── repositories/   # interface + postgres адаптер (гараар бичсэн SQL)
│   │   ├── caches/         # redis
│   │   └── drivers/        # pg pool + withRLS
│   ├── http/
│   │   ├── handlers/v1/    # (req,res) => Promise<void>, `wrap()`-аар боогдоно
│   │   ├── middlewares/    # auth · rbac · rls · ratelimit · csrf · …
│   │   ├── routes/         # домэйн бүрд route_<domain>.ts
│   │   └── dto/            # zod strictObject request + response хэлбэр
│   ├── pkg/                # eid · oidc · gemini · pdf · secrethash · cloudfiles …
│   └── apperror/           # төрөлжсөн domain алдаа → HTTP статус
└── migrations/             # дугаарласан SQL (N_name.up/down.sql) — Go хувилбартай ИЖИЛ
```

!!! tip "ESM-ийн нэг онцлог"
    Багц нь `"type": "module"` тул **харьцангуй import бүр `.js` өргөтгөлтэй**
    байх ёстой — `.ts` файл дотор ч. Node ажиллах үед яг тэр замыг шийддэг.

## Frontend бүтэц (тойм)

```
frontend/
├── src/
│   ├── App.tsx             # маршрутын хүснэгт — RequireAuth / RequirePermission ЭНД
│   ├── app/                # хуудсууд (маршрутын мод)
│   ├── components/         # дахин ашиглагдах UI
│   ├── lib/
│   │   ├── client.ts       # API рүү хандах ЦОРЫН ГАНЦ цэг (CSRF + cookie)
│   │   ├── session.tsx     # useSession / useMe / usePermissions
│   │   └── i18n.ts         # mn + en түлхүүр бүр хоёуланд
│   └── styles/
├── nginx.conf              # SPA fallback + аюулгүй байдлын толгой
└── public/.well-known/     # apple-app-site-association (iOS Universal Links)
```

!!! warning "Хамгаалалт нь маршрутын хүснэгтэд"
    `RequireAuth` / `RequirePermission` нь `App.tsx`-д төвлөрнө — хуудас бүр
    өөрөө шалгадаггүй. Ингэснээр "шалгалт мартагдах" алдаа бүтцийн хувьд
    боломжгүй. Жинхэнэ шийдвэр ямагт **backend талд**; эдгээр нь зөвхөн UI-ийн
    чиглүүлэлт.
