#!/usr/bin/env bash
set -Eeuo pipefail

readonly ROOT_DIR="${DATABREEZE_DEPLOY_ROOT:-/opt/databreeze}"
readonly ENV_FILE="${ROOT_DIR}/.env"
readonly MAX_ATTEMPTS="${DATABREEZE_HEALTH_ATTEMPTS:-60}"
readonly SLEEP_SECONDS="${DATABREEZE_HEALTH_SLEEP_SECONDS:-2}"

if [[ ! -r "${ENV_FILE}" ]]; then
  echo 'Pilot .env is missing or unreadable.' >&2
  exit 2
fi

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

if [[ -z "${DATABREEZE_PILOT_DOMAIN:-}" ]]; then
  echo 'DATABREEZE_PILOT_DOMAIN is required.' >&2
  exit 2
fi

readonly URL="https://${DATABREEZE_PILOT_DOMAIN}/health/ready"
for ((attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1)); do
  response_content_type="$(curl --fail --silent --show-error --max-time 10 \
    --write-out '%{content_type}' --output /tmp/databreeze-readiness.json "${URL}" || true)"
  if [[ "${response_content_type}" == application/json* ]] &&
    grep -Eq '"status"[[:space:]]*:[[:space:]]*"(ready|ok)"' /tmp/databreeze-readiness.json; then
    rm -f /tmp/databreeze-readiness.json
    echo 'Pilot readiness is healthy.'
    exit 0
  fi
  sleep "${SLEEP_SECONDS}"
done

rm -f /tmp/databreeze-readiness.json
echo "Pilot readiness did not become healthy within ${MAX_ATTEMPTS} attempts." >&2
exit 1
