# eID Service Proxy

Бүртгэгдсэн апп-ууд **Government SSO**-ий eID service-үүдийг хэрэглэгчийнхээ өмнөөс
**proxy**-оор дуудна. SSO нь token-ий subject-ээр хэрэглэгчийг тогтоож, **өөрийн**
eidmongolia.mn RP креденшлээр өгөгдлийг татаж өгдөг тул апп-д eID credential эзэмших
шаардлагагүй.

## Хоёр service

| Service | Public зам | Endpoint-ууд |
|---|---|---|
| **`eid-proxy`** (хувь хүн) | `https://sso.dgov.mn/rp/eid/*` | `summary` · `certificates` · `devices` · `activity` |
| **`eid-org-proxy`** (байгууллага) | `https://sso.dgov.mn/rp/eid-org/*` | `organizations` · `organizations/{regNo}/signers` |

Бүгд **ЗӨВХӨН унших** (GET). Хувь хүн ба байгууллагын service тусад нь бүлэглэгдсэн
тул admin-аас бие даан удирдана.

## Дуудлага

```bash
GET https://sso.dgov.mn/rp/eid/summary
Authorization: Bearer <хэрэглэгчийн SSO access token>
```

Хариу нь тухайн хэрэглэгчийн eID мэдээлэл (SSO-ий RP креденшлээр татсан).

## Зөвшөөрөл (authorization)

App нь тухайн service-т **олгогдсон** байх ёстой. Олголт нь client-ийн OAuth2 allowed
scope дахь **service scope** (`svc:eid-proxy` / `svc:eid-org-proxy`)-ээр
илэрхийлэгдэнэ — Admin-аас апп-д service олгоход энэ scope нэмэгдэнэ.

Хүсэлт бүрт SSO нь:

1. Token-ыг өөрийн introspection (RFC 7662)-оор шалгана → `active` + `sub`.
2. Token-ий `client_id`-ээр client-ийг татаж, тухайн service scope олгогдсон эсэхийг
   шалгана (**одоогийн** олголтыг шалгадаг тул олгох/цуцлах шууд хүчинтэй).
3. `sub`-ээр хэрэглэгчийг тогтоож, eID Mongolia-аас өгөгдлийг татна.

| Нөхцөл | Хариу |
|---|---|
| Token байхгүй / хугацаа дууссан | `401` |
| App-д service олгогдоогүй | `403` |
| Gateway-д service disabled | `503` |
| Амжилттай | `200` + өгөгдөл |

!!! tip "Олголтыг хэрхэн хийх вэ?"
    Admin → Applications → тухайн апп → **eid-proxy** / **eid-org-proxy** checkbox
    тэмдэглэ → Хадгалах. Тэмдэглээгүй апп 403 авна. Дэлгэрэнгүйг
    [API Gateway](api-gateway.md)-аас үз.

## Runtime toggle

Хоёр service тус бүр **API gateway catalog**-д бүртгэгдсэн бөгөөд admin gateway
UI-аас **enable/disable** хийхэд route бодитоор нөлөөлнө (disabled → `503`).
Хувь хүний eID-г унтраасан ч байгууллагын eID ажилласаар байх боломжтой (бие даасан).
