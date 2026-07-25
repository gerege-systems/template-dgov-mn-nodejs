# eID Mongolia — RP-facing endpoint нэмэх хүсэлт

> ✅ **БИЕЛСЭН · ТҮҮХЭН БАРИМТ (2026-07-17).** Энэ баримтад хүссэн RP-facing
> endpoint-ууд upstream eID платформд хэрэгжиж, RP тал дээр аль хэдийн
> ашиглагдаж байна. Live client дуудлагууд `backend/pkg/eid/eid_pki.go`-д
> (`PersonSummary`, `PersonCertificates`, `PersonDevices`, `PersonActivity`)
> болон байгууллага нэмэх/хасах (`AddRepresentation`/`RemoveRepresentation`,
> `backend/pkg/eid/eid.go`) байрлана; RP API дээр
> `/api/v1/users/me/eid/{summary,certificates,devices,activity,organizations}`
> хэлбэрээр гарсан. Баримтыг **түүхэн бүртгэл** болгон хадгалав — доорх хэсэг
> бүрт биелсэн статусыг тэмдэглэв.

> Хүсэгч: **sso.dgov.mn** (RP UUID `c4f371c3-20bd-462e-8d97-5bc4a20fde08`)
> Хүлээн авагч: **eID Mongolia platform** (`gerege-systems/eid-platform-mn`)
> Огноо: 2026-07-04 · API суурь: `https://eidmongolia.mn/v3`

## Зорилго

RP (Relying Party) талд иргэний баялаг **хяналтын самбар** босгохыг зорьж байна:
гэрчилгээний тоо (хүчинтэй/хүчингүй), нэвтрэлт/гарын үсгийн түүх ба тоо, холбоотой
төхөөрөмжүүд, төлөөлдөг байгууллага, e-Seal. Зарим өгөгдөл одоо байгаа RP
endpoint-оор бэлэн; зарим нь **шинэ RP-facing endpoint шаардана**. Энэ баримт нь
одоо байгаа боломжийг тэмдэглэж, дутуу endpoint-уудыг тодорхой request хэлбэрээр
дэвшүүлнэ.

Бүх санал болгож буй endpoint нь v3-ийн адил `Authorization: Bearer <rp_sk_…>` +
`relyingPartyUUID/Name` танилтыг ашиглана гэж үзсэн.

---

## A. Одоо байгаа боломжууд (RP Bearer-ээр ажилладаг — шалгагдсан)

| Боломж | Endpoint | Хариу |
|--------|----------|-------|
| Нэвтрэх үеийн гэрчилгээ + identity | session `COMPLETE` дахь `person` + `cert.value` (DER) | civil_id, нэр, cert level, X.509 |
| Төлөөлдөг байгууллагууд | `GET /v3/organization/representations/etsi/{personEtsi}` | `RepresentationsResponse{ representations[] }` |
| Байгууллагын e-Seal гэрчилгээ | `GET /v3/seal/certificate/{orgEtsi}` | `SealCertificateResponse` (serial, subjectDn, notBefore/After, level) |
| e-Seal гаргалт / тамгалалт | `POST /v3/seal/certificate/{orgEtsi}`, `POST /v3/seal/{orgEtsi}` | `SEAL` permission шаардана |
| Тодорхой төхөөрөмж идэвхтэй эсэх | `GET /v3/device-status` (`X-Device-Token`) | зөвхөн дуудагчийн ӨӨРИЙН төхөөрөмж |

→ **Эдгээрийг RP одоо шууд ашиглаж болно** (жишээ нь "Төлөөлдөг байгууллага"
хэсгийг representations-аар босгоно).

---

## B. Шинээр хүсэж буй RP-facing endpoint-ууд

### 1. Гэрчилгээний жагсаалт / тоо — `GET /v3/certificates/etsi/{personEtsi}`

**Статус: ✅ БИЕЛСЭН** — `PersonCertificates` (`backend/pkg/eid/eid_pki.go`) →
`GET /api/v1/users/me/eid/certificates`.

**Яагаад:** Profile дээр "хүчинтэй N, хүчингүй M, нийт K гэрчилгээ" ба гэрчилгээний
жагсаалт харуулах. Одоо RP зөвхөн нэвтрэх үеийн НЭГ гэрчилгээг л хардаг.

**Санал болгож буй хариу:**
```json
{
  "personEtsi": "PNOMN-...",
  "certificates": [
    {
      "documentNumber": "…",
      "type": "AUTH | SIGN | SEAL",
      "serialNumber": "…",
      "certificateLevel": "ADVANCED | QUALIFIED | QSCD",
      "status": "VALID | REVOKED | EXPIRED | SUSPENDED",
      "notBefore": "RFC3339",
      "notAfter": "RFC3339",
      "issuerDn": "…"
    }
  ]
}
```
**Нууцлал:** иргэний PII тул — (a) зөвхөн саяхны амжилттай auth session-ий id-аар
gated, эсвэл (b) RP-д тусгай `CERTIFICATES_READ` permission олгосон үед. RP-scoped
хувилбар (тухайн RP-тэй холбоотой гэрчилгээ) илүү тохиромжтой.

