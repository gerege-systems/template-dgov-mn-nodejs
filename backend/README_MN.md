# Government Template Platform V3.0 — Backend (Node.js)

> **Цахим засаглалыг бүтээх суурь** — _Нэг суурь — бүх төрийн үйлчилгээ._

> 🌐 [English](README.md) · **Монгол**

[![Node.js](https://img.shields.io/badge/Node.js-22-339933.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6.svg)](https://www.typescriptlang.org/)
[![Express](https://img.shields.io/badge/Express-5-000000.svg)](https://expressjs.com/)
[![pg](https://img.shields.io/badge/node--postgres-8-336791.svg)](https://node-postgres.com/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

**Government Template Platform V3.0**-ийн Node.js backend — түүн дээр *аль ч*
төрийн цахим үйлчилгээг босгож болох, үйлдвэрлэлд бэлэн суурь. Хатуу баригдсан
**Clean Architecture** цөмийг **node-postgres**-ээр бичсэн гар бичмэл SQL-тэй
(ORM-гүй) хослуулж, төрийн түвшний чадваруудыг шууд агуулна: **eID Mongolia**
нэвтрэлт, **Google** account холболт, **PAdES** гарын үсэг, **Gemini AI**
pipeline, гүн хамгаалалт — бүгд хоёр хэлтэй (mn/en) бөгөөд эхний өдрөөс
ажиглагдахуйц. HTTP-д **Express 5**, өгөгдөлд **pg + PostgreSQL**, кэшэд **Redis**.

> **Портын төлөв:** энэ нь Go backend-ийн Node.js порт юм. Платформ давхарга
> бэлэн; домэйнууд нэг нэгээр нэмэгдэж байна. [../ROADMAP.md](../ROADMAP.md)-г үз.

## Шаардлага

- Node **22+** (ESM, төрөлх `fetch`, `AbortSignal.timeout`)
- PostgreSQL **16+**
- Redis **7+**

## Эхлүүлэх

```bash
cp .env.example .env      # JWT_SECRET (≥32 тэмдэгт), DB, Redis, EID_* креденшл тохируул
npm install
npm run migrate           # SQL migration хэрэгжүүлнэ (idempotent, advisory-lock-той)
npm run dev               # tsx watch → http://localhost:8080
```

Шалгах:

```bash
curl -s localhost:8080/health   # {"status":true,"message":"service is healthy"}
curl -s localhost:8080/ready    # {"status":true,"checks":{"database":"ok","redis":"ok"}}
```

## Командууд

| Команд | Юу хийдэг |
|---|---|
| `npm run dev` | Hot-reload dev сервер (tsx watch) |
| `npm run build` | `tsc` → `dist/` (build tsconfig нь тестийг оруулахгүй) |
| `npm start` | Хөрвүүлсэн серверийг ажиллуулна |
| `npm run migrate` | Migration хэрэгжүүлнэ (`-- --action=down` буцаана) |
| `npm test` | Unit тест (vitest, зөвхөн mock, хурдан) |
| `npm run test:integration` | Integration тест (testcontainers, Docker шаардана) |
| `npm run openapi` | `docs/openapi.json`-г дахин үүсгэнэ |
| `npm run lint` / `npm run fmt` | ESLint (төрөл-мэдлэгтэй) / Prettier |
| `npm run typecheck` | `tsc --noEmit`, тестүүдийг **оруулаад** |
| `npm run pre-push` | CI-ийн бүх хаалгыг нэг дор |

## Бүтэц

```
src/
├── domain/           # enterprise entity-үүд; дотоод юу ч import хийхгүй
├── usecases/         # business логик; зөвхөн repository interface-ээс хамаарна
├── datasources/
│   ├── drivers/      # pg pool + withRLS транзакц + boot-ийн RLS guard
│   ├── caches/       # Redis (GETDEL, cache-miss sentinel, алхмын timeout)
│   ├── migration/    # migration runner (advisory lock, файл тус бүр транзакц)
│   └── repositories/
│       ├── interface/  # usecase-ийн хамаардаг гэрээ
│       └── postgres/   # гар бичмэл SQL адаптерууд
├── http/
│   ├── middlewares/  # auth · rbac · rls · ratelimit · cors · security · …
│   ├── handlers/v1/  # хүсэлт → usecase → хариу
│   ├── routes/       # домэйн тус бүр route_<domain>.ts, index.ts-д бүртгэгдэнэ
│   └── response.ts   # BaseResponse дугтуй, wrap(), respondWithError()
├── pkg/              # ctx · jwt · logger · validators · observability · eID · gemini
├── config/           # env loader + шалгалт (production-д fail-closed)
├── apperror/         # төрөлжсөн domain алдаа → HTTP статус
└── cmd/              # api · migration · healthcheck · openapi
migrations/           # numbered SQL — Go хувилбартай ижил
```

## Архитектурын дүрмүүд

**Хамаарлын чиглэл зөвхөн дотогш:** `handler → usecase → repository → domain`.

- **ORM байхгүй.** SQL нь гараар бичигдэнэ; record-ууд нь баганын нэртэй таарсан
  түлхүүр (snake_case) бүхий энгийн interface. Query үргэлж параметрчлэгдсэн
  (`$1, $2 …`).
- **Контекст ил.** Ambient хүсэлтийн төлөв БАЙХГҮЙ. Repository болон usecase бүр
  `ctx: Ctx` (`pkg/ctx`)-ийг эхний аргументаар авна. `Ctx` нь `requestId`, RLS
  `identity`, `CurrentUser` болон `AbortSignal`-ыг зөөнө. Энэ нь Go-ийн
  `context.Context`-ийн эквивалент — identity дамжуулахаа мартах нь чимээгүй RLS
  bypass биш, compile-time алдаа болно.
- **Алдаа.** Usecase нь `apperror.*` шиднэ; `http/response.ts` төрлийг статус код
  болгон буулгана. Library алдааг `apperror.internalCause(err)`-ээр боо —
  ингэснээр текст нь логд бичигдэнэ, харин клиент рүү хэзээ ч гарахгүй.
- **Handler** нь `(req, res) => Promise<void>`, `wrap()`-аар боогдоно. Задлан
  унших + баталгаажуулахыг нэг алхамд `decodeBody(req, schema)` хийнэ — схемүүд нь
  zod `strictObject` тул танихгүй талбар татгалзагдана (Go-ийн
  `DisallowUnknownFields`-ийн эквивалент).
- **Wiring** нь `src/cmd/api/server/server.ts` дахь гар DI. Шидэт container
  байхгүй: хамаарлын бүтэн графыг нэг файлаас уншиж болно.

### Row-Level Security

Api нь **заавал** non-superuser role-оор холбогдоно — superuser болон `BYPASSRLS`
role нь RLS бодлогуудыг чимээгүй алгасдаг. `setupPostgres()` үүнийг boot үед
шалгаж, **production-д fail-closed** (boot унана).

`users` хүснэгтийн бүх хандалт `db.withRLS(ctx, tx => …)`-ээр явна. Тэр нь:

1. транзакц онгойлгож,
2. `app.user_id` / `app.user_role`-ыг `set_config(..., true)`-ээр тавьж — `SET
   LOCAL` хэлбэр тул commit/rollback дээр утга арилж, **pooled холболтоор
   дараагийн хүсэлт рүү алдагдаж чадахгүй**,
3. callback-ыг ажиллуулж, дараа нь commit хийнэ.

`ctx`-д identity байхгүй бол GUC хоосон болж бодлогууд бүх мөрийг хаана — аюулгүй
өгөгдмөл. Хэрэглэгч тус бүрийн шинэ хүснэгтэд өөрийн бодлого хэрэгтэй (загварыг
`migrations/7_enable_rls_users.up.sql`-ээс үз).

### Auth нь fail-closed

Баталгаажсан хүсэлт бүр дээр Redis-д тулгуурласан хоёр шалгалт ажиллана:

- **logout deny-list** — `access_deny:<jti>` байвал токен хүчингүй болсон;
- **нууц үг солих тасалбар** — `pwd_cutoff:<user_id>` ≥ токены `iat` бол токен нь
  креденшл солихоос өмнөх юм.

Кэшийн **miss** нь "хүчингүй болгоогүй, үргэлжлүүл" гэсэн үг. Redis-ийн **жинхэнэ**
алдаа нь шалгалт хийж чадсангүй гэсэн үг тул хүсэлт **503** авна — болзошгүй
хүчингүй токеныг нэвтрүүлэхээс сайн. Үүнийг "хялбарчилж" нэвтрүүлдэг болгож
БОЛОХГҮЙ.

## Тохиргоо

Хувьсагч бүр [`.env.example`](.env.example)-д баримтжуулагдсан. Тохиргоо нь boot
үед шалгагдаж, буруу утга дээр процесс **эхлэхээс татгалзана**. Production-д
нэмэлтээр шаардагдана:

- `DB_POSTGRE_URL` нь `sslmode=verify-full` (дотоод сүлжээнд `verify-ca`) —
  баталгаажаагүй TLS татгалзагдана;
- `ALLOWED_ORIGINS` — wildcard CORS хориотой;
- `VERIFY_API_KEY` — бүх OTP GeregeCloud Verify-ээр (SMTP хаана ч байхгүй);
- non-superuser DB role (RLS guard).

`process.env` нь `.env` файлыг дардаг тул контейнерууд тохиргоог 12-factor
хэлбэрээр inject хийж чадна.

## Ажиглалт (observability)

| Endpoint | Тэмдэглэл |
|---|---|
| `/health` | Liveness. Үргэлж нээлттэй — orchestrator-т хэрэгтэй. |
| `/ready` | Readiness: Postgres, Redis-ийг ping хийнэ. Нээлттэй. |
| `/metrics` | Prometheus (HTTP counter/histogram, pg pool gauge, Node default). **Production-д bearer-gated**, эс бөгөөс 404. |
| `/swagger/doc.json` | OpenAPI 3.1 баримт. Ижил gate. |

Бүтэцлэгдсэн JSON лог нь pino-гоор (`pkg/logger`) явж, `X-Request-ID` header-ээс
корреляцийн `request_id` авна (log injection-ийн эсрэг шалгагдаж, урт
хязгаарлагдсан). Trace-д `OTEL_EXPORTER=otlp` тохируул; хоосон бол tracing нь
no-op — бараг ямар ч зардалгүй.

## Тест

```bash
npm test                  # unit — Docker шаардахгүй, миллисекунд
npm run test:integration  # testcontainers: бодит Postgres + Redis
```

Unit тестүүд платформ давхаргыг хамарна: config шалгалт, төрөлжсөн алдаа, JWT
(`alg=none` болон issuer-confusion татгалзалыг оруулаад), validator-ийн алдааны
бүтэц, domain дүрмүүд, migration эрэмбэ. Integration тестүүд RLS бодлого,
migration-ийн idempotency болон repository SQL-ийг бодит DB дээр шалгана.

## Баримт

| Doc | Юу |
|---|---|
| [docs/ARCHITECTURE_MN.md](docs/ARCHITECTURE_MN.md) | Давхаргууд, хамаарлын урсгал |
| [docs/DEVELOPMENT_MN.md](docs/DEVELOPMENT_MN.md) | Фичер нэмэх заавар, code style |
| [docs/API_CONTRACT_MN.md](docs/API_CONTRACT_MN.md) | REST endpoint, request/response |
| [docs/AI_PIPELINE_MN.md](docs/AI_PIPELINE_MN.md) | AI туслахын дотоод бүтэц |
| [docs/SERVICE_WORKFLOW_MN.md](docs/SERVICE_WORKFLOW_MN.md) | Үйлчилгээний регистр, хүсэлтийн төлөвийн машин, SLA |
| [docs/SECURITY.md](docs/SECURITY.md) | Хэрэгжсэн хяналт + ASVS roadmap |

---

**Government Template Platform V3.0** — **Gerege Systems Development Team** болон
**Claude AI** хамтран бүтээв, 2026.
