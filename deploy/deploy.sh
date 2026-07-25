#!/usr/bin/env bash
# Government Template Platform V3.0
# Gerege Systems Development Team & Claude AI, 2026
#
# Remote deploy step, run ON the server by the CD workflow (.github/workflows/deploy.yml)
# after the target commit is already checked out. Rebuilds images, restarts the
# compose stack, waits for health, and prunes dangling images. Idempotent — safe
# to re-run by hand: `bash deploy/deploy.sh`.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

echo "▶ Deploy commit: $(git rev-parse --short HEAD) — $(git log -1 --pretty=%s)"

# INTEGRATION_ENC_KEY — superadmin MFA-ийн TOTP secret болон integrations OAuth
# token-ийг AES-GCM-ээр шифрлэх түлхүүр. CD workflow нь GitHub secret-ээс энэ
# скриптэд дамжуулна. backend.env-д БАЙХГҮЙ тохиолдолд Л нэг удаа бичнэ
# (idempotent) — нэгэнт тавьсан түлхүүрийг дахин бичихгүй тул хэзээ ч
# өөрчлөгдөхгүй (өөрчилвөл өмнөх шифрлэсэн бүх өгөгдөл эвдэрнэ).
if [ -n "${INTEGRATION_ENC_KEY:-}" ] && ! grep -q '^INTEGRATION_ENC_KEY=' backend.env 2>/dev/null; then
  printf 'INTEGRATION_ENC_KEY=%s\n' "$INTEGRATION_ENC_KEY" >> backend.env
  echo "▶ INTEGRATION_ENC_KEY-г backend.env-д бичлээ (superadmin MFA идэвхжинэ)"
fi

echo "▶ Building images (api · web · migrate)…"
docker compose build

echo "▶ Starting stack (migrate re-runs; applied migrations are skipped)…"
docker compose up -d --remove-orphans

# Wait until api + web report healthy (compose healthchecks). ~120s budget.
echo "▶ Waiting for containers to become healthy…"
deadline=$(( $(date +%s) + 150 ))
for svc in api web; do
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

echo "▶ Pruning dangling images…"
docker image prune -f >/dev/null

echo "▶ Stack status:"
docker compose ps
echo "✅ Deploy complete."
