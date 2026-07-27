#!/usr/bin/env bash
# Government Template Platform V3.0 — Node.js edition
# Gerege Systems Development Team & Claude AI, 2026
#
# Remote deploy step, run ON the server by the CD workflow (.github/workflows/deploy.yml)
# after the target commit is already checked out. Rebuilds images, restarts the
# compose stack, waits for health, and prunes dangling images. Idempotent — safe
# to re-run by hand: `bash deploy/deploy.sh`.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

# DEPLOY_SERVICES — deploy хийж, health хүлээх compose үйлчилгээнүүд.
#
# `api` ба `web` ХОЁУЛАА: web нь Vite + React SPA-ийн статик build-ийг nginx-ээр
# үйлчилнэ (server талын код байхгүй). Хэрэгтэй бол орчноос дарж бичиж болно.
SERVICES="${DEPLOY_SERVICES:-api web}"

echo "▶ Deploy commit: $(git rev-parse --short HEAD) — $(git log -1 --pretty=%s)"
echo "▶ Services: ${SERVICES}"

# INTEGRATION_ENC_KEY — superadmin MFA-ийн TOTP secret болон integrations OAuth
# token-ийг AES-GCM-ээр шифрлэх түлхүүр. CD workflow нь GitHub secret-ээс энэ
# скриптэд дамжуулна. backend.env-д БАЙХГҮЙ тохиолдолд Л нэг удаа бичнэ
# (idempotent) — нэгэнт тавьсан түлхүүрийг дахин бичихгүй тул хэзээ ч
# өөрчлөгдөхгүй (өөрчилвөл өмнөх шифрлэсэн бүх өгөгдөл эвдэрнэ).
if [ -n "${INTEGRATION_ENC_KEY:-}" ] && ! grep -q '^INTEGRATION_ENC_KEY=' backend.env 2>/dev/null; then
  printf 'INTEGRATION_ENC_KEY=%s\n' "$INTEGRATION_ENC_KEY" >> backend.env
  echo "▶ INTEGRATION_ENC_KEY-г backend.env-д бичлээ (superadmin MFA идэвхжинэ)"
fi

# SSO_CLIENT_ID / SSO_CLIENT_SECRET — Government SSO (sso.dgov.mn) дээр энэ
# апп-ыг RP болгон бүртгүүлэхэд олгогддог эрхийн мэдээлэл. sso.dgov.mn нь
# ДИНАМИК бүртгэл (RFC 7591) дэмждэггүй тул бүртгэлийг тэр талын оператор
# гүйцэтгэнэ; энд зөвхөн үр дүнг суулгана.
#
# INTEGRATION_ENC_KEY-ээс ЯЛГААТАЙ нь: эдгээрийг ДАРЖ бичнэ. Шалтгаан нь client
# secret эргэлддэг (rotate) — GitHub secret-ийг шинэчилмэгц дараагийн deploy
# сервер дээрх утгыг солих ёстой. Шифрлэлтийн түлхүүр шиг "нэг л удаа" биш.
if [ -n "${SSO_CLIENT_ID:-}" ] && [ -n "${SSO_CLIENT_SECRET:-}" ]; then
  tmp_env="$(mktemp)"
  grep -vE '^(SSO_CLIENT_ID|SSO_CLIENT_SECRET)=' backend.env 2>/dev/null > "$tmp_env" || true
  printf 'SSO_CLIENT_ID=%s\n' "$SSO_CLIENT_ID" >> "$tmp_env"
  printf 'SSO_CLIENT_SECRET=%s\n' "$SSO_CLIENT_SECRET" >> "$tmp_env"
  mv "$tmp_env" backend.env
  echo "▶ SSO эрхийн мэдээллийг backend.env-д бичлээ (SSO нэвтрэлт идэвхжинэ)"
fi

# APP_ORIGIN — гуравдагч талын OAuth-ийн redirect_uri үүнээс угсрагдана. Урвуу
# proxy-ийн цаана хүсэлтийн Host нь дотоод хаяг байж болзошгүй ба redirect_uri нь
# провайдерт БҮРТГЭСЭНТЭЙ ЯГ таарах ёстой тул ил тавина. BACKEND.ENV-д байхгүй
# үед Л нэг удаа бичнэ: утгыг OAUTH_ISSUER-ээс авна (мөн л нийтийн origin) —
# тэр ч байхгүй бол алгасна (config нь ALLOWED_ORIGINS-ийн эхнийхээр нөхнө).
if ! grep -q '^APP_ORIGIN=' backend.env 2>/dev/null; then
  issuer="$(grep -E '^OAUTH_ISSUER=' backend.env 2>/dev/null | tail -1 | cut -d= -f2- | tr -d "\"' " || true)"
  if [ -n "$issuer" ]; then
    printf 'APP_ORIGIN=%s\n' "$issuer" >> backend.env
    echo "▶ APP_ORIGIN-г backend.env-д бичлээ: ${issuer}"
  fi
fi

# backend.env нь api контейнерийн distroless nonroot хэрэглэгчид (uid 65532)
# уншигдахуйц байх ёстой — эс бөгөөс config loader EACCES-ээр унана. Хувийн
# хэвээр (600) үлдэнэ.
if [ -f backend.env ]; then
  chown 65532:65532 backend.env 2>/dev/null || true
  chmod 600 backend.env 2>/dev/null || true
fi

