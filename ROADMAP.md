# ROADMAP — Government Template Platform V3.0 · Node.js edition

> Энэ repo нь **Government Template Platform V3.0**-ийн **Node.js + React** порт
> юм. Эх хувилбар (Go · chi · pgx + Next.js BFF) нь
> [gerege-systems/template-dgov-mn](https://github.com/gerege-systems/template-dgov-mn)-д
> production-д ажиллаж байгаа ([template.dgov.mn](https://template.dgov.mn));
> энэ хувилбарын deployment нь [node.template.dgov.mn](https://node.template.dgov.mn).
> Дэлгэрэнгүй баримт: [README.md](README.md#баримтжуулалт).

## Портын гэрээ (заавал хадгална)

Порт хийхдээ дараах гурван зүйл **1:1 хадгалагдана** — эс бөгөөс энэ нь порт биш
шинэ бүтээгдэхүүн болно:

1. **HTTP гэрээ** — route зам, HTTP method, `BaseResponse` дугтуй
   (`status`/`message`/`data`/`request_id`), статус кодын буулгалт, validation
   алдааны бүтэц (`field`/`tag`/`message`, 422).
2. **SQL schema** — `backend/migrations/` доторх numbered файлууд ХӨНДӨГДӨХГҮЙ
   (RLS бодлого, индекс, seed бүхэлдээ). Одоо байгаа өгөгдлийн сан хэвээр ажиллана.
3. **Аюулгүй байдлын зан төлөв** — fail-closed auth (Redis доголдвол 503),
   RLS-ийн `SET LOCAL` семантик, trusted-proxy XFF, rate limit хязгаарууд,
   security header багц, observability gate-ийн 404 стратеги.

bcrypt hash формат ($2a/$2b) мөн хадгалагдана — Go хувилбарын үүсгэсэн нууц үгийн
hash-ууд шалгагдсаар байна.

---

## ✅ Хийгдсэн — платформ давхарга

| Бүрдэл | Файл | Тэмдэглэл |
|---|---|---|
| Config loader + бүх шалгалт | `src/config/config.ts` | 60+ env, production guard (sslmode=verify-full, ALLOWED_ORIGINS, VERIFY_API_KEY), .env parser |
| Typed domain error | `src/apperror/index.ts` | `DomainError` → HTTP статус; `internalCause` нь cause-ийг нууна |
| Ил контекст + RLS identity | `src/pkg/ctx/ctx.ts` | Go-ийн `context.Context`-ийн эквивалент; `service`/`admin`/`user`/`officer` үүрэг |
| Postgres driver + `withRLS` | `src/datasources/drivers/pg.ts` | транзакц + `set_config(..., true)`; boot-ийн RLS guard (production fail-closed) |
| Redis cache | `src/datasources/caches/redis.ts` | GETDEL атом, cache-miss sentinel, 3s timeout |
| JWT | `src/pkg/jwt/jwt.ts` | HS256, access/refresh `Kind` guard, alg-confusion + issuer + exp шалгалт |
| Validators | `src/pkg/validators/validators.ts` | zod → Go validator-ийн `field/tag/message` бүтэц хэвээр |
| Нэгдсэн хариу дугтуй | `src/http/response.ts` | `wrap` · `decodeBody` · `respondWithError` |
| Middleware (13) | `src/http/middlewares/` | auth · rbac · rls · ratelimit · cors · security · clientip · requestid · bodysizelimit · timeout · recoverer · access log · metrics · observability gate |
| Migration runner | `src/datasources/migration/migration.ts` | advisory lock, тоон эрэмбэ, файл тус бүр нэг транзакц, idempotent |
| Health / metrics / openapi | `src/http/handlers/v1/health.ts`, `src/cmd/openapi/` | `/health` · `/ready` · `/metrics` · `/swagger/doc.json` |
| Server wiring + CLI | `src/cmd/` | manual DI, graceful shutdown, api · migration · healthcheck · openapi |
| Infra | `backend/deploy/Dockerfile`, `docker-compose.yml` | distroless nodejs runtime, node healthcheck binary |
| CI/CD | `.github/workflows/` | fmt · lint · typecheck · vitest · openapi drift · build · gitleaks → Deploy |

**Тест:** 310 unit тест (apperror · config · jwt · validators · domain/users · migration · users usecase · eID client · auth usecase · auth DTO · route wiring · rbac usecase · audit hash-chain · audit usecase · site/theme usecase · core клиент · security usecase · eID байгууллага/PKI · assets usecase).

## ✅ Хийгдсэн — домэйн давхарга

| Домэйн | Юу орсон | Тэмдэглэл |
|---|---|---|
| `users` | record + mapper · repository interface · postgres адаптер (19 method, бүх SQL 1:1) · usecase (кэш + single-flight) · UserResponse DTO · `GET /users/me` | 26 unit тест. Эрх нэмэгдүүлэхээс хамгаалах бүх дүрэм (super admin оноож/өөрчилж болохгүй; ADMIN эрхийг зөвхөн super admin) тесттэй. |
| `site` + `theme` | domain (accent/font/style enum + theme config валидац) · repository interface + postgres адаптер · usecase (TTL кэш) · response DTO · 9 route | 27 unit тест. `GET /site/appearance` ба `GET /themes/active` нь **НЭВТРЭЛТГҮЙ** (landing уншина); бусад нь `settings.manage`. Идэвхтэй theme устгагдахгүй. |
| `audit` | `pkg/audit` hash-chain (Go-той **байт-нийцтэй** canonical JSON) · repository interface + postgres адаптер · usecase · response DTO · 2 route. `auth` болон `rbac` handler-ууд best-effort бичдэг. | 41 unit тест. Go хувилбараас гаргасан **5 эталон hash вектор**-оор байт-нийцлийг шалгасан — шилжилтийн үед Go/Node нэг DB хуваалцаж болно. |
| `rbac` | repository interface + postgres адаптер · usecase (эрхийн resolve + процессийн кэш) · request/response DTO · 6 route | 26 unit тест. admin/superadmin нь каталогийн БҮХ эрхийг авна; ашиглагдаж буй эрх устгагдахгүй; `countUsersWithRole` нь RLS-тэй `users`-д "service" identity дор хүрнэ. `requirePermission`-ийн resolver нь ЭНЭ usecase өөрөө. |
| `core` | usecase (Gerege Core REST клиент: 15с timeout, 4 MiB хязгаар, инерт режим) · handler · 2 route | 10 unit тест. Үндэсний бүртгэлийн PII-д хүрдэг тул `users.manage` эрхээр хамгаалагдсан. `CORE_API_TOKEN` тохируулаагүй бол домэйн **инерт**: 500 биш, тохируулах зааврыг `data.message`-д буцаана. Core-ийн эвдэрсэн/хэтэрхий том хариу `null` болно (апп 500 болохгүй). |
| `security` | repository interface + postgres адаптер · usecase · response DTO · 2 route | 7 unit тест. `POST /security/events` нэвтэрсэн БҮХ хэрэглэгчид нээлттэй — `user_id`-г сервер JWT-ээс авдаг тул клиент өөрчилж чадахгүй, RLS бодлого нь бас `user_id = app.user_id`-г баталгаажуулна. `GET` нь admin-only (хэрэглэгчид уншуулах бодлого БАЙХГҮЙ). |
| `assets` | eID client-ийн БАЙГУУЛЛАГА (representations · signers · латин нэр) + PKI (гэрчилгээ · төхөөрөмж · activity · summary) өргөтгөл · org_stamps repository + postgres · usecase · handler · 8 route | 45 unit тест. Гарын үсэг/тамганы ЗУРАГ энд хадгалагддаггүй — зөвхөн Drive URL. Тамга унших нь төлөөлөгч, бичих нь **ADMIN** шаардана; эрхийн эх сурвалж нь УЛСЫН БҮРТГЭЛ (eID-ээр асууна) — template өөрөө шийддэггүй. eID-ээр нэвтрээгүй хэрэглэгч байгууллагын үйлдэл хийхгүй. |
| `auth` / eID | `pkg/eid` RP client (ACSP_V2 QR/push initiate + long-poll session, X.509 задлалт) · `pkg/google` OAuth · usecase (session mint/rotate, MFA gate, Google link) · request/response DTO · 7 route | 76 unit тест. Токен зөвхөн COMPLETE үед, refresh нэг л удаа (атом GetDel), super admin MFA-гүйгээр session авахгүй. **Route-ийн middleware хүрээг** тусад нь тесттэй (Express-ийн `router.use(subRouter)` нь chi-ийн `Group`-той адилгүй — middleware гоождог). |

---

## 🚧 Порт хийгдэж байна — домэйн давхарга

Домэйн бүр `records → repository (interface + postgres) → usecase → DTO → handler
→ route` дарааллаар порт хийгдэнэ, дараа нь `backend/docs/` дахь EN/MN хос
шинэчлэгдэнэ.

> **Хамрах хүрээний тэмдэглэл:** Go repo-д `register` / `login` / OTP /
> `forgot-password` / `reset-password` файлууд байгаа ч route-д ХОЛБОГДООГҮЙ
> (үхмэл код) — "Login with eID" нь цорын ганц интерактив нэвтрэх арга. Тэднийг
> порт хийгээгүй. Мөн `auth` usecase-ийн байгууллагын төлөөлөл (representations /
> signers) болон иргэний PKI самбарын method-ууд нь `route_org.go` /
> `route_eidprofile.go`-д холбогддог тул тэр домэйнуудтай хамт нэмэгдэнэ.

**Дараалал** (хамаарлын дарааллаар):

1. `users` · `auth` (eID · Google · SSO consumer · refresh/logout) · `rbac`
3. ~~`site`~~ ✅ · ~~`theme`~~ ✅ · ~~`core`~~ ✅ · ~~`security`~~ ✅
4. `ai` (Gemini pipeline) · ~~`assets`~~ ✅
5. `org` · `applications` · `integrations` · `gspace`
6. `gov` · `registry` · `relay` · `gateway`
7. `oidc` (provider тал) · `sso` · `ssotoken` · `sign` · `provider`
8. `superadmin` · `superadmin_onboarding`

Эх Go код нь `.go-reference/` дор (gitignored) порт хийх лавлагаа болж байрлана;
порт дуусмагц устгагдана.

## 🚧 Frontend — Vite + React SPA

Одоогийн tree нь Next.js 15 BFF апп-ыг агуулсан хэвээр (шилжилтийн төлөв). Target
архитектур:

- **Vite + React Router SPA**, статик файл болж nginx-ээр үйлчлэгдэнэ.
- nginx нь `/api/*`-ыг api контейнер рүү проксилно (ижил origin).
- **Токен client JS-д хүрэхгүй хэвээр**: API өөрөө httpOnly cookie тавина
  (BFF-ийн оронд), мутацийн хүсэлт `x-dgov-csrf` double-submit header зөөнө.
- TanStack Query өгөгдлийн давхарга, `lib/i18n.ts` (mn + en) хадгалагдана.

Энэ шилжилт нь backend-д cookie-эсвэл-Bearer auth middleware шаарддаг тул
`auth` домэйнтэй хамт хийгдэнэ.

---

## Дараа нь (порт дууссаны дараа)

- `.go-reference/` устгах, ROADMAP-ийн портын хэсгийг архивлах
- Go хувилбартай гэрээний зэрэгцүүлсэн тест (contract parity suite)
- Performance baseline: Node vs Go (p50/p99, memory) — эталон deployment-үүд хажуу хажууд

---

**Government Template Platform V3.0** — **Gerege Systems Development Team** болон
**Claude AI** хамтран бүтээв, 2026.
