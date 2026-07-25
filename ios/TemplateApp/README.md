# Government Template Platform V3.0 — iOS App (TemplateApp)

> **Цахим засаглалыг бүтээх суурь** — _Нэг суурь — бүх төрийн үйлчилгээ._

**Government Template Platform V3.0**-ийн жишиг **iOS клиент**. eID эсвэл dgov
SSO-гоор нэвтэрч, хэрэглэгчийн профайл + eID PKI мэдээллийг харуулна — суурь
платформ дээр бүтээгдсэн native мобайл үйлчилгээг хэрхэн босгохын үлгэр жишээ.
Native SwiftUI, гуравдагч хамааралгүй (SPM пакеж ашигладаггүй).

> Тайлбар: энэ бол **Relying-Party консюмер** апп — иргэний eID **апп** (өөр төсөл)
> биш. eID нэвтрэлтийг QR/РД-push урсгалаар платформын backend-ээр дамжуулж хийнэ.
> Жишиг deployment нь **DAN-Government SSO** ([sso.dgov.mn](https://sso.dgov.mn)).

## Архитектур

- Апп → `https://sso.dgov.mn/api/*` (BFF) — backend-тэй шууд харьцахгүй.
- Session нь httpOnly cookie (`dgov_access`/`refresh`)-д. `URLSession` +
  `HTTPCookieStorage.shared` нь cookie-г автоматаар хадгалж/илгээнэ.
- BFF-ийн mutating route `x-dgov-csrf: 1` header шаарддаг (Origin header
  байхгүй тул энэ л хангалттай). Токен клиент рүү хэзээ ч гарахгүй.

### Нэвтрэлт
- **eID** — `POST /api/auth/eid/start` (QR) эсвэл `/start-id` (РД→push) →
  `/api/auth/eid/poll` ~2.5с тутам → `COMPLETE` болоход cookie суулгана.
- **dgov SSO** — `WKWebView`-д `/api/auth/sso/start` ачаалж, sso.dgov.mn дээр
  баталгаажуулна. `/me*` руу буцахад WKWebView-ийн cookie-г `HTTPCookieStorage`
  руу хуулж, `URLSession`-д ашиглана.
- **Профайл** — `GET /api/me` + `GET /api/me/eid/summary`.

## Бүтэц

```
ios/TemplateApp/
  project.yml              # xcodegen (bundle id: mn.gerege.template)
  Sources/
    TemplateAppApp.swift   # @main + AppState + RootView
    APIClient.swift        # BFF client (cookie session, CSRF header)
    Models.swift           # Codable — MeUser, EidStart, EidSummary…
    LoginView.swift        # eID / SSO сонголт
    EIDLoginView.swift     # РД/QR + poll (+ CoreImage QR)
    SSOWebLoginView.swift  # WKWebView SSO + cookie sync
    HomeView.swift         # профайл + eID PKI + гарах
```

## Build

Шаардлага: **Xcode 15+**, [xcodegen](https://github.com/yonaskolb/XcodeGen)
(`brew install xcodegen`).

```bash
cd ios/TemplateApp
xcodegen generate          # project.yml → TemplateApp.xcodeproj
open TemplateApp.xcodeproj
```

Xcode дотор:
1. Target **TemplateApp** → Signing & Capabilities → өөрийн **Team**-ээ сонго.
   Bundle id аль хэдийн `mn.gerege.template`.
2. Run (⌘R) — Simulator эсвэл төхөөрөмж дээр.

`.xcodeproj` нь generated тул git-д ороодоггүй (`.gitignore`-ыг хар) — эх сурвалж
нь зөвхөн `project.yml` + `Sources/`.

## Тохиргоо

- Backend хаяг: `APIClient.baseURL` (default `https://sso.dgov.mn`).
  Локал BFF-д туршихад `http://localhost:3000` болгож, ATS exception нэмнэ.
