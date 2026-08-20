#!/usr/bin/env bash
set -Eeuo pipefail

readonly ROOT_DIR="${DATABREEZE_DEPLOY_ROOT:-/opt/databreeze}"
readonly ENV_FILE="${ROOT_DIR}/.env"
readonly COMPOSE_FILE="${ROOT_DIR}/compose.pilot.yml"
readonly BACKUP_ROOT="${ROOT_DIR}/backups"

if [[ "${EUID}" -ne 0 ]] && ! groups 2>/dev/null | grep -Eq '(^|[[:space:]])docker([[:space:]]|$)'; then
  echo 'backup.sh requires root or membership in the docker group.' >&2
  exit 2
fi
if [[ ! "${1:-}" =~ ^[A-Za-z0-9._-]+$ ]]; then
  echo 'Usage: backup.sh <release-id>' >&2
  exit 2
fi
if [[ ! -r "${ENV_FILE}" || ! -r "${COMPOSE_FILE}" ]]; then
  echo 'Pilot Compose file or protected environment is missing.' >&2
  exit 2
fi

readonly RELEASE_ID="$1"
install -d -m 0700 "${BACKUP_ROOT}"
readonly TEMP_DIR="$(mktemp -d "${BACKUP_ROOT}/.tmp.${RELEASE_ID}.XXXXXX")"
readonly TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
readonly FINAL_DIR="${BACKUP_ROOT}/${TIMESTAMP}-${RELEASE_ID}"

cleanup() {
  if [[ -d "${TEMP_DIR}" ]]; then
    rm -rf -- "${TEMP_DIR}"
  fi
}
trap cleanup EXIT

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

readonly COMPOSE=(docker compose --env-file "${ENV_FILE}" --project-name "${COMPOSE_PROJECT_NAME:-databreeze-pilot}" --file "${COMPOSE_FILE}")
for service in postgres minio; do
  if [[ -z "$("${COMPOSE[@]}" ps -q "${service}")" ]]; then
    echo "Cannot back up because ${service} is not running." >&2
    exit 1
  fi
done

"${COMPOSE[@]}" exec -T postgres \
  pg_dump -U "${POSTGRES_USER:-databreeze}" -d "${POSTGRES_DB:-databreeze}" --format=custom \
  > "${TEMP_DIR}/postgres.dump"
test -s "${TEMP_DIR}/postgres.dump"

install -d -m 0700 "${TEMP_DIR}/minio/artifacts" "${TEMP_DIR}/minio/results"
"${COMPOSE[@]}" run --rm --no-deps \
  -v "${TEMP_DIR}/minio:/backup" \
  --entrypoint /bin/sh minio-init -c '
    set -eu
    mc alias set source http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null
    mc mirror --overwrite "source/$MINIO_BUCKET_ARTIFACTS" /backup/artifacts
    mc mirror --overwrite "source/$MINIO_BUCKET_RESULTS" /backup/results
  '

cat > "${TEMP_DIR}/manifest.txt" <<EOF
release_id=${RELEASE_ID}
created_at=${TIMESTAMP}
database=postgres.dump
objects=minio/
EOF

(
  cd "${TEMP_DIR}"
  sha256sum postgres.dump manifest.txt
  find minio -type f -print0 | sort -z | xargs -0 -r sha256sum
) > "${TEMP_DIR}/SHA256SUMS"

if [[ -e "${FINAL_DIR}" ]]; then
  echo 'Backup destination already exists.' >&2
  exit 1
fi
mv -- "${TEMP_DIR}" "${FINAL_DIR}"
trap - EXIT
chmod -R go-rwx "${FINAL_DIR}"
echo "Pilot backup completed at ${FINAL_DIR}."
