# API Gateway

API Gateway нь **service catalog + телеметр** бөгөөд admin системээс удирдана.
Платформын exposed үйлчилгээ бүр (eID proxy г.м.) catalog-д бүртгэгдэж, апп-уудад
per-app зөвшөөрлөөр олгогдоно.

## Service catalog

| Service | Зам | Төрөл | Зөвшөөрөл |
|---|---|---|---|
| **SSO login** | `/oauth2` | Суурь (built-in) | Бүх апп-д автоматаар |
| **`eid-sign`** | `/rp/sign` | Нэмэлт | Per-app олголт |
| **`eid-proxy`** | `/rp/eid` | Нэмэлт | Per-app олголт |
| **`eid-org-proxy`** | `/rp/eid-org` | Нэмэлт | Per-app олголт |

!!! note "SSO login нь catalog-д байхгүй"
    SSO нэвтрэлт бол **суурь** үйлчилгээ — бүх бүртгэгдсэн апп-д base OIDC scope-оор
    автоматаар үйлчилдэг тул grant/checkbox шаарддаггүй. Тиймээс catalog-д
    grantable service болгож харуулдаггүй.

## Service удирдах (Admin)

**Admin → Gateway → Services** дээр service-үүдийг жагсааж, шинээр үүсгэж,
засварлаж, **enable/disable** хийнэ. Service үүсгэхэд `svc:<name>` scope
автоматаар үүсдэг — ингэснээр апп-д олгож болно.

- **enabled** флаг нь runtime-д нөлөөлнө: eID proxy route нь тухайн service enabled
  эсэхийг шалгаж, disabled бол `503` буцаана.

## Апп-д service олгох

**Admin → Applications → тухайн апп → SERVICES** хэсэгт service-үүдийг checkbox-оор
олгоно. Олгоход тухайн апп-ын OAuth2 client-ийн allowed scope-д `svc:<name>`
нэмэгддэг; цуцлахад хасагдана. Энэ нь **шууд хүчинтэй** — proxy нь client-ийн
одоогийн олголтыг шалгадаг.

```text
App "template.dgov.mn"
  ├─ SSO login .............. автомат (built-in)
  ├─ [x] eid-sign ........... svc:eid-sign
  ├─ [ ] eid-proxy .......... олгогдоогүй → /rp/eid → 403
  └─ [ ] eid-org-proxy ...... олгогдоогүй → /rp/eid-org → 403
```

## Телеметр

Gateway нь `/api` руу ирсэн бодит хүсэлтүүдийг (method, path, status, latency)
бүртгэж, **Admin → Gateway → Overview / Logs** дээр харуулна.

## Шинэ proxy service нэмэх (хөгжүүлэгчид)

Дараах загвараар бусад дотоод service-үүдийг ч gateway-д нэмж, admin-аас удирдаж
болно:

1. `gateway_services`-д seed (migration) — нэр, зам, tag.
2. Route дээр `gatewayUC.ServiceEnabled(name)`-ээр runtime toggle шалгах.
3. OAuth middleware-д `svc:<name>` олголтыг шалгах.
4. nginx-д public зам нэмэх (`/rp/<name>/` → backend).
