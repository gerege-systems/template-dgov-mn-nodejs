# Аюулгүй Web + Mobile + API систем бүтээх заавар

**Stack:** Go (backend) · PostgreSQL (DB) · Next.js (web) · iOS/Android (mobile)
**Stance:** Production-ready, multi-tenant SaaS-ийг зорьсон. Single-tenant эсвэл internal tool бол энэ зөвлөмжийн зарим хэсгийг хэт хэмжүүртэй гэж үзэж болно — зориудаар тэмдэглэсэн.

Энэ заавар нь "юу хийх вэ"-ээс илүү "**яагаад, ямар стандартын дагуу, ямар Level-ийн баталгаатай**" гэдгийг тайлбарлахыг хичээсэн. Бүлэг бүрд applicable стандартыг (OWASP ASVS / MASVS / API Top 10, NIST CSF 2.0 / 800-63B / 800-218 SSDF, MITRE ATT&CK, ISO 27001:2022, CIS Controls v8) лавлагаа болгож тавьсан.

---

## Гарчиг

0. [Threat modeling (STRIDE + DREAD + LINDDUN + PASTA)](#0-threat-modeling)
1. [Authentication (NIST 800-63B AAL)](#1-authentication)
2. [Authorization (RBAC / ABAC / ReBAC + tenant isolation)](#2-authorization)
3. [PostgreSQL security](#3-postgresql-security)
4. [Web frontend (XSS / CSP / CSRF / SSRF / browser isolation)](#4-web-frontend-security)
5. [API security (OWASP API Top 10)](#5-api-security)
6. [Mobile security (OWASP MASVS)](#6-mobile-security)
7. [Infrastructure & cloud (zero-trust, mTLS)](#7-infrastructure--cloud)
8. [Software supply chain (SBOM / SLSA / signing)](#8-software-supply-chain)
9. [Logging, monitoring, IR (NIST 800-61)](#9-logging-monitoring-incident-response)
10. [Privacy & compliance (GDPR / PCI DSS / SOC 2 / ISO 27001)](#10-privacy--compliance)
11. [AI/LLM-тэй ажиллах бол (OWASP LLM Top 10)](#11-aillm-security)
12. [Security testing (SAST/DAST/SCA/fuzz/pentest)](#12-security-testing)
13. [Cryptography (хэт нандигнаж ОРОЛДОХГҮЙ ёстой газар)](#13-cryptography)
14. [Хэрэгжүүлэх дараалал — ASVS Level-аар хэмжсэн roadmap](#14-roadmap)
15. [Эх сурвалж](#15-resources)

---

## 0. Threat modeling

**Зорилго:** "Юунаас хамгаалах вэ?", "Хэн? Юу авах гэж?" гэдгийг архитекчид зөвшилцөж бичнэ. Аль ч аюулгүйн ажил энэхүү шинжилгээгүйгээр сохор хийгдэнэ.

### 0.1 Хослуулах загварууд

| Загвар | Юунд хэрэгтэй | Хэрхэн |
|---|---|---|
| **STRIDE** | Microsoft. Component-level threats | Spoofing, Tampering, Repudiation, Information disclosure, DoS, Elevation of privilege |
| **DREAD** | Score-лох | Damage, Reproducibility, Exploitability, Affected users, Discoverability (1-10 тус бүр) — нийлбэрээр sort |
| **PASTA** | Business-risk-driven 7 стейж | Threats тус бүрд бизнесийн нөхцөл, хохирлыг яаж тулгавалзах |
| **LINDDUN** | Privacy threats | Linkability, Identifiability, Non-repudiation, Detectability, Disclosure of information, Unawareness, Non-compliance |
| **MITRE ATT&CK** | Real attacker behaviour-аас mapping | TTPs (Tactics/Techniques/Procedures) ашиглаж detection rules бичнэ |

### 0.2 Process

1. **Data Flow Diagram (DFD)** зурна — trust boundaries (DMZ, internal, DB) тэмдэглэнэ.
2. STRIDE-ыг тус бүр boundary дээр давтан асууна.
3. LINDDUN-ыг PII өгөгдлийн урсгал дээр давтана.
4. Risks-ыг DREAD-аар score хийгээд эхний 10-ыг mitigate хийнэ.
5. **Threat model = code** — `THREAT_MODEL.md` репо дотор хадгална. PR review бүрд "this introduces new trust boundary?" гэж асуу.

**Tooling:** Microsoft Threat Modeling Tool (free), OWASP Threat Dragon (open-source), IriusRisk (enterprise).

---

## 1. Authentication

**NIST SP 800-63B Digital Identity Guidelines** нь дэлхийн стандарт. AAL (Authenticator Assurance Level) гэсэн 3 түвшинтэй:

| Level | Утга | Жишээ хэрэглээ |
|---|---|---|
| **AAL1** | Single-factor (password) | Public newsletter, low-risk consumer app |
| **AAL2** | Multi-factor required, replay resist | Бараг бүх SaaS, бизнесийн app |
| **AAL3** | Hardware-based (FIDO2 / smartcard), verifier impersonation resist | Government, banking, healthcare admin |

> **Бидний template-ийн default зорилго: AAL2.** Үндсэн хэрэглэгч нар MFA-тай байх ёстой; админ роль AAL3-руу нэмж явахад бэлэн байх.

### 1.1 Нууц үг — Modern rules (NIST 800-63B §5.1.1)

**Зөв:**
- **Уртаар** — minimum 8, recommend 12+. **Үсэг, тоо, тэмдэгт зэрэг complexity rule** алдаатай гэдгийг NIST 2017-оос албан ёсоор хүлээн зөвшөөрсөн (хэрэглэгчид pattern-аар туслана).
- **Have I Been Pwned API** ашиглан leak-сэн нууц үгийг блоклоно. k-anonymity prefix хэлбэр — `https://api.pwnedpasswords.com/range/<sha1[0:5]>` (бүтэн hash сервер рүү явахгүй).
- **Хэзээ ч заавал шинэчлүүлэхгүй** (өмнө "60 хоног тутамд" гэдэг байсан) — leak-сэн эсвэл халдлагын дохио гарсан үед л шинэчилнэ.
- Hash: **`argon2id`** (memory=64MB, t=3, p=2), бэлэн рецепт нь `golang.org/x/crypto/argon2`. Эсвэл `bcrypt` cost ≥ 12. **Аль аль нь стандарт OWASP-аар.**

```go
import "golang.org/x/crypto/argon2"

// OWASP-ийн зөвлөсөн minimum (2024)
hash := argon2.IDKey([]byte(password), salt, 3, 64*1024, 2, 32)
```

**Хэзээ ч:**
- MD5, SHA-256-ийг шууд нууц үгэнд (бараг ямар ч hashing-аар тогтохгүй — хурдан hash = brute-force-д урт ажиллахгүй)
- Plaintext, эсвэл reversible encryption-оор хадгалах
- "Salt + hash" гэдгийг өөрөө зохиох
- Security question-аар "Эхийн овог" гэх мэт — публикийн өгөгдөл, OSINT-аар олддог

### 1.2 Authenticators — иерархи

**Хамгийн сайн нь дээр:**

1. **Passkeys / WebAuthn (FIDO2)** ⭐ — phishing-resistant, NIST AAL3-д тэнцэх, password-less. iOS 16+, Android 9+, бүх том browser. **Шинэ project бүхэн passkey-ийг анхнаас нь дэмжих ёстой.**
2. **Hardware security key (YubiKey)** — admin-уудад.
3. **TOTP** (Google Authenticator, Authy) — баталгаатай, оффлайн ажиллана. `github.com/pquerna/otp/totp`.
4. **Push notification** (custom mobile app дотор) — UX сайн, бат бөх auth-зайны баталгаа.
5. **Email magic link** — нэмэлт factor болгож зөвшөөрнө. Захиалгат app-д үндсэн factor болж болохгүй (email хагарвал бүх зүйл алдагдана).
6. **SMS OTP** — **DEPRECATED** (NIST 800-63B 2017-аас "RESTRICTED"). SIM swap, SS7 халдлага. Зөвхөн legacy users-руу fallback.

### 1.3 Session strategy

| Загвар | Web | Mobile | Revoke | Phishing-resist |
|---|---|---|---|---|
| **Server-side session** (cookie + Postgres/Redis) | ⭐ Ideal | OK | Easy | Cookie + CSRF token |
| **JWT (stateless)** | OK | OK | Hard (blacklist) | Бага (token-ийг доромжилж болно) |
| **PASETO / Biscuit** | OK | OK | Hard | JWT-ээс илүү |
| **OAuth2 + OIDC** | ⭐ Enterprise | ⭐ Enterprise | Token introspect | Хамгийн өндөр |

**Зөвлөмж:** **Web-д server-side session** (`SameSite=Lax + Secure + HttpOnly`), **mobile-д OAuth2 + refresh token rotation**, **enterprise-д OIDC** (Keycloak, Auth0, Ory Hydra). JWT-г "хямд" гэж зориуд бүү сонго — revoke-ийн өндөгтэй холбоотой compliance асуудал гарна.

### 1.4 Refresh token rotation (DETAIL)

Эталон pattern:

1. Хэрэглэгч login → `access_token` (15m) + `refresh_token_v1` (30d, randomly generated, hash-аар DB-д).
2. Mobile/web `refresh_token_v1`-аар шинэ token авна → server нь `refresh_token_v1`-ийг revoke хийгээд `refresh_token_v2` өгнө.
3. **Хэрэв `refresh_token_v1` дахиад орж ирвэл — гэр бүлийг бүхэлд нь revoke хийнэ** (reuse detection). Хэрэглэгч re-login хийнэ. RFC 6819 §5.2.2.3-д бичигдсэн.

```go
// Sketch — нэг ширхэг token гэр бүлд "session_id" гэсэн нийтлэг ID өгнө.
// Reuse илрэхэд тэр session_id-ийн бүх refresh-ийг revoke.
```

### 1.5 Account lockout, rate limiting, enumeration

- **Rate limit:** Login endpoint 5 req/min/IP. Bcrypt verify хэдхэн миллисекундийн зардалтай тул per-user counter (Redis) дээр.
- **Lockout:** 10 failure → 15m softlock. Distributed brute-force-ийг detect хийхэд per-IP biш per-user counter чухал.
- **Account enumeration зайлсхий:**
  - "Email олдсонгүй" vs "Нууц үг буруу" гэж ялгаж ХАРИУЛАХГҮЙ → "Имэйл эсвэл нууц үг буруу" гэдэг ижил мессеж.
  - Forgot-password endpoint: байгаа эсэхээс үл хамаарч "хэрэв энэ имэйл бүртгэлтэй бол link явсан" — энэ нь нэр илрэхээс хамгаалдаг.
  - Registration: "Энэ имэйл ашиглагдсан" гэж ил гаргахгүй; verification email-аар нь дамжуулна.

### 1.6 Recovery flows

> **Үндсэн жорхны судалгаа:** Account takeover-ийн >40% нь recovery flow-оор болдог. Phishing-аар нэг удаа recovery email авбал бүх зүйл алдагдана.

- Recovery codes (10 ширхэг) — hash-аар хадгал. Хэрэглэгч хуулж бичсэний дараа л хадгал.
- Нууц үг сэргээх нь нэг удаагийн OTP код (GeregeCloud Verify)-оор явна: код богино TTL-тэй (≈30 мин), нэг удаа ашиглагдана, серверийн log-д кодыг бүү бич. Reset нь `{email, code, new_password}` хэлбэртэй — reset link/token биш.
- Email/phone recovery дангаараа AAL1 — AAL2 хэрэглэгчийн нууц үг сэргээхэд нэмэлт challenge заавал.

### 1.7 OAuth2 / OIDC

- `state` parameter заавал (CSRF protection).
- **PKCE заавал** даже confidential client-д (RFC 9700 BCP-аар 2024-аас mandatory).
- `redirect_uri` — exact match strict whitelist.
- Token-ыг localStorage-д бүү хадгал; HttpOnly cookie ашигла.
- ID token дотрох claims-ыг signature шалгаад л итгэ. `alg: none`, key confusion халдлагаас сэрэмжлэх.

### 1.8 Standards mapping

| Стандарт | Зүйлчилсэн заалт |
|---|---|
| OWASP ASVS v4 | V2 Authentication, V3 Session |
| NIST SP 800-63B | All AAL requirements |
| OWASP Cheat Sheet | Authentication, Password Storage, Session Management |
| RFC 6749 / 6750 / 8252 / 9700 | OAuth2 (mobile native app BCP) |
| WebAuthn L3 | Passwordless |

---

## 2. Authorization

> Authentication = "Чи хэн бэ?"  Authorization = "Чи юу хийж болох вэ?"

### 2.1 Загварууд

| Загвар | Нарийвчлал | Гүйцэтгэл | Жишээ |
|---|---|---|---|
| **RBAC** (Role-Based) | Coarse | Хурдан, JOIN ширхэгтэй | "admin", "support" — энэхүү template-д |
| **ABAC** (Attribute-Based) | Дунд | Дунд | "Зөвхөн өөрийн tenant-ийн file үзэх" |
| **ReBAC** (Relationship-Based) | Fine | DB-ийн graph хэрэгтэй | Google Drive — "shared with you" → SpiceDB, OpenFGA |
| **Policy-as-Code** | Бүгд боломжтой | Cache хэрэгтэй | Open Policy Agent (Rego), AWS Cedar |

**Template зөвлөмж:** RBAC + ABAC (tenant isolation), enterprise-д ReBAC + OPA нэмэх.

### 2.2 IDOR (OWASP A01:2021 Broken Access Control)

Хамгийн дахин давтагдах vulnerability. Server бүх resource-д **эзэмшигч мөн эсэхийг** шалгана:

```go
// БУРУУ — IDOR
func GetInvoice(invoiceID string) (*Invoice, error) {
    return db.Get(invoiceID)
}

// ЗӨВ — tenant + owner double-check
func GetInvoice(ctx context.Context, invoiceID string) (*Invoice, error) {
    inv, err := db.Get(ctx, invoiceID)
    if err != nil { return nil, err }
    if inv.TenantID != tenant.ID(ctx) { return nil, ErrNotFound } // NotFound, not Forbidden
    if !canAccess(ctx, inv) { return nil, ErrForbidden }
    return inv, nil
}
```

Нэмэлт **UUID-уудыг ашиглаж integer ID-ийг fold хийхгүй**. Sequential ID нь enum-аар хайхад хялбар (1, 2, 3, ...).

### 2.3 BOLA / BFLA (OWASP API Top 10)

- **BOLA** (Broken Object Level Authorization) — A1:2023. Жишээ: `GET /api/v1/users/1234/notes` — 1234 бусдын ID байгаа бол?
- **BFLA** (Broken Function Level Authorization) — A5:2023. Жишээ: `POST /admin/users` — entry point HTTP-аар хамгаалаагүй болохоор regular user хандана.

Бүх endpoint-д permission check writes-ийг ABAC layer-оор бичих нь хамгийн найдвартай.

### 2.4 Tenant isolation (энэ template-ийн pattern)

Бид `internal/tenant` package дотор:

```go
// Repository бүх query-д tenant.Scope(ctx) автомат WHERE tenant_id=?
db.WithContext(ctx).Scopes(tenant.Scope(ctx)).Find(&items)
```

**Defense-in-depth-аар:**
1. **App layer** — middleware tenant_id-ийг ctx-д тавьдаг + repo Scope.
2. **DB layer** — Postgres RLS (доорхи 3.3-р хэсэг). App alone хангалтгүй; bug гарвал DB өөрөө хааж зогсооно.
3. **Test layer** — automated test нь "user A tenant B-ийн data-руу хандвал 404" гэдгийг шалгана. Гар жорхны test write-р алдагдахгүй.

### 2.5 Cedar / OPA-ийн жишээ (advanced)

Хэрэв permission матрица хэт нийлмэл болж эхэлвэл (e.g. файл sharing) — policy-as-code-руу шилжих:

```rego
# OPA Rego — "доромжид нь өгсөн файлыг үзэх боломжтой"
package files.access
default allow = false
allow {
  input.user.tenant_id == input.file.tenant_id
  input.user.id == input.file.owner_id
}
allow {
  some share
  share := data.shares[_]
  share.file_id == input.file.id
  share.shared_with == input.user.id
  share.expires_at > time.now_ns() / 1000000000
}
```

### 2.6 Standards mapping

| OWASP ASVS V4 | NIST CSF | CIS Controls v8 |
|---|---|---|
| V4 Access Control | PR.AC-4 (Least Privilege) | 6.7 (Centralized Access Control) |

---

## 3. PostgreSQL security

### 3.1 SQL injection (OWASP A03:2021)

**Parameterized queries — заавал. Зэрэг.**

```go
// ✅ pgx, database/sql — placeholder-аар
db.QueryRow(ctx, "SELECT id FROM users WHERE email = $1", email)

// ❌ ХЭЗЭЭ Ч
db.Query(ctx, fmt.Sprintf("SELECT * FROM users WHERE email='%s'", email))
```

**Tooling:**
- `sqlc` — compile-time SQL шалгана, type-safe.
- `gosec` — Go SAST, SQL injection pattern илрүүлдэг.
- pg_query_go — parsing-аар pre-validate боломжтой.

**Order BY/LIMIT-д хэрэглэгчийн оруулга:** Whitelist column names (зөвхөн зөвшөөрсөн string-уудтай харьцуулна), бусдыг хаа.

### 3.2 search_path attack (CVE-2018-1058)

PostgreSQL-ийн `search_path` config-ийг attacker tenable бол `public` schema-д trojan function тарьж зарим function call-ыг hijack хийж чадна.

```sql
-- App ажиллах үед заавал:
ALTER ROLE app_user SET search_path = "$user", app_schema, public;
-- эсвэл connect string-д options="-c search_path=app_schema"
```

### 3.3 Row-Level Security (RLS) — tenant_id-ээр

Энэ template-ийн tenant_id columns нь app layer-аар хамгаалагдсан. **Defense-in-depth-аар DB layer-д давхар хамгаалалт нэмэх:**

```sql
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE ROW LEVEL SECURITY; -- table owner-д ч хүрнэ

CREATE POLICY tenant_isolation ON notifications
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id')::int);

-- App connection бүрд:
-- SET app.tenant_id = '42'; — middleware-ээс
```

Bug-аар app layer-аас tenant_id-ийг тавиагүй query гарвал DB өөрөө хооронд ялгаж зогсооно.

**Admin / cross-tenant query-д** `BYPASSRLS` эрхтэй тусдаа DB role ашиглах. Ердийн `app_user`-аас bypass хийхгүй.

### 3.4 DB user separation

```sql
-- Migration хийдэг user (CREATE/DROP/ALTER)
CREATE USER app_migrator WITH PASSWORD '<vault>';

-- App user (DML only)
CREATE USER app_user WITH PASSWORD '<vault>';
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app_schema TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA app_schema GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
-- ХЭЗЭЭ Ч superuser/postgres-аар app холбохгүй
```

### 3.5 Connection security

- **`sslmode=verify-full`** — server certificate-ийг CA + hostname-ээр шалгана. `require` (CA шалгахгүй) MITM-д өртөмтгий.
- **scram-sha-256** authentication (`pg_hba.conf`) — md5 нь outdated.
- `pg_hba.conf` нь нарийн whitelist: app subnet only.

### 3.6 Encryption

- **At rest:** managed Postgres-ийн TDE автоматаар. Self-hosted бол LUKS эсвэл disk-level encryption + WAL-ыг бас encrypt хий.
- **In transit:** TLS заавал (3.5 дээр).
- **Field-level** PII / credit card / health data:
  - `pgcrypto` extension — `pgp_sym_encrypt(data, key)` — гэхдээ key Postgres-аас хол байх ёстой.
  - **Envelope encryption**: app layer-аас AES-256-GCM, key нь KMS (AWS KMS, GCP KMS, Vault Transit)-аас.
  - Key rotation lifecycle бичигдсэн байх (NIST SP 800-57).

### 3.7 pgaudit — compliance-д заавал

`pgaudit` extension — DDL, role change, sensitive table access-ийг log хийнэ. SOC2 / PCI DSS / HIPAA аудитын essential evidence.

### 3.8 Backup hygiene

- Encrypted backup + offsite (өөр availability zone, өөр cloud account).
- **Сард нэг restore тест** хийнэ — туршаагүй backup = backup биш.
- Point-in-time recovery (WAL archiving) — RPO < 5 мин.
- Backup encryption key нь production DB-ийн key-ээс **тусдаа** байх.

### 3.9 Connection pooling

`pgx` + **PgBouncer** transaction pooling mode. Connection limit-гүй бол slow query + DDoS-аар DB unresponsive болно.

### 3.10 Standards mapping

| Стандарт | Bүлэг |
|---|---|
| OWASP ASVS V5 (Validation, Sanitization) | V5.3 |
| CIS PostgreSQL Benchmark | All |
| PCI DSS 4.0 | Req 3 (encryption), Req 8 (access) |

---

## 4. Web frontend security

### 4.1 XSS layered defense

**3 төрөл:**
- **Reflected** — URL-ээс шууд server response-д
- **Stored** — DB-аас render-аар орох (хамгийн аюултай)
- **DOM-based** — client-side JS өөрөө гажуудуулна

**React/Next автомат escape хийдэг**, гэхдээ:

1. `dangerouslySetInnerHTML` ашиглавал **`DOMPurify`** (server-side прежэ).
2. `href={...}` — `javascript:` scheme-ийг шалгаж шигшил (хэрэглэгч URL оруулдаг бол).
3. **Trusted Types API** (CSP `require-trusted-types-for 'script'`) — modern browser-д DOM XSS бараг бүхэлд нь хаана.

### 4.2 CSP (Content Security Policy)

Modern зөвлөмж — **strict CSP with nonce + strict-dynamic**:

```ts
// Next.js middleware.ts
const nonce = crypto.randomUUID();
const csp = [
  `default-src 'self'`,
  `script-src 'nonce-${nonce}' 'strict-dynamic'`,
  `style-src 'self' 'unsafe-inline'`,           // Tailwind гэх мэт inline-аар үлдэх бол unsafe-inline
  `img-src 'self' data: https:`,
  `font-src 'self' data:`,
  `connect-src 'self' https://api.example.com`,
  `frame-ancestors 'none'`,                     // clickjacking
  `base-uri 'self'`,                            // base-tag XSS
  `form-action 'self'`,
  `require-trusted-types-for 'script'`,         // DOM XSS
  `upgrade-insecure-requests`,
  `report-uri https://example.report-uri.com/r/d/csp/enforce`,
].join('; ');
```

**`'unsafe-inline'` script-д ХЭЗЭЭ Ч.** Style-д бол tailwind, CSS-in-JS-ээс шалтгаалж сонгох. Inline style sheet хэрэглэхгүй бол `'unsafe-inline'`-ийг бас үгүйсгэ.

### 4.3 CSRF

| Auth model | CSRF protection |
|---|---|
| Bearer token (Authorization header) | Хэрэггүй — cookie дамждаггүй |
| Cookie session | **Double-submit cookie** + `SameSite=Lax` (state-changing-д `SameSite=Strict` боломжтой бол) |
| Mixed (cookie + JWT) | Cookie talaas нь CSRF token заавал |

```go
// gorilla/csrf — token cookie-д + header X-CSRF-Token-д бичих
```

Энэ template-д cookie session + bearer хослуулсан болохоор `X-CSRF-Token` header-аар хамгаалдаг.

### 4.4 SSRF (OWASP A10:2021)

Server-Side Request Forgery — server хэрэглэгчийн оруулсан URL-руу хүсэлт явуулдаг. Attacker:

- AWS metadata service (`http://169.254.169.254`) — credentials хулгайлна
- Internal admin panel (`http://10.0.0.1:8080`)
- localhost-ийн дотоод service

**Хамгаалалт:**
- URL allow-list (whitelist hosts) — ideal
- Block private IP ranges (RFC 1918, 169.254/16, ::1/128, fc00::/7)
- HTTP client-ийн `Transport.DialContext`-аар resolve хийсэн IP-г шалгана
- HEAD redirect-аар private руу очих халдлагыг сэрэмжил

### 4.5 Open redirect

```go
// ❌ Аюултай
http.Redirect(w, r, r.URL.Query().Get("return_to"), 302)

// ✅ Whitelist
allowed := map[string]bool{"/dashboard": true, "/admin": true}
if !allowed[returnTo] { returnTo = "/" }
```

### 4.6 Browser isolation headers (modern)

| Header | Утга |
|---|---|
| **Cross-Origin-Opener-Policy: same-origin** | Window-ийн opener-ийг тусгаарлана (Spectre side-channel) |
| **Cross-Origin-Embedder-Policy: require-corp** | SharedArrayBuffer-д хэрэгтэй, бусад orig-ийн iframe-аас тусгаарлана |
| **Cross-Origin-Resource-Policy: same-site** | Resource embedding-ийг хязгаарлана |

### 4.7 Security headers (бүх response дээр)

```
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Content-Type-Options: nosniff
X-Frame-Options: DENY                      # CSP frame-ancestors-ийг давна, гэхдээ legacy-д хэрэгтэй
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Resource-Policy: same-site
```

`securityheaders.com`-д A+ авах хүртэл тааруул.

### 4.8 CORS

Энэ template-д CORS-ийг Fiber биш, стандарт `net/http` дээр chi-style
middleware-аар хийдэг (`internal/http/middlewares` доtorх `CORSMiddleware()`,
`func(http.Handler) http.Handler` хэлбэртэй). Origin allow-list-ийг яг таарах
эсэхээр шалгаж, зөвшөөрсөн method/header-ийг тодорхой бичнэ:

```go
// internal/http/middlewares — chi-style CORS (товч skeleton)
func CORSMiddleware() func(http.Handler) http.Handler {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            origin := r.Header.Get("Origin")
            if allowedOrigins[origin] { // яг таарах allow-list
                w.Header().Set("Access-Control-Allow-Origin", origin)
                w.Header().Set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,PATCH")
                w.Header().Set("Access-Control-Allow-Headers", "Authorization,Content-Type,X-CSRF-Token,X-Tenant-ID")
                w.Header().Set("Access-Control-Allow-Credentials", "true")
                w.Header().Set("Access-Control-Max-Age", "300")
            }
            // CORS spec-ийн дагуу Allow-Origin="*" + Allow-Credentials=true ХЭЗЭЭ Ч хослуулахгүй
            if r.Method == http.MethodOptions {
                w.WriteHeader(http.StatusNoContent)
                return
            }
            next.ServeHTTP(w, r)
        })
    }
}
```

### 4.9 File upload

- MIME type-ыг content (magic bytes)-ээс таних, extension-аас бус
- Хэмжээ хязгаарлал — middleware level
- **Тусдаа domain-аас serve хий** — cookie tenant жигшил, XSS-аас isolated
- ClamAV эсвэл cloud antivirus-аар scan
- Filename-ыг **бүхэлд нь дахин үүсгэ** (`uuid + extension`) — path traversal, encoding халдлагыг сэрэмжил

### 4.10 Subresource Integrity (SRI)

CDN-аас JS/CSS татаж байгаа бол:

```html
<script src="https://cdn.../jquery.js"
  integrity="sha384-..."
  crossorigin="anonymous"></script>
```

### 4.11 Standards mapping

- OWASP ASVS V5 (Validation), V13 (API)
- OWASP Cheat Sheet: XSS Prevention, CSP, CSRF, SSRF
- securityheaders.com / Mozilla Observatory grade

---

## 5. API security

**OWASP API Security Top 10 (2023)** — REST API-д тусгайлсан Top 10:

| API# | Заалт | Энэ template-д хэрхэн |
|---|---|---|
| API1 BOLA | Object-level auth | tenant.Scope + handler check |
| API2 Broken Authentication | weak auth | Section 1 |
| API3 Broken Object Property Level Auth | mass assignment | DTO whitelist (struct binding-д field-уудыг ил тэмдэглэх) |
| API4 Unrestricted Resource Consumption | DoS-аар | middleware.RateLimiter + middleware.PaginationLimit |
| API5 BFLA | function-level auth | auth.RequirePermission middleware |
| API6 Unrestricted Access to Sensitive Business Flows | enum, bot abuse | CAPTCHA / proof-of-work / behavioral |
| API7 SSRF | section 4.4 |  |
| API8 Security Misconfiguration | default-д open | infra hardening |
| API9 Improper Inventory Management | shadow API | OpenAPI spec mandatory; gen-types pipeline |
| API10 Unsafe Consumption of APIs | third-party | timeout, schema validate |

### 5.1 Mass assignment / over-posting

```go
// ❌ БУРУУ
var u User
c.BodyParser(&u)        // is_admin=true гэдгийг attacker оруулна
db.Save(&u)

// ✅ ЗӨВ
var req struct {
    Email string `json:"email" validate:"required,email"`
    Name  string `json:"name"  validate:"required,max=100"`
}
c.BodyParser(&req)
u.Email = req.Email
u.Name = req.Name
db.Save(&u)
```

### 5.2 Idempotency

POST / PATCH-д `Idempotency-Key` header дэмжих (Stripe / Square pattern). Энэ template-д `middleware.IdempotencyKey(redis, 24h)` бий.

### 5.3 Pagination & resource limits

- `?limit=` max 100. `middleware.PaginationLimit(100)` already wired.
- Cursor-based pagination preferred (offset-аас өндөр гүйцэтгэлтэй + race-аас бага).
- Request body size limit — net/http body-size-limit middleware (энэ template-д `BodySizeLimitMiddleware`, `http.MaxBytesReader`-ээр body-г 4 MiB-д хязгаарладаг).
- Request timeout (`middleware.Timeout(5*time.Second)`).

### 5.4 GraphQL specific (ашиглавал)

- Query depth limit (max 10)
- Query complexity scoring
- Introspection prod-д disable
- Persisted queries

### 5.5 Webhook security

Гадаад service-аас webhook хүлээж авах бол:

- **HMAC signature** — `X-Signature: hmac_sha256(secret, body)`, constant-time compare
- **Timestamp** — `X-Timestamp` header, 5-минутаас хэтэрсэн бол reject (replay)
- **Allow-list IP**-аас, эсвэл mTLS

### 5.6 Standards mapping

- OWASP API Security Top 10 2023
- OWASP ASVS V13 (API and Web Services)

---

## 6. Mobile security

**OWASP MASVS v2** нь 3 түвшинтэй:

| MASVS Level | Зорилго |
|---|---|
| L1 | Standard security (бараг бүх consumer app) |
| L2 | Defense-in-depth (banking, healthcare) |
| L3 | + Resiliency against reverse engineering (DRM, banking core) |

**Template default: L1+. Banking зэрэг бол L2.**

### 6.1 Storage (MASVS-STORAGE)

- **iOS:** Keychain Services API, `kSecAttrAccessibleWhenUnlockedThisDeviceOnly` + `kSecAttrAccessControlFlags = .biometryCurrentSet`.
- **Android:** EncryptedSharedPreferences (Jetpack Security) эсвэл Keystore-аар encrypt. **Hardware-backed StrongBox**-руу запросс хий (`KeyGenParameterSpec.Builder.setIsStrongBoxBacked(true)` API 28+).
- **React Native:** `react-native-keychain` (uses Keychain/Keystore underneath).
- **Flutter:** `flutter_secure_storage`.
- Cache, log, screenshot, accessibility tree-д sensitive data урсаж орохгүй (e.g. iOS `UITextField.isSecureTextEntry = true`).

### 6.2 Network (MASVS-NETWORK)

- TLS 1.2+ зөвхөн. ATS (iOS), Network Security Config (Android) дотор.
- **Certificate pinning** — public key pinning preferred (cert rotation хийсэн ч rotate хийхгүй):
  - iOS: `URLSessionDelegate.urlSession(_:didReceive:completionHandler:)`
  - Android: `CertificatePinner` (OkHttp), эсвэл `network-security-config.xml`
  - **Backup pin тавь** — next year-ийн cert-ийн public key pre-publish хийсэн нь хэрэгтэй
- mTLS — banking/admin-д.

### 6.3 Authentication (MASVS-AUTH)

- Biometric — system-ийн API ашигла (LocalAuthentication, BiometricPrompt). Бүү фунгсэ.
- Token storage — Section 6.1.
- App lock — n мин ашиглахгүй бол re-auth.

### 6.4 Platform (MASVS-PLATFORM)

- **Deep links** — Universal Links (iOS) / App Links (Android) ашигла, custom scheme-ээс зайлсхий (өөр app адил `myapp://` бүртгэж чадна).
- WebView ашиглавал — `setAllowFileAccess(false)`, `setJavaScriptEnabled` мээж sensitive контент-д хэрэглэхгүй.
- IPC — exported component-ийг minimum.

### 6.5 Code / Anti-reversing (MASVS-CODE / RESILIENCE)

- API key-г app-д hardcode ХЭЗЭЭ Ч. Decompile хийгдэнэ.
- Sensitive logic-ыг backend-д.
- **App attestation:**
  - iOS: `DeviceCheck` + **App Attest** (iOS 14+) — apple-аас attestation token авна
  - Android: **Play Integrity API** (legacy SafetyNet outdated)
- Anti-debug, anti-tamper (L2+): root/jailbreak detection, debugger detection. Гэхдээ "арилгуулахгүй" гэдэг хүсэл биш — bypass хийгдэхгүй гэж байхгүй, defense-in-depth-ийн нэг давхарга.
- ProGuard/R8 (Android) — class/method-ийн obfuscation.

### 6.6 Standards mapping

- OWASP MASVS v2
- OWASP MASTG (Mobile Application Security Testing Guide)
- NIST 800-163 (App vetting)

---

## 7. Infrastructure & cloud

### 7.1 TLS

- TLS 1.2+ зөвхөн. **TLS 1.3 preferred** (forward secrecy, 0-RTT баталгаатай).
- `ssllabs.com/ssltest` дээр **A+** авах хүртэл тааруул.
- HSTS preload жагсаалт ([hstspreload.org](https://hstspreload.org)).
- Certificate transparency — Caddy / Let's Encrypt автоматаар.

### 7.2 DNS / domain security

- **CAA records** — `example.com. CAA 0 issue "letsencrypt.org"`. CA эсэн бусад үед issue хийхгүй.
- **DNSSEC** — DNS spoofing-аас.
- **Subdomain takeover prevention:** хэрэглээгүй CNAME-уудыг устгана (S3 bucket-руу зөв-rd CNAME оруулсан атлаа bucket-аа устгасан тохиолдолд — attacker bucket-ийг хийгээд subdomain эзэмшинэ).
- Email auth: **SPF + DKIM + DMARC** (p=reject) — спуфинг-аас хамгаалах.

### 7.3 Secrets management

- **Хэзээ ч git-д тавихгүй.** `gitleaks`, `trufflehog` pre-commit + CI.
- Cloud KMS / Vault / AWS Secrets Manager / GCP Secret Manager.
- Local dev: `.env` + `.gitignore` + `direnv` + 1Password CLI / `op`.
- Secret rotation policy (NIST 800-57):
  - DB password: жил тутамд
  - API key: 90 хоног
  - Encryption keys: эхлэлд key versioning, rotation 90-365 хоног

### 7.4 Container security

- **Distroless / Wolfi / Chainguard** images — attack surface бага.
- Non-root user (`USER 65532`).
- Read-only root filesystem (`docker run --read-only` / K8s `securityContext.readOnlyRootFilesystem: true`).
- **`trivy` + `grype`** CI image scan.
- **Multi-stage builds** — build tools production image-д үлдэхгүй.

### 7.5 Image signing (SLSA / Sigstore)

```bash
cosign sign --key cosign.key myorg/myapp:v1.0
# Pull-аар:
cosign verify --key cosign.pub myorg/myapp:v1.0
```

K8s admission controller (Sigstore policy-controller) — signed images зөвхөн зөвшөөрнө.

### 7.6 Kubernetes hardening

- **Namespaces** — tenant эсвэл сервис тус бүрд isolation.
- **NetworkPolicy** — pod-уудын хоорондын traffic-ийг default-deny + explicit allow.
- **Pod Security Standards** (Restricted profile).
- **Secrets:** env-р биш, projected volume + mounted file-аар inject.
- **etcd encryption at rest** — KMS-аар.
- **RBAC** — least privilege, ClusterAdmin-аар service ажиллуулж болохгүй.
- **Image pull policy** — pinned digest (`@sha256:...`), tag биш.

### 7.7 Service mesh / mTLS

Олон microservice бол **Istio / Linkerd**:
- mTLS automatic
- L7 policy (HTTP method, path level)
- Observability

### 7.8 Network

- **Database public internet-д НЭЭЛТТЭЙ байх ЁСГҮЙ.** VPC dotor only.
- **WAF** (Cloudflare, AWS WAF) — OWASP CRS rule set.
- **DDoS:** Cloudflare proxy, AWS Shield.
- **SSH:** password disable, key-only, fail2ban. Хамгийн сайн нь Identity-Aware Proxy / AWS SSM Session Manager — SSH-аа openhid огт нээхгүй.
- **Zero-trust** (BeyondCorp model) — perimeter иш биш, ажилтан бүр device + identity check тутамд.

### 7.9 Standards mapping

- CIS Docker / Kubernetes Benchmarks
- NIST SP 800-190 (Container Security)
- NIST SP 800-207 (Zero Trust Architecture)
- CIS Controls v8: 12 (Network), 4 (Secure Config), 7 (Vulnerability Mgmt)

---

## 8. Software supply chain

US Executive Order 14028 (2021), NIST SP 800-218 SSDF, **SLSA framework** энэ хэсгийг compliance-д орлууллаа.

### 8.1 SBOM (Software Bill of Materials)

```bash
# Go
syft packages dir:. -o cyclonedx-json > sbom.json

# Node.js
npx @cyclonedx/bom -o sbom.json

# Container image
syft myorg/myapp:v1.0 -o cyclonedx-json
```

SBOM-ыг **artifact бүрд эзэлж**, release дотроо публиш хий. CVE-аар scan хийхэд хэрэгтэй.

### 8.2 SLSA Level

| Level | Зорилго |
|---|---|
| **SLSA 1** | Build process documented, provenance available |
| **SLSA 2** | Hosted build service, signed provenance |
| **SLSA 3** | Source/build platform хоорондоо тусгаарласан, non-falsifiable provenance |
| **SLSA 4** | Two-person review, hermetic + reproducible builds |

**Шинэ project зорилго: SLSA 2-3.** GitHub Actions + sigstore provenance + reusable workflow.

### 8.3 Dependency security

| Layer | Tool |
|---|---|
| Go | `govulncheck` (албан ёсны NVD-ээс) |
| npm | `npm audit`, **Dependabot**, Snyk |
| Container image | `trivy`, `grype` |
| Source code | Snyk Code, **GitHub CodeQL**, Semgrep |

**Lockfile** (`go.sum`, `package-lock.json`) **заавал commit**.

### 8.4 Dependency confusion / typosquat

`npm` private package-д тэр чигт нь жорхны `org` namespace ашигла (`@yourorg/foo`). public registry-аас "foo" гэж нэртэй сэр authentic эсэхийг шалга.

Шинэ package нэмэхээсээ өмнө:
- Maintainership (хэн зохиосон бэ?)
- Last commit (бараг 2 жил болоогүй бол сэрэмжил)
- Downloads тоо
- Тусдаа nokurd LICENSE
- `socket.dev` гэх мэт тусгай scoring service ашигла

### 8.5 Reproducible builds

Go-д CGO_ENABLED=0, `-trimpath`, `-buildid=`, golang `-mod=readonly`. Hash идэхэд build хийсэн машин-аас үл хамаарч ижил гарна.

### 8.6 Standards mapping

- NIST SP 800-218 SSDF (Secure Software Development Framework)
- SLSA v1.0
- CISA Secure by Design Pledge
- OWASP SCVS (Software Component Verification Standard)

---

## 9. Logging, monitoring, incident response

### 9.1 Юу лог хийх вэ

**Заавал (NIST 800-92 / NIST CSF DE.AE):**
- Authentication events (success, failure, lockout, MFA bypass)
- Authorization denials (403)
- Admin actions (config change, role assign, user create/delete)
- Sensitive data access (PII view, export)
- Payment / financial transactions
- Anomalous traffic (5xx spike, error rate spike, high request rate)
- Application start/stop, deployment events

**Format:** Structured (JSON), OpenTelemetry semantic conventions:
- `service.name`, `service.version`
- `user.id`, `tenant.id`, `request.id`
- `event.name` (e.g. `auth.login.success`)
- `severity_number`, `severity_text`

```go
import "go.uber.org/zap"
log.Info("auth.login.success",
    zap.String("user.id", userID),
    zap.Int("tenant.id", tenantID),
    zap.String("request.id", reqID),
    zap.String("ip", ip),
)
```

### 9.2 Юу лог хийхгүй

**ХЭЗЭЭ Ч лог-д урсуулахгүй:**
- Plaintext password
- Бүтэн PAN (credit card)
- API key, JWT, session token, refresh token
- PII шаардлагагүй бол (email, phone, SSN) — hashing / masking
- Health data (HIPAA)

**Tooling:** zap-ийн `Encoder`-т PII fields-ийг redact хийх wrapper бичих. Лог backend talaас (Loki / Datadog) дахин filter.

### 9.3 Log integrity

- Tamper-evident: WORM storage (AWS S3 Object Lock), эсвэл blockchain-based audit (overdrive in most cases).
- Log forwarding нь app-аас гадуурх machine руу — local disk-д host-аар орчуулагдсан үед арилгах боломжгүй.

### 9.4 Monitoring / SIEM

| Stack | Жишээ |
|---|---|
| Open-source | Loki + Grafana + Tempo + Mimir |
| SaaS | Datadog, New Relic, Honeycomb |
| Enterprise SIEM | Splunk, Elastic SIEM, Sentinel, Chronicle |

**Alerts (NIST CSF DE.AE-5):**
- 1 минутанд 100+ failed login → critical
- Шинэ географи / device admin login → high
- DB query duration spike → medium
- 5xx rate >5% → critical

### 9.5 Incident Response (NIST SP 800-61r2)

**6 phases:**
1. **Preparation** — IR plan, runbooks, contacts
2. **Detection & Analysis** — alert routing, triage
3. **Containment** — isolate, prevent spread
4. **Eradication** — remove root cause
5. **Recovery** — restore service
6. **Post-incident** — postmortem, lessons learned

**IR plan template (3 хуудас хангалттай):**
- On-call rotation (PagerDuty / Opsgenie)
- Decision tree (containment authority)
- Communication channels (status page, customer notify SLA — **GDPR: 72 цаг**, PCI 24 цаг bank-руу)
- Postmortem template (timeline, root cause, action items)
- Tabletop exercise — улирал тутамд тааваар орохгүй гэдэг "урт хугацааны халдлагыг хэрхэн тогтооно" гэх мэтийн тест.

### 9.6 Standards mapping

- NIST SP 800-92 (Log Management)
- NIST SP 800-61r2 (Incident Handling)
- NIST CSF 2.0 Detect / Respond / Recover
- ISO 27001:2022 A.5.24-A.5.30

---

## 10. Privacy & compliance

### 10.1 Privacy by design (GDPR Art. 25)

- **Data minimization** — Зөвхөн хэрэгтэй өгөгдлийг л цуглуулна.
- **Purpose limitation** — Цуглуулсан зорилгоосоо гадуур ашиглахгүй.
- **Storage limitation** — Тогтоосон хугацааны дараа устгана (DSR — data subject request).
- **Right to be forgotten** — Хэрэглэгч request хийсэн үед хийгдэх pipeline-тай байх.
- **Data Protection Impact Assessment (DPIA)** — Шинэ feature нь PII боловсруулж байвал.

### 10.2 Compliance landscape

| Регулир | Хэнд | Энэ template-д |
|---|---|---|
| **GDPR** (EU) | EU хэрэглэгчтэй ямар ч app | DSAR (subject access), DPO contact, breach notification 72h |
| **CCPA / CPRA** (California) | $25M+ revenue, 100k+ records | "Do not sell my data" opt-out |
| **PCI DSS 4.0** | Card payments | Card data network тусгаарлагдсан; tokenization preferred |
| **HIPAA** | US health data | BAA contracts, encryption at rest, access logs |
| **SOC 2** | B2B SaaS, enterprise sales | CC1-CC9 controls (security, availability, confidentiality, processing integrity, privacy) |
| **ISO/IEC 27001:2022** | International | 93 controls in Annex A |
| **NIS2** (EU) | Critical infrastructure | EU energy / health / digital infra |
| **LGPD** (Brazil) | Brazil users | Similar to GDPR |
| **PIPEDA / Law 25** (Canada/Quebec) |  |  |
| **Монгол улсын Хувийн мэдээллийг хамгаалах тухай хууль** (2021) | Монгол хэрэглэгчтэй | Зөвшөөрөл, дамжуулалт, мэдэгдэх 72 цаг |

### 10.3 Data classification

| Class | Жишээ | Хадгалалт |
|---|---|---|
| Public | Marketing copy | Anywhere |
| Internal | Employee phone list | Auth-аар |
| Confidential | Customer data | Encrypted, access log |
| Restricted | Payment data, health data | KMS, tokenized, audit log |

Schema-д column-уудаа classify хий — `pgaudit` дээр rule бичихэд хэрэгтэй.

### 10.4 Cross-border transfer

EU → US: **EU-US Data Privacy Framework** (2023-аас, Schrems II дараах). Standard Contractual Clauses (SCCs) бэлэн зурсан байх.

### 10.5 Standards mapping

- ISO/IEC 27701 (Privacy Information Management)
- NIST Privacy Framework
- OWASP Privacy Risks Top 10
- ENISA Privacy and Data Protection by Design guidelines

---

## 11. AI/LLM security

LLM-тэй интеграц байвал. **OWASP Top 10 for LLM Applications (2023)**:

| LLM# | Заалт | Энэ template-д |
|---|---|---|
| LLM01 Prompt Injection | User input нь system prompt-ыг хүчингүй болгох | Input sanitization, separated message channels |
| LLM02 Insecure Output Handling | LLM-аас гарсан HTML/SQL/код шалгалгүй ажиллуулах | Output validation, sandboxing |
| LLM03 Training Data Poisoning | Fine-tune data adversarial | Sandboxed training, provenance |
| LLM04 Model DoS | Token bomb | Rate limit, token budget |
| LLM05 Supply Chain | Model file integrity | Sigstore for model artifacts |
| LLM06 Sensitive Information Disclosure | Model хууль ёсны output-аар PII leak | Differential privacy, PII detection guardrail |
| LLM07 Insecure Plugin Design | Plugin → arbitrary code | Plugin allow-list, sandbox |
| LLM08 Excessive Agency | LLM-д хэт их execute эрх | Human-in-the-loop, scoped tools |
| LLM09 Overreliance | LLM-аас output-ыг шалгахгүй итгэх | UX disclaimers, validation |
| LLM10 Model Theft | Weights хулгай | Access control, watermarking |

**Энэ template-д LLM байхгүй.** Хэрэв сүүлд нэмэгдэх бол:
- Prompt-ыг **structured JSON** хэлбэрээр илгээнэ — string concatenation биш.
- User input-ийг **delimiter-ээр isolate** (`<user_input>...</user_input>`).
- LLM-ийн tool call-уудыг **тусдаа API role**-оор гүйцэтгэнэ — auth-tenancy enforcement үргэлжилнэ.

---

## 12. Security testing

| Type | Хэрэгсэл | CI-д |
|---|---|---|
| **SAST** | `gosec`, `semgrep`, **CodeQL** (free for public repos), Snyk Code | Pre-merge |
| **DAST** | OWASP ZAP, Burp Suite, **StackHawk** | Nightly / staging |
| **SCA** (deps) | `govulncheck`, Dependabot, Snyk, Socket | Every PR |
| **Container** | `trivy`, `grype`, Snyk Container | Every build |
| **Secrets** | `gitleaks`, `trufflehog`, GitHub secret scanning | Pre-commit + push protection |
| **IaC** | `checkov`, `tfsec`, `kics` | Every PR |
| **License** | `fossa`, `oss-review-toolkit` | Quarterly |
| **Fuzz** | Go 1.18+ `go test -fuzz=` | Library-уудад |
| **Mutation** | `gremlins.dev` | Coverage хэмжих хуурмагаас сэргийлэх |
| **Browser** | Mozilla Observatory, securityheaders.com | Quarterly |

**Pentest:**
- Production launch-аас өмнө 3rd-party penetration test.
- Жилд 1 удаа давтах.
- **Bug bounty** (HackerOne / Bugcrowd / Intigriti) — public scope тодорхой бичсэн.

**Red team / Purple team:**
- Жилд 1-2 удаа.
- MITRE ATT&CK TTPs-аар playbook.
- Blue team detection-ийг үнэлнэ.

### 12.1 Standards mapping

- OWASP Testing Guide (OTGv5)
- NIST SP 800-115 (Technical Guide to Information Security Testing)
- PTES (Penetration Testing Execution Standard)

---

## 13. Cryptography

**Алтан дүрэм: "Don't roll your own crypto."** Стандарт library л ашигла.

### 13.1 Алгоритмын зөвлөмж (NIST SP 800-131A r2 + OWASP 2024)

| Зорилго | ✅ Зөв | ❌ Outdated |
|---|---|---|
| Password hashing | Argon2id, bcrypt (cost 10+), scrypt | MD5, SHA-256 шууд, SHA-1 |
| Symmetric encryption | **AES-256-GCM**, **ChaCha20-Poly1305** | AES-CBC (padding oracle), DES, 3DES, RC4 |
| Hash | SHA-256, SHA-3, BLAKE2 | MD5, SHA-1 |
| HMAC | HMAC-SHA-256 |  |
| Asymmetric | **Ed25519** (signing), **X25519** (KEX), **ECDSA P-256+** | RSA <2048, DSA |
| KDF | HKDF-SHA-256, scrypt | PBKDF1 |
| TLS | TLS 1.3 (default), 1.2 fallback | TLS 1.0/1.1, SSL all |

### 13.2 Random

```go
import "crypto/rand"  // ✅
import "math/rand"    // ❌ ХЭЗЭЭ Ч nууцыг!
```

Token / nonce / salt — заавал `crypto/rand`.

### 13.3 Post-quantum readiness

**2024 оны 8-р сард NIST PQC** стандарт finalize боллоо:
- **ML-KEM** (FIPS 203) — key encapsulation
- **ML-DSA** (FIPS 204) — digital signature
- **SLH-DSA** (FIPS 205) — hash-based signature

**Hybrid TLS** (Cloudflare X25519+Kyber768) production-д аль хэдийн орж байна. Long-lived signing key-уудаа PQC-руу 2030 хүртэл шилжих план зохиогтун ("harvest now, decrypt later" халдлагаас сэрэмжил).

### 13.4 Key management lifecycle (NIST SP 800-57)

- **Generation:** HSM эсвэл cloud KMS дотор.
- **Distribution:** TLS-аар л.
- **Storage:** Plain files-д ХЭЗЭЭ Ч; tmpfs мөн дургүй (memory dump).
- **Rotation:** schedule + on-incident.
- **Destruction:** crypto-shredding (key delete = data unrecoverable).

### 13.5 Standards mapping

- NIST FIPS 140-3 (Cryptographic Module Validation)
- NIST SP 800-57, 800-131A
- OWASP Cryptographic Storage Cheat Sheet

---

## 14. Roadmap — OWASP ASVS Level-аар хэмжсэн

Stage бүрд "Done" гэдэг тодорхой ASVS заалттай:

### Phase 1 — ASVS L1 baseline (бүх app)

- [ ] HTTPS бүх газарт + HSTS preload
- [ ] Argon2id / bcrypt password hashing
- [ ] Parameterized queries (sqlc setup)
- [ ] Secure cookie (HttpOnly + Secure + SameSite=Lax) эсвэл Keychain mobile
- [ ] Security headers (CSP nonce, HSTS, COOP/COEP/CORP, etc.)
- [ ] CORS strict origin list
- [ ] Backend input validation (go-playground/validator)
- [ ] `.gitignore` + `gitleaks` pre-commit
- [ ] Secret manager (минимум cloud KMS)
- [ ] Structured logging (no PII)
- [ ] Container scanning (`trivy`) CI-д
- [ ] `govulncheck` + `npm audit` CI-д
- [ ] **DPIA threshold** check — PII боловсруулж байгаа эсэх

### Phase 2 — ASVS L2 (production SaaS)

- [ ] Rate limiting (login + API per IP+account)
- [ ] **MFA (TOTP)** дэмжлэг
- [ ] Refresh token rotation + reuse detection
- [ ] CSP strict-dynamic + Trusted Types
- [ ] WAF (Cloudflare/AWS WAF) + OWASP CRS
- [ ] Encrypted backup + monthly restore test
- [ ] Centralized logging + alerting (SIEM эсвэл equivalent)
- [ ] SAST + DAST CI (CodeQL + ZAP baseline)
- [ ] **Tenant isolation tests** (cross-tenant 404)
- [ ] Postgres RLS дээр tenant_id
- [ ] SBOM generation per release
- [ ] Image signing (cosign)
- [ ] **Incident Response plan** (3-page document)
- [ ] Privacy Policy + Cookie consent (GDPR-compliant)

### Phase 3 — ASVS L3 / Enterprise (banking, healthcare, government)

- [ ] **WebAuthn / Passkey** support
- [ ] Hardware security keys for admins (YubiKey)
- [ ] **Field-level encryption** for PII (envelope, KMS)
- [ ] Mobile **certificate pinning** + App Attest / Play Integrity
- [ ] Annual external pentest
- [ ] Bug bounty program
- [ ] mTLS internal services
- [ ] Zero-trust network (BeyondCorp / IAP)
- [ ] **SLSA L3** build provenance
- [ ] **SOC 2 Type II** audit
- [ ] **ISO 27001:2022** certification
- [ ] Tabletop / red team exercises (quarterly)
- [ ] Data residency controls (per-region storage)
- [ ] Post-quantum hybrid TLS

---

## 15. Resources

### Standards & frameworks
- **OWASP**: [Top 10](https://owasp.org/Top10), [ASVS v4](https://owasp.org/www-project-application-security-verification-standard/), [API Top 10 2023](https://owasp.org/API-Security/), [MASVS](https://mas.owasp.org), [LLM Top 10](https://genai.owasp.org/), [Cheat Sheet Series](https://cheatsheetseries.owasp.org)
- **NIST**: [CSF 2.0](https://www.nist.gov/cyberframework), [SP 800-63B Digital Identity](https://pages.nist.gov/800-63-3/sp800-63b.html), [SP 800-218 SSDF](https://csrc.nist.gov/Projects/ssdf), [SP 800-207 Zero Trust](https://csrc.nist.gov/publications/detail/sp/800-207/final)
- **CIS Controls v8** — [cisecurity.org](https://www.cisecurity.org/controls)
- **ISO/IEC 27001:2022** — A.5-A.8 control families
- **MITRE ATT&CK** — [attack.mitre.org](https://attack.mitre.org)
- **SLSA** — [slsa.dev](https://slsa.dev)
- **CISA Secure by Design** — [cisa.gov/secure-by-design](https://www.cisa.gov/secure-by-design)

### Tools (free / OSS first)
- SAST: gosec, semgrep, CodeQL
- DAST: OWASP ZAP
- SCA: govulncheck, Dependabot, OSV-Scanner
- Container: trivy, grype, syft, cosign
- Secrets: gitleaks, trufflehog
- IaC: checkov, tfsec, kics
- Pentest framework: Metasploit, Burp Community

### Reading
- "Crafting Interpreters" — Robert Nystrom (input parsing)
- "Web Application Hacker's Handbook" — Stuttard, Pinto
- "Designing Data-Intensive Applications" — Martin Kleppmann
- "The Tangled Web" — Michał Zalewski (browser security)
- "Real-World Cryptography" — David Wong

---

## Алтан зарчмууд

1. **Defense in depth** — Нэг ширхэг хамгаалалт хангалтгүй. WAF + app validation + DB RLS + tenant isolation + audit log — бүгд хамтран.
2. **Least privilege** — Хэрэглэгч, service, DB role — ажилдаа л хэрэгтэй эрхээс илүүг авахгүй.
3. **Fail securely** — Алдаа гарвал систем "нээлттэй" болохгүй, "хаалттай" байх. `default deny`.
4. **Don't roll your own crypto** — NIST/IETF-аар санал болгосон library л ашигла.
5. **Log everything important, log nothing sensitive.** PII redaction at ingestion.
6. **Shift left, ship secure** — Security CI-д шилжүүлж, develop хийгээгүй кодоор гадагшаа явахгүй.
7. **Assume breach** — "Хэрэв чи онилогдсон" гэдэг angle-аас design хий. Lateral movement-ийг ямар хэмжээгээр хязгаарлах вэ?
8. **Security is a process, not a feature** — One-time setup биш. Тогтмол review, шинэчлэлт.

---

> **Уриа:** Хамгийн аюулгүй систем нь огт байхгүй систем. Гэхдээ дээрх дарааллаар алхвал — production-д аль хэдийн зайлсхийгдсэн vulnerability ангилалуудаас оруулж болзошгүй risk-ийн **95%+** хаагдана. Үлдсэн 5%-ийг ил гаргахын тулд threat model тогтмол update, pentest, monitoring дамжуулаад үргэлжлэн ажилла.
