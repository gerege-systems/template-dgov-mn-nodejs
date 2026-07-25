# Government Template Platform V3.0

> **Цахим засаглалыг бүтээх суурь** — төрийн аливаа цахим үйлчилгээг дээр нь
> босгох, үйлдвэрлэлд бэлэн, аюулгүй байдлаар хатуужуулсан бүрэн стек.

**Government Template Platform V3.0** нь цахим засаглалыг бүтээх *суурь* юм. Та дэд
бүтцийг бус, үнэ цэнийг л бүтээнэ — identity, аюулгүй байдал, AI, үйлчилгээний
тулгуур эхний өдрөөс шийдэгдсэн ирнэ.

!!! tip "Нээлттэй эх (Open Source)"
    Энэхүү платформ бол **нээлттэй эх** төсөл — эх кодыг бүрэн эхээр нь үзэж,
    fork хийж, өөрийн байгууллагадаа ашиглаж болно.
    :material-github: [GitHub дээр үзэх](https://github.com/gerege-systems/template-dgov-mn-nodejs)

!!! info "Энэ бол **Node.js хэвлэл**"
    Энэхүү баримт нь платформын **Node.js + React** хэвлэлийг тайлбарлана
    ([node.template.dgov.mn](https://node.template.dgov.mn)). Анхны **Go + Next.js**
    хувилбар нь [template.dgov.mn](https://template.dgov.mn) дээр production-д
    ажилласаар байгаа ба түүний баримт
    [тэндээ](https://template.dgov.mn/docs/) байрлана.

    Хоёр хэвлэл нь **HTTP гэрээ · SQL схем · аюулгүй байдлын зан төлөв** гурвыг
    1:1 хуваалцана — клиент болон өгөгдлийн сан хөндөгдөхгүйгээр сольж болно.

<div class="grid cards" markdown>

- :material-shield-key: **eID + Government SSO**  
  Цахим үнэмлэх (eID)-т суурилсан нэвтрэлт + OpenID Connect (өөрийн провайдер —
  гуравдагч талын Hydra/Keycloak ХЭРЭГГҮЙ). Апп-ууд нэг товшилтоор холбогдоно.

- :material-layers: **Цэвэр архитектур**  
  Node.js (Express 5 · TypeScript · `pg`, ORM-гүй) backend + Vite · React SPA
  frontend. Давхаргууд тод ялгаатай, өргөтгөхөд бэлэн.

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
| **template.dgov.mn** | Жишээ апп (Go · Next.js хэвлэл) — Government SSO-ий relying party |
| **node.template.dgov.mn** | Ижил апп-ын **Node.js · React** хэвлэл — энэ баримтын сэдэв |

Апп-ууд (`template.dgov.mn` гэх мэт) **sso.dgov.mn**-ээр дамжин нэвтэрч, зөвшөөрөгдсөн
eID service-үүдийг proxy-оор дуудна. eID Mongolia-тай харилцах RP креденшлийг зөвхөн
SSO эзэмшдэг тул апп-ууд аюулгүй байдлын ачааллаас чөлөөлөгддөг.

## Гол чадварууд

- **Нэвтрэлт** — eID (QR / App2App / РД push) + Google холболт + Government SSO (OIDC).
- **OIDC провайдер** — платформын өөрийн код дээр суурилсан (`usecases/oidc`);
  апп-ууд `Sign in with Government SSO`.
- **eID PKI профайл** — байгууллага, гэрчилгээ, төхөөрөмж, идэвх.
- **Цахим гарын үсэг (PAdES)** — eID sign relay-ээр 3 дагч апп-ууд гарын үсэг зурна.
- **eID Service Proxy** — хувь хүн (`eid-proxy`) ба байгууллага (`eid-org-proxy`) тусад нь.
- **API Gateway** — service catalog, per-app зөвшөөрөл, хүсэлтийн телеметр.
- **AI туслах (Gemini)** — чат, дуу хоолой, орчуулга.
- **RBAC & super admin**, **аудит бүртгэл**, **аюулгүй байдлын хатуужуулалт** (RLS, CSP, HSTS, CSRF).

!!! tip "Хаанаас эхлэх вэ?"
    Апп-аа Government SSO-д холбохыг хүсвэл [Апп холбох](sso-integration.md)-ыг үзнэ үү.
    eID мэдээллийг proxy-оор авахыг хүсвэл [eID Service Proxy](eid-services.md).
