# Архитектур

Платформ нь **Clean Architecture** зарчмаар бүтээгдсэн: `handler → usecase →
repository → domain`. Business core нь web framework-ийг import хийдэггүй.

## Бүрэлдэхүүн

```
Internet ──► nginx (TLS)
   │
   ├─ /oauth2/*, /.well-known/*, /userinfo ─► Go API — өөрийн OIDC issuer
   ├─ /rp/sign/*   ─► eID sign relay (backend)
   ├─ /rp/eid/*     ─► eID service proxy — хувь хүн (backend)
   ├─ /rp/eid-org/* ─► eID service proxy — байгууллага (backend)
   └─ бусад бүх       ─► Next.js BFF (web) ──► backend API (:8080)
                                                   │
   internal network:  db (PostgreSQL) · redis
```

## Давхаргууд

| Давхарга | Технологи | Тайлбар |
|---|---|---|
| **Backend** | Go · chi (net/http) · pgx (ORM-гүй) | Clean Architecture, RLS, hand-written SQL |
| **Frontend** | Next.js 15 (BFF) | Браузер зөвхөн ижил-origin route-той харилцана; токен client JS-д гардаггүй |
| **OIDC provider** | Өөрийн Go код (usecases/oidc) | login/consent/logout урсгалыг платформ өөрөө жолоодоно |
| **Identity** | eID Mongolia RP | Цахим үнэмлэхээр баталгаажуулалт |
| **Cache/queue** | Redis | session deny-list, transient state |
| **AI** | Gemini (SDK-гүй REST) | чат, дуу хоолой, орчуулга |

## Аюулгүй байдал

- **Row-Level Security (RLS)** — хэрэглэгч бүр зөвхөн өөрийн мөрийг хардаг; boot-үеийн
  мөрдөлтийн guard (production-д non-superuser role шаардана).
- **BFF загвар** — токен httpOnly cookie-д, браузерийн JS-д хэзээ ч гардаггүй.
- **Давхар CSRF** — custom header + origin шалгалт.
- **Security headers** — CSP, HSTS, COOP/COEP/CORP; per-IP rate limiting.
- **Аудит** — hash-chain холбоост, зөвхөн-нэмэх бүртгэл.

## Backend бүтэц (тойм)

```
backend/
├── cmd/api/server/        # manual DI wiring (server.go)
├── internal/
│   ├── business/
│   │   ├── domain/         # цэвэр домэйн (import-гүй)
│   │   └── usecases/       # бизнес логик (interface-д хамааралтай)
│   ├── datasources/
│   │   ├── repositories/   # pgx adapter + interface
│   │   └── caches/         # redis
│   └── http/
│       ├── handlers/       # func(w,r) error, v1.Wrap
│       ├── middlewares/    # auth, oauth-bearer, rate-limit, ...
│       └── routes/         # route группировка
├── pkg/                    # eid, oidc, secrethash, gemini, ...
└── migrations/             # numbered SQL (N_name.up/down.sql)
```
