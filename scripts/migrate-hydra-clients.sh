#!/usr/bin/env bash
# Government Template Platform V3.0
#
# Hydra-гийн `hydra` DB дэх OAuth2 client-уудыг үндсэн DB-ийн oauth_clients руу
# зөөнө. Cutover-ийн ӨМНӨ ажиллуулна.
#
# ЧУХАЛ: client_secret-ийн hash-ыг ХЭВЭЭР нь зөөнө (Ory-ийн $pbkdf2-sha256$
# форматыг pkg/secrethash шалгаж чадна) — тиймээс RP-үүд secret-ээ солих
# шаардлагагүй, тохиргоондоо юу ч өөрчлөхгүй.
#
# Хөрвүүлэлтийг БҮХЭЛД НЬ SQL хийнэ: Hydra нь массивуудаа jsonb-ээр, scope-оо
# зайгаар тусгаарласан текстээр хадгалдаг тул Postgres-т array literal болгож
# рендерлүүлээд bash нь зөвхөн дамжуулна (bash-ийн мөр задлалт эмзэг).
#
# Идемпотент: дахин ажиллуулбал байгаа мөрийг шинэчилнэ (ON CONFLICT DO UPDATE).
# Зөвхөн уншиж шалгах бол: DRY_RUN=1 ./scripts/migrate-hydra-clients.sh
#
# Хэрэглээ (сервер дээр, /srv/sso-dgov-mn дотроос):
#   ./scripts/migrate-hydra-clients.sh
set -euo pipefail

COMPOSE="${COMPOSE:-docker compose}"
# DB_EXEC нь psql-ийг ажиллуулах бүрхүүл — тестэд өөр контейнер заахад дарж болно.
DB_EXEC="${DB_EXEC:-$COMPOSE exec -T db}"
HYDRA_DB="${HYDRA_DB:-hydra}"
DRY_RUN="${DRY_RUN:-0}"

if [[ ! -f .env ]]; then
	echo "алдаа: .env олдсонгүй — энэ скриптийг stack-ийн үндсэн хавтаснаас ажиллуул" >&2
	exit 1
fi

PG_USER="$(grep -m1 '^POSTGRES_USER=' .env | cut -d= -f2)"
APP_DB="$(grep -m1 '^POSTGRES_DB=' .env | cut -d= -f2)"
: "${PG_USER:?POSTGRES_USER тохируулаагүй}"
: "${APP_DB:?POSTGRES_DB тохируулаагүй}"

psql_hydra() { $DB_EXEC psql -U "$PG_USER" -d "$HYDRA_DB" "$@"; }
psql_app() { $DB_EXEC psql -U "$PG_USER" -d "$APP_DB" "$@"; }

echo "→ Hydra client-уудыг уншиж байна ($HYDRA_DB)…"

# Гаралтын багана бүр Postgres-ийн array literal ('{a,b}') хэлбэрээр бэлэн ирнэ.
# app_type: metadata-д байвал түүнийг, эс бол grant/auth-method-оос дүгнэнэ
# (хуучин applications_impl.go-ийн appTypeOf-той ижил дүрэм).
# post_logout: Hydra-д хоосон бол redirect-үүдийн origin-оос гаргана — RP-үүд
# end-session дээр үүнийг шаарддаг.
READ_SQL=$(
	cat <<'SQL'
WITH c AS (
  SELECT
    id,
    client_name,
    client_secret,
    COALESCE(NULLIF(token_endpoint_auth_method, ''), 'client_secret_basic') AS auth_method,
    grant_types,
    response_types,
    scope,
    redirect_uris,
    post_logout_redirect_uris,
    COALESCE(NULLIF(metadata, '')::jsonb, '{}'::jsonb) AS meta
  FROM hydra_client
)
SELECT
  c.id,
  c.client_name,
  c.client_secret,
  c.auth_method,
  COALESCE(
    NULLIF(c.meta ->> 'app_type', ''),
    CASE
      WHEN c.grant_types ? 'client_credentials' THEN 'm2m'
      WHEN c.auth_method = 'none' THEN 'spa'
      ELSE 'web'
    END
  ) AS app_type,
  (SELECT COALESCE(array_agg(t), '{}') FROM jsonb_array_elements_text(c.grant_types) t)::text     AS grant_types,
  (SELECT COALESCE(array_agg(t), '{}') FROM jsonb_array_elements_text(c.response_types) t)::text  AS response_types,
  (SELECT COALESCE(array_agg(s), '{}') FROM regexp_split_to_table(trim(c.scope), '\s+') s
    WHERE s <> '')::text                                                                          AS scopes,
  (SELECT COALESCE(array_agg(t), '{}') FROM jsonb_array_elements_text(c.redirect_uris) t)::text   AS redirect_uris,
  CASE
    WHEN jsonb_array_length(c.post_logout_redirect_uris) > 0
      THEN (SELECT COALESCE(array_agg(t), '{}')
              FROM jsonb_array_elements_text(c.post_logout_redirect_uris) t)::text
    ELSE (SELECT COALESCE(array_agg(DISTINCT o), '{}')
            FROM jsonb_array_elements_text(c.redirect_uris) u,
                 LATERAL (SELECT substring(u from '^(https?://[^/]+)') || '/' AS o) x
           WHERE substring(u from '^(https?://[^/]+)') IS NOT NULL)::text
  END                                                                                             AS post_logout_redirect_uris,
  (SELECT COALESCE(array_agg(t), '{}') FROM jsonb_array_elements_text(
      CASE jsonb_typeof(c.meta -> 'tags') WHEN 'array' THEN c.meta -> 'tags' ELSE '[]'::jsonb END
   ) t)::text                                                                                     AS tags,
  -- psql -At нь boolean-ыг 't'/'f' болгодог тул SQL литерал болгож гаргана.
  CASE WHEN COALESCE((c.meta ->> 'enabled')::boolean, true) THEN 'true' ELSE 'false' END AS enabled
FROM c
ORDER BY c.id;
SQL
)

