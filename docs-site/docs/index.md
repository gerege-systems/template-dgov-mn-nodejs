# Government Template Platform V3.0

> **Цахим засаглалыг бүтээх суурь** — төрийн аливаа цахим үйлчилгээг дээр нь
> босгох, үйлдвэрлэлд бэлэн, аюулгүй байдлаар хатуужуулсан бүрэн стек.

**Government Template Platform V3.0** нь цахим засаглалыг бүтээх *суурь* юм. Та дэд
бүтцийг бус, үнэ цэнийг л бүтээнэ — identity, аюулгүй байдал, AI, үйлчилгээний
тулгуур эхний өдрөөс шийдэгдсэн ирнэ.

!!! tip "Нээлттэй эх (Open Source)"
    Энэхүү платформ бол **нээлттэй эх** төсөл — эх кодыг бүрэн эхээр нь үзэж,
    fork хийж, өөрийн байгууллагадаа ашиглаж болно.
    :material-github: [GitHub дээр үзэх](https://github.com/gerege-systems/template-dgov-mn)

<div class="grid cards" markdown>

- :material-shield-key: **eID + Government SSO**  
  Цахим үнэмлэх (eID)-т суурилсан нэвтрэлт + OpenID Connect (өөрийн Go provider)
  SSO провайдер. Апп-ууд нэг товшилтоор холбогдоно.

- :material-layers: **Цэвэр архитектур**  
  Go (chi · net/http · pgx, ORM-гүй) backend + Next.js 15 BFF frontend. Давхаргууд
  тод ялгаатай, өргөтгөхөд бэлэн.

- :material-account-network: **eID Service Proxy**  
  Бүртгэгдсэн апп-ууд SSO-ий eID service-үүдийг зөвшөөрлөөр (proxy) дуудна — өөрсдөө
  eID креденшл эзэмших шаардлагагүй.

- :material-tune: **Admin-аас удирдах API Gateway**  
  Service catalog, per-app зөвшөөрөл, телеметр — бүгд admin системээс.

</div>

## Экосистем

Энэхүү платформ нь хэд хэдэн бие даасан үйлчилгээнээс бүрдэнэ:

| Домэйн | Үүрэг |
|---|---|
| **sso.dgov.mn** | Government SSO — OIDC провайдер + eID Relying Party (eID креденшл эзэмшдэг) |
| **template.dgov.mn** | Жишээ апп — Government SSO-ий relying party (SSO-оор нэвтэрдэг) |

Апп-ууд (`template.dgov.mn` гэх мэт) **sso.dgov.mn**-ээр дамжин нэвтэрч, зөвшөөрөгдсөн
eID service-үүдийг proxy-оор дуудна. eID Mongolia-тай харилцах RP креденшлийг зөвхөн
SSO эзэмшдэг тул апп-ууд аюулгүй байдлын ачааллаас чөлөөлөгддөг.

## Гол чадварууд

- **Нэвтрэлт** — eID (QR / App2App / РД push) + Google холболт + Government SSO (OIDC).
- **OIDC провайдер** — өөрийн Go код дээр суурилсан; апп-ууд `Sign in with Government SSO`.
- **eID PKI профайл** — байгууллага, гэрчилгээ, төхөөрөмж, идэвх.
- **Цахим гарын үсэг (PAdES)** — eID sign relay-ээр 3 дагч апп-ууд гарын үсэг зурна.
- **eID Service Proxy** — хувь хүн (`eid-proxy`) ба байгууллага (`eid-org-proxy`) тусад нь.
- **API Gateway** — service catalog, per-app зөвшөөрөл, хүсэлтийн телеметр.
- **AI туслах (Gemini)** — чат, дуу хоолой, орчуулга.
- **RBAC & super admin**, **аудит бүртгэл**, **аюулгүй байдлын хатуужуулалт** (RLS, CSP, HSTS, CSRF).

!!! tip "Хаанаас эхлэх вэ?"
    Апп-аа Government SSO-д холбохыг хүсвэл [Апп холбох](sso-integration.md)-ыг үзнэ үү.
    eID мэдээллийг proxy-оор авахыг хүсвэл [eID Service Proxy](eid-services.md).
