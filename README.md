# Government Template Platform V3.0 — Node.js edition

> **Цахим засаглалыг бүтээх суурь** — **eID-д суурилсан · AI-аар хүчирхэгжсэн** —
> төрийн аливаа цахим үйлчилгээг дээр нь босгох, үйлдвэрлэлд бэлэн суурь.
> Энэ бол платформын **Node.js + React** хувилбар.

**Government Template Platform V3.0** нь *цахим засаглалыг бүтээх суурь*: Clean-
Architecture **Node.js backend** + **React** frontend + Gemini AI pipeline-ийг
хооронд нь холбож, аюулгүй байдлыг хатууруулж, ямар ч систем рүү өргөтгөхөд бэлэн
болгосон. Та дэд бүтэц бус, үнэ цэнийг л бүтээнэ — identity, аюулгүй байдал, AI,
үйлчилгээний тулгуур эхний өдрөөс шийдэгдсэн ирнэ. Энэ хувилбарын жишээ deployment
нь [node.template.dgov.mn](https://node.template.dgov.mn)-д ажиллана.

> 🌐 **Монгол** · [English](docs/README_EN.md)

[![Node.js](https://img.shields.io/badge/Node.js-22-339933.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6.svg)](https://www.typescriptlang.org/)
[![Express](https://img.shields.io/badge/Express-5-000000.svg)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791.svg)](https://www.postgresql.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB.svg)](https://react.dev/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

Clean Architecture зарчмаар бүтээгдсэн, аюулгүй байдлыг хатууруулсан, production-д
бэлэн **full-stack суурь**. Backend нь **Express 5 (TypeScript)** router-ийг гар
бичмэл SQL-тэй [node-postgres](https://node-postgres.com/) драйвертэй хослуулдаг —
**ORM ашиглахгүй**. Frontend нь **React**.

## 🔄 Порт хийх төлөв

Энэ repo нь Go/Next.js хувилбар
([gerege-systems/template-dgov-mn](https://github.com/gerege-systems/template-dgov-mn))-ийн
Node.js/React порт юм. **HTTP гэрээ (route, `BaseResponse` дугтуй, алдааны
семантик) болон SQL migration-ууд 1:1 хадгалагдана** — иймээс клиент болон
өгөгдлийн сан хөндөгдөхгүй.

| Давхарга | Төлөв |
|---|---|
| Платформ давхарга — config · logger · ctx/RLS · apperror · pg (`withRLS`) · Redis · JWT · validators · 13 middleware · migration runner · health · server wiring | ✅ Бэлэн |
| Домэйн давхарга — auth/eID · users · rbac · ai · gov · oidc · relay · registry · gateway · sign · sso … | ✅ **25/25 домэйн** (199 route · 165 OpenAPI зам) |
| Frontend — Vite + React SPA | ✅ Хийгдсэн (BFF устаж, статик SPA + httpOnly cookie) |

**Порт ДУУССАН** — 775 unit тест / 45 файл, ESM smoke 219 модуль, frontend 25 тест.

Дэлгэрэнгүйг [ROADMAP.md](ROADMAP.md)-д үз.

## 📌 Эх сурвалж ба нээлттэй эх

Platform-ийн эх Go хувилбар нь нээлттэй эх
[snykk/go-rest-boilerplate](https://github.com/snykk/go-rest-boilerplate)
(MIT, Najib Fikri)-аас гаралтай. Энэ Node.js хувилбар нь тухайн архитектурыг
(Clean Architecture, ORM-гүй SQL, RLS, fail-closed auth) TypeScript дээр
хуулбарлав. Эх төслийн attribution-г [AUTHORS](AUTHORS)-д хадгалсан. Энэ төсөл
**MIT лицензтэй** — [LICENSE](LICENSE).

## Monorepo бүтэц

```
template-dgov-mn-nodejs/
├── backend/               # Node.js · Express 5 · TypeScript · pg · PostgreSQL · Redis
│   ├── src/
│   │   ├── domain/        # enterprise entity-үүд (гадаад хамааралгүй)
│   │   ├── usecases/      # business логик (зөвхөн repository interface-ээс хамаарна)
│   │   ├── datasources/   # pg driver (withRLS) · Redis · repository адаптерууд · migration
│   │   ├── http/          # middleware · handler · route · нэгдсэн хариу дугтуй
│   │   ├── pkg/           # ctx · jwt · logger · validators · eID · gemini …
│   │   └── cmd/           # api · migration · healthcheck · openapi CLI
│   ├── migrations/        # numbered SQL (Go хувилбартай ижил, хөндөөгүй)
│   └── docs/              # ARCHITECTURE · DEVELOPMENT · API_CONTRACT · SECURITY (EN/MN)
└── frontend/              # Vite + React SPA (статик, BFF-гүй)
```

- **[backend/README_MN.md](backend/README_MN.md)** — Clean Architecture Node.js API.
- **[frontend/README.md](frontend/README.md)** — React frontend.

## Онцлог

- **Clean Architecture** — `handler → usecase → repository → domain`, back-import байхгүй; business core нь web framework-ийг import хийдэггүй.
- **Ил контекст** — repository/usecase бүр `ctx: Ctx`-ийг ил параметрээр авна (`requestId`, RLS `identity`, `CurrentUser`, `AbortSignal`). Go-ийн `context.Context`-ийн эквивалент: "identity дамжуулахаа мартах" нь compile-time алдаа болно, чимээгүй RLS bypass биш.
- **Танилт — eID + Google** — цорын ганц нэвтрэх арга бол **eID-ээр нэвтрэх** (eID Mongolia Relying Party: QR код / мобайл deep-link / иргэний РД push + long-poll session). Түүний зэрэгцээ **Google OAuth** account холболт. Session нь JWT access + refresh (rotation); logout хоёуланг хүчингүй болгоно (refresh + access deny-list).
- **Fail-closed auth** — токен хүчингүй болгох (logout deny-list) болон нууц үг солих тасалбарын шалгалт Redis-д тулгуурладаг; Redis-ийн ЖИНХЭНЭ алдаа (cache miss биш) үед 503 буцаана — болзошгүй хүчингүй токеныг хэзээ ч нэвтрүүлэхгүй.
- **eID PKI профайл** — нэвтэрсэн иргэний eID identity-г IdP-ээс уншина: холбоотой байгууллага ба эрх бүхий гарын үсэг зурагчид, гэрчилгээ, бүртгэлтэй төхөөрөмж, идэвх.
- **Байгууллага ба гишүүнчлэл** — байгууллага үүсгэх/хайх (улсын бүртгэлээс Gerege Verify/XYP-ээр лавлах) + гишүүд/эрх удирдах, хэрэглэгч тус бүрт RLS-ээр хамгаалагдсан.
- **Төрийн үйлчилгээний портал** — иргэн рүү харсан `Төрийн үйлчилгээ` гадаргуу: үйлчилгээний каталог, хүсэлт, лавлагаа, мэдэгдэл, төлбөр, цаг захиалга.
- **API gateway** — админ удирддаг services / routes / consumers / API key / policy + хүсэлтийн телеметр.
- **OIDC provider (SSO)** — платформ өөрөө identity provider болж чадна: login/consent/logout урсгалыг өөрөө жолоодох тул relying party-ууд түүгээр дамжин нэвтэрнэ. `OAUTH_ISSUER` тохируулагдсан үед идэвхжинэ.
- **Баримт бичгийн гарын үсэг (PAdES)** — eID Mongolia `/v3`-ээр PDF-д server талаас гарын үсэг зурна, байнгын Document-Signer гэрчилгээтэй; sign-relay нь 3 дагч RP-уудыг платформын eID креденшлээр дамжуулан гарын үсэг зурах боломж олгоно.
- **Гуравдагч этгээдийн интеграци** — хэрэглэгч тус бүрийн OAuth холболт (Google Drive/Meet, Dropbox), токеныг шифрлэн (AES-256-GCM) хадгална; мөн **Gerege Space** апп-ын өөрийн SFTP хадгалалт.
- **AI pipeline (Gemini)** — SDK-гүй REST client + function calling: текст/дуут чат, яриа→текст (STT), текст→яриа (TTS), шууд орчуулга. Давхаргат system prompt (кодод хатуу суурь дүрэм + админ DB-ээс тохируулдаг хамрах хүрээ/заавар) туслахыг зөвхөн заасан хүрээнд барина.
- **Audit log** — hash-chain холбоост, зөвхөн-нэмэх audit бүртгэл.
- **RBAC ба super admin** — динамик role + permission каталог; 4-үүрэгт загвар (**superadmin → admin → manager → user**).
- **Аюулгүй хатууруулсан** — security headers (CSP, HSTS, COOP/COEP/CORP), CORS allow-list, rate limiting, хүсэлтийн timeout, parameterized query, Postgres Row-Level Security + boot-үеийн мөрдөлтийн guard. [SECURITY.md](SECURITY.md)-г үз.
- **Observability** — OpenTelemetry trace + Prometheus metrics + pino structured log; production-д `/metrics` ба `/swagger` bearer token-оор хаагдана.
- **Тесттэй** — vitest unit + testcontainers integration тест.

## Түргэн эхлүүлэх

**Шаардлага:** Node 22+, PostgreSQL 16+, Redis 7+ (бүтэн стекийг Docker-оор
ажиллуулахыг зөвлөнө).

```bash
# 1) Backend  →  http://localhost:8080
cd backend
cp .env.example .env          # JWT_SECRET (≥32), DB, Redis, EID_* RP креденшл тохируул
npm install
npm run migrate               # SQL migration-уудыг хэрэгжүүлнэ
npm run dev

# 2) Frontend →  http://localhost:3000
cd ../frontend
cp .env.example .env.local    # BACKEND_URL=http://localhost:8080
npm install
npm run dev
```

Эсвэл бүтэн стекийг өргө (db + redis + migrate + api + web):

```bash
cp .env.example .env                    # POSTGRES_*, REDIS_PASS, портууд
cp backend/.env.example backend.env     # backend-ийн тохиргоо
docker compose up -d --build
```

**http://localhost:3000** нээж **eID-ээр нэвтрэх**-ийг сонго (QR уншуулах / eID
мобайл апп нээх, эсвэл иргэний РД оруулж push хүлээж авах).

### Хөгжүүлэлтийн хаалга

```bash
cd backend && npm run pre-push   # fmt + lint + typecheck + test + openapi drift + build
```

## Баримтжуулалт

| Doc | Юу |
|-----|------|
| [backend/docs/ARCHITECTURE_MN.md](backend/docs/ARCHITECTURE_MN.md) | Давхаргууд, dependency flow |
| [backend/docs/DEVELOPMENT_MN.md](backend/docs/DEVELOPMENT_MN.md) | Фичер нэмэх заавар, тест, code style |
| [backend/docs/API_CONTRACT_MN.md](backend/docs/API_CONTRACT_MN.md) | REST endpoint, request/response |
| [backend/docs/AI_PIPELINE_MN.md](backend/docs/AI_PIPELINE_MN.md) | AI туслахын дотоод бүтэц: урсгал, prompt давхарга, tools, voice |
| [backend/docs/SERVICE_WORKFLOW_MN.md](backend/docs/SERVICE_WORKFLOW_MN.md) | Үйлчилгээний регистр (CPSV-AP паспорт) → хүсэлтийн төлөвийн машин, SLA |
| [backend/docs/SECURITY.md](backend/docs/SECURITY.md) | Хэрэгжсэн хяналт + ASVS roadmap |
| [docs/DEPLOYMENT_MN.md](docs/DEPLOYMENT_MN.md) | VPS deploy runbook (compose, env файлууд, nginx, шинэчлэх, rollback) |
| [ROADMAP.md](ROADMAP.md) | Юу хийгдсэн, юу дараагийнх |
| [SECURITY.md](SECURITY.md) | Эмзэг байдлыг хэрхэн мэдээлэх |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Хэрхэн хувь нэмэр оруулах |

## Хувь нэмэр

Хувь нэмэр оруулахыг урьж байна — [CONTRIBUTING.md](CONTRIBUTING.md) болон
[Code of Conduct](docs/CODE_OF_CONDUCT.md)-ийг уншина уу.

## Лиценз

[MIT](LICENSE) — snykk/go-rest-boilerplate (MIT)-ийн derivative; эх төслийн
attribution-г [AUTHORS](AUTHORS)-д хадгалсан.

---

**Government Template Platform V3.0** — **Gerege Systems Development Team** болон
**Claude AI** хамтран бүтээв, 2026.