### 2. Үйл ажиллагааны түүх / тоо (RP-scoped) — `GET /v3/rp/activity/etsi/{personEtsi}`

**Статус: ✅ БИЕЛСЭН** — `PersonActivity` (`backend/pkg/eid/eid_pki.go`) →
`GET /api/v1/users/me/eid/activity`.

**Яагаад:** Хяналтын самбар/Аюулгүй байдал дээр "нэвтрэлт: N, гарын үсэг: M" тоолуур
ба сүүлийн session-уудыг харуулах.

**Query:** `?flow=AUTHENTICATION|SIGNATURE&limit=20&offset=0`
**Санал болгож буй хариу:**
```json
{
  "personEtsi": "PNOMN-...",
  "counts": { "authentication": 42, "signature": 7 },
  "sessions": [
    { "sessionId": "…", "flow": "AUTHENTICATION", "outcome": "OK", "timestamp": "RFC3339" }
  ]
}
```
**Тэмдэглэл:** `GET /v3/mobile/activity/{documentNumber}` аль хэдийн байгаа ч
**зөвхөн утасны апп-д** (App Attest + `X-Device-Token`) нээлттэй, мөн ГЛОБАЛ
(бүх RP). RP-д нээх бол **зөвхөн тухайн RP-ийн session-уудыг** буцаах RP-scoped,
RP-Bearer хувилбар хэрэгтэй (бусад RP-ийн мэдээлэл алдагдуулахгүй).

### 3. Холбоотой төхөөрөмжүүд — `GET /v3/devices/etsi/{personEtsi}`

**Статус: ✅ БИЕЛСЭН** — `PersonDevices` (`backend/pkg/eid/eid_pki.go`) →
`GET /api/v1/users/me/eid/devices`.

**Яагаад:** Аюулгүй байдал хэсэгт иргэний бүртгэлтэй идэвхтэй төхөөрөмжүүдийг
жагсаах ("Linked devices").

**Санал болгож буй хариу:**
```json
{
  "personEtsi": "PNOMN-...",
  "devices": [
    { "documentNumber": "…", "platform": "iOS | Android", "model": "…",
      "enrolledAt": "RFC3339", "lastSeenAt": "RFC3339", "active": true }
  ]
}
```
**Тэмдэглэл:** `/v3/device-status` нь зөвхөн дуудагчийн ӨӨРИЙН нэг төхөөрөмжийг
`X-Device-Token`-оор шалгадаг — иргэний бүх төхөөрөмжийг RP-д жагсаах арга алга.

### 4. (Сонголт) Байгууллага бүртгэх / холбох RP урсгал

**Статус: ✅ БИЕЛСЭН** — `AddRepresentation`/`RemoveRepresentation`
(`backend/pkg/eid/eid.go`) → `GET/POST/DELETE /api/v1/users/me/eid/organizations`.

**Яагаад:** Иргэн өөрийн төлөөлдөг байгууллагаа RP дотроос бүртгэх/холбох. Одоо
энэ нь зөвхөн **admin** (`POST /v3/admin/organizations` + `/representatives`).
**Хүсэлт:** зөвшөөрөл дээр суурилсан RP-facing урсгал нээх, эсвэл RP-аас
байгууллага бүртгүүлэх зөвлөмж бүхий процессыг баримтжуулах.

---

## C. Хөндлөн шаардлагууд (бүх шинэ endpoint-д)

- **Нууцлал/зөвшөөрлийн загвар:** endpoint бүр RP-scoped уу, эсвэл fresh auth
  session-аар gated юу, эсвэл тусгай RP permission (`SEAL` шиг) шаардах уу гэдгээ
  тодорхой заах. Бид RP-scoped + тодорхой permission олголтыг илүүд үзнэ.
- **Танилт:** v3-ийн адил `Authorization: Bearer <rp_sk_…>` + `relyingPartyUUID`.
- **Хуудаслалт:** activity/certificates-д `limit`/`offset` эсвэл cursor.
- **Well-known:** шинэ endpoint-уудыг `.well-known/eid`-ийн `endpoints` map-д нэмэх.
- **ETSI танигч:** person-д `PNOMN-<civilId>`, org-д `NTRMN-<register>` (одоогийн
  конвенцтэй нийцүүлэн).

---

## D. Хамаарал (RP тал дээр аль хэдийн бэлэн)

sso.dgov.mn нь дээрх өгөгдлийг хүлээн авмагц харуулах бэлэн:
Profile дээр eID identity + гэрчилгээ (хэрэгжсэн), цаашид гэрчилгээний тоо,
auth/sign тоолуур, холбоотой төхөөрөмж, байгууллагын секцүүд. Endpoint нээгдэх
тусам бид өөрийн `pkg/eid` client-д нэмж, хуудсуудыг баяжуулна.