# ── Юу ч өөрчлөгдөөгүй бол огт хөдлөхгүй ────────────────────────────────────
# Docker-ийн build нь тогтвортой БИШ: ижил эх кодоос ч build бүрд шинэ image ID
# гардаг тул `up -d` контейнерийг ҮРГЭЛЖ дахин үүсгэж секундын 502 өгдөг.
STAMP=".deployed-sha"
HEAD_SHA="$(git rev-parse HEAD)"
if [ "${FORCE_DEPLOY:-0}" != "1" ] && [ -f "$STAMP" ] && [ "$(cat "$STAMP")" = "$HEAD_SHA" ]; then
  echo "▶ Өөрчлөлт алга (${HEAD_SHA:0:12}) — build/up алгасав, тасалдал үүсгэхгүй."
  echo "  Албадах бол: FORCE_DEPLOY=1 bash deploy/deploy.sh"
  docker compose ps
  exit 0
fi

echo "▶ Building images…"
# shellcheck disable=SC2086 — SERVICES нь зориудаар зайгаар салгасан жагсаалт.
docker compose build ${SERVICES}

echo "▶ Starting stack (migrate re-runs; applied migrations are skipped)…"
# shellcheck disable=SC2086
# Migration нь ТУСДАА алхам — `up -d`-ийн нэг хэсэг БИШ. Шалтгаан: өмнө нь
# `up -d` нь migrate-ыг дахин ажиллуулж, api+web-ийг ҮРГЭЛЖ дахин үүсгэдэг
# байсан — код огт хөндөөгүй commit дээр ч секундын 502 (хэмжигдсэн 07-27).
# Амжилтгүй бол deploy ЭНД зогсоно, api-д хүрэхгүй.
echo "▶ Running migrations…"
docker compose --profile migrate run --rm migrate

docker compose up -d ${SERVICES}

# Wait until the deployed services report healthy (compose healthchecks). ~150s budget.
echo "▶ Waiting for containers to become healthy…"
deadline=$(( $(date +%s) + 150 ))
for svc in ${SERVICES}; do
  cid="$(docker compose ps -q "$svc")"
  if [ -z "$cid" ]; then echo "✖ service '$svc' has no container" >&2; exit 1; fi
  while true; do
    status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$cid" 2>/dev/null || echo unknown)"
    case "$status" in
      healthy|running) echo "  ✓ $svc: $status"; break ;;
      unhealthy|exited|dead) echo "✖ $svc became '$status'" >&2; docker logs --tail 40 "$cid" >&2; exit 1 ;;
    esac
    if [ "$(date +%s)" -ge "$deadline" ]; then
      echo "✖ timeout waiting for $svc (last: $status)" >&2; docker logs --tail 40 "$cid" >&2; exit 1
    fi
    sleep 3
  done
done

# ── nginx: proxy дүрмүүдийг repo-той тааруулна ────────────────────────────────
# Яагаад CD-д вэ: OAuth2/OIDC-ийн замууд (`/oauth2/*`, `/userinfo`,
# `/.well-known/*`) болон SPA-ийн `/` нь /api/v1-ээс ГАДУУР амьдардаг тул шинэ
# endpoint нээгдэх бүрд proxy дүрэм шинэчлэгдэх шаардлагатай.
#
# ⚠️ ДАРААЛАЛ: контейнерууд ЭРҮҮЛ болсны ДАРАА л reload хийнэ — эс бөгөөс
# nginx шинэ upstream руу заагаад контейнер хараахан босоогүй байх хормын
# зуурт 502 гарна.
#
# WEB_PORT нь орчноос (.env) хамаарна: repo дахь тохиргоо өгөгдмөл 3007-г
# агуулах ба энд бодит утгаар солигдоно.
NGINX_SITE="/etc/nginx/sites-available/node.template.dgov.mn"
REPO_SITE="deploy/nginx/node.template.dgov.mn.conf"
if [ "$(id -u)" = "0" ] && command -v nginx >/dev/null 2>&1 && [ -f "$NGINX_SITE" ] && [ -f "$REPO_SITE" ]; then
  web_port="$(grep -E '^WEB_PORT=' .env 2>/dev/null | tail -1 | cut -d= -f2- | tr -d "\"' " || true)"
  web_port="${web_port:-3007}"
  rendered="$(mktemp)"
  sed "s|127\.0\.0\.1:3007|127.0.0.1:${web_port}|g" "$REPO_SITE" > "$rendered"

  if ! cmp -s "$rendered" "$NGINX_SITE"; then
    echo "▶ nginx тохиргоо зөрж байна — шинэчилж байна (web порт: ${web_port})…"
    backup="${NGINX_SITE}.bak.$(date +%s)"
    cp "$NGINX_SITE" "$backup"
    cp "$rendered" "$NGINX_SITE"
    if nginx -t >/dev/null 2>&1; then
      nginx -s reload && echo "  ✓ nginx reload (нөөц: $backup)"
    else
      cp "$backup" "$NGINX_SITE"
      echo "✖ nginx -t унасан тул хуучин тохиргоог эргүүлэв" >&2
      nginx -t >&2 || true
    fi
  fi
  rm -f "$rendered"
fi

echo "▶ Pruning dangling images…"
docker image prune -f >/dev/null

echo "▶ Stack status:"
docker compose ps
echo "✅ Deploy complete."

# Амжилттай дууссан тул дараагийн no-op deploy алгасахад тамга үлдээнэ.
echo "$HEAD_SHA" > "$STAMP"
