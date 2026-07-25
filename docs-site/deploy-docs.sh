#!/usr/bin/env bash
# Government Template Platform V3.0
# Gerege Systems Development Team & Claude AI, 2026
#
# Build the MkDocs documentation site and deploy it to the server (one command).
# Хостлогддог: https://template.dgov.mn/docs/  (nginx → /var/www/template-docs)
#
# Ашиглах:
#   ./docs-site/deploy-docs.sh
#
# SSH нэвтрэлт: SSH key байвал шууд ажиллана. Нууц үгээр нэвтрэх бол:
#   SSHPASS='<серверийн нууц үг>' ./docs-site/deploy-docs.sh
# (нууц үгийг скриптэд ХЭЗЭЭ Ч бичихгүй — зөвхөн орчны хувьсагчаар дамжуулна.)
#
# Тохиргоог env-ээр дарж болно:
#   DOCS_SERVER   (default root@38.180.243.138)
#   DOCS_TARGET   (default /var/www/template-docs)
#   DOCS_VENV     (default <энэ хавтас>/.venv)
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE"

DOCS_SERVER="${DOCS_SERVER:-root@38.180.243.138}"
DOCS_TARGET="${DOCS_TARGET:-/var/www/template-docs}"
VENV="${DOCS_VENV:-$HERE/.venv}"

# ssh/scp wrapper: SSHPASS тохируулагдсан БА sshpass байвал нууц үгээр, эс бөгөөс key-ээр.
SSH=(ssh -o StrictHostKeyChecking=accept-new)
SCP=(scp -o StrictHostKeyChecking=accept-new)
if [[ -n "${SSHPASS:-}" ]] && command -v sshpass >/dev/null 2>&1; then
  SSH=(sshpass -e "${SSH[@]}")
  SCP=(sshpass -e "${SCP[@]}")
fi

# 1) mkdocs + plugin-ууд бэлэн эсэхийг хангах (venv, байхгүй бол үүсгэнэ)
if [[ ! -x "$VENV/bin/mkdocs" ]]; then
  echo "▶ MkDocs + plugin-ууд суулгаж байна (venv: $VENV)…"
  python3 -m venv "$VENV"
  "$VENV/bin/pip" install --quiet --upgrade pip
  "$VENV/bin/pip" install --quiet -r "$HERE/requirements.txt"
fi

# 2) build
echo "▶ Docs build хийж байна…"
"$VENV/bin/mkdocs" build --clean --strict

# 3) серверт байршуулах (tar → scp → extract)
echo "▶ Deploy → $DOCS_SERVER:$DOCS_TARGET …"
TGZ="$(mktemp)"
tar czf "$TGZ" -C site .
"${SCP[@]}" "$TGZ" "$DOCS_SERVER:/tmp/template-docs.tgz"
"${SSH[@]}" "$DOCS_SERVER" \
  "rm -rf '$DOCS_TARGET' && mkdir -p '$DOCS_TARGET' && tar xzf /tmp/template-docs.tgz -C '$DOCS_TARGET' && rm -f /tmp/template-docs.tgz"
rm -f "$TGZ"

echo "✅ Docs deployed → https://template.dgov.mn/docs/"