# bash 3.2-тэй нийцтэй байхын тулд mapfile ашиглахгүй (macOS дээр байхгүй).
ROWS=()
while IFS= read -r line; do
	[[ -n "$line" ]] && ROWS+=("$line")
done < <(psql_hydra -At -F$'\t' -c "$READ_SQL")

if [[ ${#ROWS[@]} -eq 0 ]]; then
	echo "Hydra-д client алга — зөөх зүйлгүй."
	exit 0
fi

echo "→ ${#ROWS[@]} client олдлоо."

sql_escape() { printf '%s' "${1//\'/\'\'}"; }

for row in "${ROWS[@]}"; do
	IFS=$'\t' read -r id name secret auth_method app_type grants response_types scopes redirects post_logout tags enabled <<<"$row"

	echo "   • ${id} (${app_type}, ${auth_method})"

	WRITE_SQL="INSERT INTO oauth_clients (
	  client_id, client_name, secret_hash, token_endpoint_auth_method, app_type,
	  grant_types, response_types, scopes, redirect_uris, post_logout_redirect_uris,
	  tags, enabled, created_by)
	VALUES (
	  '$(sql_escape "$id")', '$(sql_escape "$name")', '$(sql_escape "$secret")',
	  '$(sql_escape "$auth_method")', '$(sql_escape "$app_type")',
	  '$(sql_escape "$grants")', '$(sql_escape "$response_types")', '$(sql_escape "$scopes")',
	  '$(sql_escape "$redirects")', '$(sql_escape "$post_logout")',
	  '$(sql_escape "$tags")', ${enabled:-true}, 'hydra-migration')
	ON CONFLICT (client_id) DO UPDATE SET
	  client_name = EXCLUDED.client_name,
	  secret_hash = EXCLUDED.secret_hash,
	  token_endpoint_auth_method = EXCLUDED.token_endpoint_auth_method,
	  app_type = EXCLUDED.app_type,
	  grant_types = EXCLUDED.grant_types,
	  response_types = EXCLUDED.response_types,
	  scopes = EXCLUDED.scopes,
	  redirect_uris = EXCLUDED.redirect_uris,
	  post_logout_redirect_uris = EXCLUDED.post_logout_redirect_uris,
	  tags = EXCLUDED.tags,
	  enabled = EXCLUDED.enabled,
	  updated_at = now();"

	if [[ "$DRY_RUN" == "1" ]]; then
		echo "$WRITE_SQL"
	else
		psql_app -q -v ON_ERROR_STOP=1 -c "$WRITE_SQL"
	fi
done

if [[ "$DRY_RUN" == "1" ]]; then
	echo "DRY_RUN=1 — юу ч бичээгүй."
	exit 0
fi

echo
echo "→ Үр дүн (oauth_clients):"
psql_app -c "SELECT client_id, app_type, token_endpoint_auth_method, enabled,
                    array_length(redirect_uris,1) AS redirects,
                    array_length(scopes,1) AS scopes,
                    left(secret_hash, 15) AS secret_hash_prefix
             FROM oauth_clients ORDER BY client_id;"

echo
echo "Дууслаа. secret hash-ууд ХЭВЭЭР зөөгдсөн тул RP-үүд secret-ээ солих шаардлагагүй."
