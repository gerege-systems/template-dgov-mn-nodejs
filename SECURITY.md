# Security Policy · Аюулгүй байдлын бодлого

## Reporting a vulnerability · Эмзэг байдлыг мэдээлэх

**Please do NOT open a public issue for security vulnerabilities.**
**Аюулгүй байдлын эмзэг байдлыг олон нийтийн issue-гээр бүү нээнэ үү.**

Instead, report privately via one of:
- GitHub **Private vulnerability reporting** — the *Security* tab → *Report a vulnerability*.
- Or email the maintainers (Gerege Systems Development Team).

Please include: affected component (`backend`/`frontend`), version/commit, a
description, reproduction steps, and impact. We aim to acknowledge within
**72 hours** and to provide a remediation timeline after triage.

Та дараахыг хавсаргана уу: хамаарах хэсэг (`backend`/`frontend`), хувилбар/commit,
тайлбар, давтах алхмууд, нөлөө. Бид **72 цагийн** дотор хүлээн авсныг мэдэгдэхийг
зорино.

## Supported versions · Дэмжигдэх хувилбар

| Version | Supported |
|---------|-----------|
| `main` (latest) | ✅ |
| older tags | ❌ |

## Scope · Хамрах хүрээ

In scope: code in `backend/` and `frontend/`. Out of scope: third-party
dependencies (report upstream), and deployment/infrastructure you operate.

## Our security posture · Бидний аюулгүй байдлын байдал

This template is hardened against the OWASP ASVS / API Top 10 and NIST 800-63B
baselines — see **[backend/docs/SECURITY.md](backend/docs/SECURITY.md)** for the
implemented controls, the ASVS roadmap, and known gaps. Operators are still
responsible for production hardening (TLS, secrets management, least-privilege
DB roles, WAF, monitoring).

## Disclosure · Ил болгох

We follow coordinated disclosure: we will work with you on a fix and credit you
(if you wish) once a patch is released.

---

**Government Template Platform V3.0** — Co-developed by the Gerege Systems
Development Team and Claude AI, 2026.
