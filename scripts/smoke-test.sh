#!/usr/bin/env bash
# Government Template Platform V3.0
# Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.
#
# Live smoke test — template.dgov.mn (эсвэл BASE=... өөр хост).
# Production дээр deploy хийсний дараа гол зам ажиллаж байгааг гаднаас нь
# (black-box) шалгана: TLS + HTTPS redirect, security header-ууд, eID QR/РД
# нэвтрэлт эхлүүлэлт, CSRF хамгаалалт, нэвтрэлт шаардсан endpoint-ийн хамгаалалт.
#
# Хэрэглээ:  BASE=https://template.dgov.mn scripts/smoke-test.sh
# Гаралт: PASS/FAIL мөрүүд; ямар нэг FAIL байвал exit code 1.

set -uo pipefail

BASE="${BASE:-https://template.dgov.mn}"
ORIGIN="${BASE}"
PASS=0
FAIL=0

pass() { printf '  ✅ %s\n' "$1"; PASS=$((PASS + 1)); }
fail() { printf '  ❌ %s\n' "$1"; FAIL=$((FAIL + 1)); }

# assert_status <name> <expected> <actual>
assert_status() {
  if [ "$2" = "$3" ]; then pass "$1 ($3)"; else fail "$1 (хүлээсэн $2, авсан $3)"; fi
}

echo "▶ Smoke test: $BASE"
echo

echo "── TLS + HTTPS ──"
root_code=$(curl -s -m 15 -o /dev/null -w '%{http_code}' "$BASE/")
assert_status "root HTTPS 200" 200 "$root_code"

redirect_code=$(curl -s -m 15 -o /dev/null -w '%{http_code}' "http://template.dgov.mn/")
if [ "$redirect_code" = "301" ] || [ "$redirect_code" = "308" ]; then
  pass "HTTP→HTTPS redirect ($redirect_code)"
else
  fail "HTTP→HTTPS redirect (хүлээсэн 301/308, авсан $redirect_code)"
fi

if curl -s -m 15 -o /dev/null "$BASE/" ; then pass "TLS гэрчилгээ хүчинтэй"; else fail "TLS гэрчилгээ баталгаажсангүй"; fi

echo
echo "── Security headers ──"
headers=$(curl -s -m 15 -D - -o /dev/null "$BASE/")
check_header() {
  if echo "$headers" | grep -qi "^$1:"; then pass "$1 байна"; else fail "$1 дутуу"; fi
}
check_header "strict-transport-security"
check_header "content-security-policy"
check_header "x-content-type-options"

echo
echo "── eID нэвтрэлт эхлүүлэлт (BFF) ──"
qr=$(curl -s -m 20 -X POST "$BASE/api/auth/eid/start" \
  -H "Content-Type: application/json" -H "Origin: $ORIGIN" -H "x-dgov-csrf: 1" -d '{}')
if echo "$qr" | grep -q '"session_id"' && echo "$qr" | grep -q '"verification_code"'; then
  pass "QR start → session_id + verification_code"
else
  fail "QR start (хариу: $(echo "$qr" | head -c 120))"
fi

push=$(curl -s -m 20 -X POST "$BASE/api/auth/eid/start-id" \
  -H "Content-Type: application/json" -H "Origin: $ORIGIN" -H "x-dgov-csrf: 1" \
  -d '{"national_id":"УБ99887766"}')
if echo "$push" | grep -q '"session_id"'; then
  pass "РД push start → session_id"
else
  fail "РД push start (хариу: $(echo "$push" | head -c 120))"
fi

echo
echo "── CSRF хамгаалалт ──"
# Mutating BFF route-ыг CSRF header-гүйгээр дуудвал 403 (checkOrigin).
no_csrf=$(curl -s -m 15 -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/eid/start" \
  -H "Content-Type: application/json" -H "Origin: $ORIGIN" -d '{}')
assert_status "CSRF header-гүй POST → 403" 403 "$no_csrf"

# Өөр origin-оос ирсэн хүсэлт → 403.
bad_origin=$(curl -s -m 15 -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/eid/start" \
  -H "Content-Type: application/json" -H "Origin: https://evil.example" -H "x-dgov-csrf: 1" -d '{}')
assert_status "буруу Origin → 403" 403 "$bad_origin"

echo
echo "── Нэвтрэлт шаардсан endpoint ──"
# Нэвтрээгүйгээр admin/rbac унших → 401 (эсвэл 403).
me_code=$(curl -s -m 15 -o /dev/null -w '%{http_code}' "$BASE/api/rbac/me")
if [ "$me_code" = "401" ] || [ "$me_code" = "403" ]; then
  pass "нэвтрээгүй /api/rbac/me → $me_code"
else
  fail "нэвтрээгүй /api/rbac/me (хүлээсэн 401/403, авсан $me_code)"
fi

echo
echo "──────────────────────────────"
echo "Нийт: $PASS PASS, $FAIL FAIL"
[ "$FAIL" -eq 0 ] || exit 1
