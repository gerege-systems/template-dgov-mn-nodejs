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

**Тест:** 500 unit тест (apperror · config · jwt · validators · domain/users · migration · users usecase · eID client · auth usecase · auth DTO · route wiring · rbac usecase · audit hash-chain · audit usecase · site/theme usecase · core клиент · security usecase · eID байгууллага/PKI · assets usecase · eID профайл · org usecase · gspace usecase · gateway usecase · secrethash · applications usecase · integrations usecase · ssotoken/crypto · sso usecase · registry usecase · gov usecase).

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
| `eidprofile` | `pkg/xyp` (улсын бүртгэлийн байгууллагын лавлагаа) · `pkg/ssoeidproxy` (SSO-гоор PKI унших) · auth usecase-ийн 11 шинэ method · response DTO · 11 route | 23 unit тест. eID-ээр нэвтрээгүй хэрэглэгч профайлыг ЭВДЭХГҮЙ (хоосон/null, алдаа биш). Байгууллага холбоход XYP-ийн эрх бүхий этгээдийн жагсаалт **захирал эхэнд** дараалалтай явна (eidmongolia эхний таарсанаар role тодорхойлдог). Зурагч нэмэх нь sign-push баталгаажуулалт хүртэл **PENDING** — нэг талын нэмэлт болохгүй. SSO proxy тохируулагдсан бол PKI зөвхөн proxy-гоор (RP-д PKI_READ шаардахгүй). |
| `org` | domain (дүр + эрхийн дүрэм) · repository interface + postgres · usecase · response DTO · 8 route. Үүсгэх/гишүүн нэмэх/хасахад audit бичигдэнэ. | 19 unit тест. Эрх ахиулах бүх зам хаалттай: гишүүн биш хүнд байгууллага байгаа эсэх ИЛЧЛЭГДЭХГҮЙ (403), `owner` дүрийг зөвхөн owner олгоно, owner-ийн дүрийг **өөрчилж/хасаж болохгүй** (эс бөгөөс admin owner-ыг бууруулаад хасч, хамгаалалтыг тойрно). Үүсгэгч ижил транзакцид owner болно — "эзэнгүй байгууллага" төлөв үүсэхгүй. |
| `gspace` | `pkg/gspace` SFTP client (ssh2-sftp-client, host-key баталгаажуулалт) · usecase (квот) · handler · 4 route | 13 unit тест. Файлын нэр замын НЭГ сегмент болж ариутгагдана — `../`, backslash-тай Windows зам ч хаагдана. Ижил нэртэй файл ОРЛУУЛАГДАХ тул хуучин хэмжээ квотоос хасагдана; жагсаалт уншиж чадахгүй бол хасалт хийхгүй (квотыг хатуу талд). Татаж чадаагүй БҮХ шалтгаан 404. Upload-ийн зам 4 MiB body хязгаартай (глобал 1 MiB биш). |
| `gateway` | domain · repository interface + postgres (percentile_cont p95) · usecase · response DTO · 6 route · хүсэлтийн лог middleware | 10 unit тест. Дутуу форм ажиллах чадвартай мөр болж **хэвийшинэ** (протокол→https, порт→80/443, зам→"/"). Лог нь ЗӨВХӨН гуравдагч талын RP-ийн зам (`/rp/sign`, `/api/v1/provider`)-ыг барина — өөрийн дотоод API трафик телеметрийг бохирдуулахгүй. Лог бичилт `res.on('finish')` дээр, алдаа залгигдана — хүсэлт хэзээ ч блоклогдохгүй. |
| `applications` | `pkg/secrethash` (Argon2id + Hydra PBKDF2 шалгалт) · oauth_clients repository · service↔scope хөрвүүлэгч · usecase · 8 route | 41 unit тест, **Go-гоос гаргасан Argon2id эталон вектор** + Ory Hydra-гийн PBKDF2 вектороор байт-нийцлийг баталсан (шилжилтийн үед одоо байгаа client-ууд secret-ээ солилгүй нэвтэрнэ). redirect_uri нь RFC 6749 §3.1.2-оор шалгагдана (https / зөвхөн loopback дээр http / fragment хориотой; native-д RFC 8252 private scheme). Public (spa/native) апп-д secret **огт үүсэхгүй**; `update` нь secret-д хүрэхгүй; түүхий secret зөвхөн create/rotate/set хариунд НЭГ удаа. |
| `integrations` | domain · repository interface + postgres (RLS) · usecase (AES-256-GCM) · handler · 4 route | 12 unit тест. OAuth токен DB-д **ил текстээр хэзээ ч очихгүй** — `base64(nonce‖ciphertext‖tag)` нь Go-ийн `gcm.Seal`-тэй байт-нийцтэй. Production-д `INTEGRATION_ENC_KEY` **заавал** (хоосон бол түлхүүр нь `sha256("")` — нийтэд мэдэгдэх тогтмол болж токен бодитоор ил хэвтэнэ). `GET /:provider/token` нь шифргүй токен буцаадаг тул зөвхөн server-тал дуудна. |
| `ssotoken` | `pkg/crypto` (AES-256-GCM, Go-ийн `gcm.Seal`-тэй байт-нийцтэй) · `pkg/oidc` (RP client: code/refresh/PKCE/userinfo/logout) · sso_tokens repository · usecase | 10 unit тест. Токен хугацаа дуусахаас **60с өмнө** урьдчилан refresh хийнэ; provider refresh token эргүүлэхгүй бол хуучныг хадгална. refresh_token-гүй нэвтрэлтийг хадгалахгүй. Хадгалалт унасан ч дуудлага нэг удаа гүйцэднэ. Энэ нь `eidprofile`-ийн SSO proxy замыг **бүрэн ажиллагаатай** болгов (өмнө `ssoTokens: null` байсан). |
| `sso` | domain/platform · ssouser repository (3 шатлалт upsert) · platform_settings repository · usecase · handler · 4 route | 17 unit тест. State нь Redis-д **нэг удаагийн** (replay/CSRF хаалттай). Иргэний дугаартай бол eID дансанд **нэгтгэнэ** — 3 шатлалт upsert: ① админаас урьдчилан бүртгэсэн мөр → ② пайрвайз мөрийг дэвшүүлэх → ③ civil_id-ээр merge. Private платформд бүртгээгүй иргэн **403, данс ч үүсэхгүй**; горим уншиж чадаагүй бол нэвтрэлт зогсоно (**fail-open биш**). id_token нь cookie-д ордоггүй — 32 hex ref-ээр Redis-д. |
| `registry` + `catalog` | domain (CPSV-AP паспорт) · repository interface + postgres (679 мөр SQL) · usecase · response DTO · **21 route** | 24 unit тест. **Германы VwVfG §35a-ийн загвар**: үнэлэх эрх (Ermessen) эсвэл үнэлгээний зайтай (Beurteilungsspielraum) үйлчилгээг `auto` болгохыг татгалзана — хүний оролцоо шаардах шийдвэр чимээгүйхэн машинд шилжихээс сэргийлнэ. Нийтлэхэд зарласан проактив шатыг **бодит once-only байдалтай тулгана** (зөрчилтэй бол 409) — регистр өөрөө худал мэдээлэл агуулахгүй. Нийтлэгдсэн паспорт устгагдахгүй (архивлана); архивлахад иргэний каталогоос ч гарна. `/catalog/*` нь эрхгүй ч зөвхөн нийтлэгдсэнийг эргүүлнэ. |
| `gov` | domain (төлөвийн машин) · repository interface + postgres (1100 мөр SQL) · usecase · response DTO · **24 route** | 21 unit тест. ГОЛ САЛААЛТ: `auto` үйлчилгээ НЭГ транзакцид биелж лавлагаа олгогдоно (дараалалд орохгүй), `manual` бол SLA цаг эхэлж Art.6(2)(b)-ийн "хүлээн авсан" мэдэгдэл өгнө. Үнэлэх эрхтэй `auto` үйлчилгээ гараар хянуулах руу **буурна**. Татгалзал **үндэслэлгүй гарахгүй**. Төлөвийн шилжилтийг usecase (уншигдах дүрэм) + SQL `WHERE` guard (уралдааны хаалт) **хоёуланд** хэрэгжүүлэв. Менежерийн дараалал нь `gov.review` эрх + `officer` RLS үүрэг гэсэн **хоёр давхар** хамгаалалттай; `assigned_to` нь зөвхөн `me`. `info_required` нь SLA цагийг зогсоож, мэдээлэл ирэхэд `due_at`-г зогссон хугацаагаар хойшлуулна. |
| `ai` | `pkg/gemini` (SDK-гүй REST client + WAV багцлагч) · domain · ai_prompts/ai_knowledge repository + postgres · usecase (чат pipeline · prompt давхаргууд · STT/TTS/орчуулга) · response DTO · **6 route** | 52 unit тест. **Suurь (base) заавар — хэл, хамрах хүрээний сахилт, prompt-injection эсэргүүцэл — КОДОД хатуу**; DB-ээс зөвхөн `scope`/`instructions` давхарга тохируулагдана (`admin/ai/prompts`, `settings.manage`). Tool-ыг **BACKEND гүйцэтгэнэ**, model зөвхөн сонголт хийнэ; tool доторх алдаа дэлгэрэнгүйгээ НУУЖ model руу `{error}` болж очно. Gemini түр унавал чат **5xx биш** — `degraded=true` + Монгол fallback. Prompt уншилтын DB алдаа чатыг унагахгүй (fail-open, хуучин кэшээр); `setPrompt` кэшийг шууд хүчингүй болгоно. TTS-ийн түүхий PCM сервер талд WAV болгогдоно (browser шууд тоглуулна). `/ai/*` нь ~20 req/мин (live орчуулга минутад ~8 chunk урсгадаг). |
| `relay` | domain (webhook HMAC · SLA босго) · repository interface + postgres · usecase (ingest · dispatch · sweep · demo simulator) · response DTO · **13 route** · background worker | 43 unit тест. Peer webhook нь **JWT-ГҮЙ**: итгэлийн үндэс нь `X-Relay-Signature` (HMAC-SHA256), ТҮҮХИЙ body дээр тогтмол хугацаанд шалгагдана (Express дээр тухайн замд `express.raw` нь JSON parser-аас ӨМНӨ сууна — дахин цувуулсан JSON гарын үсгийг эвдэнэ). Бүртгэлгүй эх ба буруу гарын үсэг **ИЖИЛ 401** (peer жагсаалт тандагдахгүй); идэвхгүй peer 403; нууцгүй peer үүсэхгүй (сервер 64-hex өөрөө үүсгэнэ, шалгалт хоосон нууц дээр ҮРГЭЛЖ false). Даалгаврын SLA нь хүсэлтийн эцсийн хугацаанаас **хэтрэхгүй**; чиглүүлэлтгүй `service_code` нь 400. SLA sweep: 75%/90% дээр сануулга, grace дараа escalate, breach мэдэгдэл нь хүсэлт тус бүрд **латчаар нэг удаа**. DB алдаа sweep-ийг унагахгүй. |
| `oidc` (provider) + `provider` | `usecases/oidc` (authorize · challenge · code · token · introspect/userinfo/revoke · RP-logout) · RSA гарын үсгийн KeyManager + JWKS · oauth_flow/oauth_keys repository + postgres · `usecases/provider` (login/consent/logout зохицуулалт) · **9 үндэс дээрх + 7 provider route** | 77 unit тест. `redirect_uri` нь ЯГ тулгагдана (prefix/wildcard ХЭЗЭЭ Ч биш); client/redirect буруу бол алдааг RP руу **ЧИГЛҮҮЛЭХГҮЙ** — баталгаажаагүй хаяг руу чиглүүлэх нь бүтцийн хувьд боломжгүй. PKCE public client-д заавал, зөвхөн `S256`. Authorization code НЭГ УДААГИЙН — дахин ирвэл тухайн иргэн+апп-ийн бүх token цуцлагдана; хэрэглэгдсэн refresh token дахин ирвэл **ГЭР БҮЛ** бүхэлдээ (RFC 9700 §4.14.2). Client-ийн зарласан auth method хатуу (downgrade хаалттай); public client introspect/revoke хийж чадахгүй. id_token нь RS256, kid-тэй — тест нь ГАРАЛТЫГ нийтлэгдсэн JWKS-ээр эргүүлж шалгадаг. `google` claims зөвхөн `google` scope-той (data minimization). Хувийн түлхүүр AES-256-GCM-ээр шифрлэгдэж хадгалагдана; rotate хуучныг JWKS-д үлдээнэ. |
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
4. ~~`ai`~~ ✅ (Gemini pipeline) · ~~`assets`~~ ✅
5. ~~`eidprofile`~~ ✅ · ~~`org`~~ ✅ · ~~`applications`~~ ✅ · ~~`integrations`~~ ✅ · ~~`gspace`~~ ✅
6. ~~`gov`~~ ✅ · ~~`registry`~~ ✅ · ~~`catalog`~~ ✅ · ~~`relay`~~ ✅ · ~~`gateway`~~ ✅
7. ~~`oidc`~~ ✅ (provider тал) · ~~`sso`~~ ✅ · ~~`ssotoken`~~ ✅ · `sign` · ~~`provider`~~ ✅
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
