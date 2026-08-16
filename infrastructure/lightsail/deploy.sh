#!/usr/bin/env bash
set -Eeuo pipefail

readonly ROOT_DIR="${DATABREEZE_DEPLOY_ROOT:-/opt/databreeze}"
readonly ENV_FILE="${ROOT_DIR}/.env"
readonly COMPOSE_FILE="${ROOT_DIR}/compose.pilot.yml"
readonly RELEASE_ROOT="${ROOT_DIR}/releases"
readonly CURRENT_RELEASE="${ROOT_DIR}/current-release.env"

if [[ "${EUID}" -ne 0 ]] && ! groups 2>/dev/null | grep -Eq '(^|[[:space:]])docker([[:space:]]|$)'; then
  echo 'deploy.sh requires root or membership in the docker group.' >&2
  exit 2
fi
if [[ "${1:-}" == '' ]]; then
  echo 'Usage: deploy.sh /opt/databreeze/releases/<release>.env' >&2
  exit 2
fi
readonly RELEASE_FILE="$(realpath -- "${1}")"
if [[ ! -r "${RELEASE_FILE}" || "${RELEASE_FILE}" != "${RELEASE_ROOT}"/* ]]; then
  echo 'Release manifest must be an existing file under the release directory.' >&2
  exit 2
fi
if [[ ! -r "${ENV_FILE}" || ! -r "${COMPOSE_FILE}" ]]; then
  echo 'Pilot bootstrap files or .env are missing.' >&2
  exit 2
fi

read_release_value() {
  local file="$1"
  local name="$2"
  local value
  value="$(awk -v key="${name}" 'index($0, key "=") == 1 { print substr($0, length(key) + 2); found = 1 } END { if (!found) exit 1 }' "${file}")" || {
    echo "Release manifest is missing ${name}." >&2
    exit 2
  }
  if [[ "${value}" == *$'\n'* || "${value}" == *$'\r'* || "${value}" == *' '* || "${value}" == *$'\t'* ]]; then
    echo "Release value ${name} contains invalid whitespace." >&2
    exit 2
  fi
  if [[ ! "${value}" =~ ^[a-zA-Z0-9./_:@-]+@sha256:[0-9a-f]{64}$ ]]; then
    echo "Release value ${name} must be an immutable image reference." >&2
    exit 2
  fi
  printf '%s' "${value}"
}

load_release() {
  local file="$1"
  API_IMAGE="$(read_release_value "${file}" API_IMAGE)"
  API_MIGRATION_IMAGE="$(read_release_value "${file}" API_MIGRATION_IMAGE)"
  WEB_IMAGE="$(read_release_value "${file}" WEB_IMAGE)"
  export API_IMAGE API_MIGRATION_IMAGE WEB_IMAGE
}

readonly RELEASE_ID="$(basename -- "${RELEASE_FILE}" .env)"
readonly RELEASE_COPY="${RELEASE_ROOT}/${RELEASE_ID}.env"
if [[ "${RELEASE_FILE}" != "${RELEASE_COPY}" ]]; then
  install -m 0640 "${RELEASE_FILE}" "${RELEASE_COPY}"
else
  chmod 0640 "${RELEASE_COPY}"
fi

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a
load_release "${RELEASE_FILE}"

readonly COMPOSE=(docker compose --env-file "${ENV_FILE}" --project-name "${COMPOSE_PROJECT_NAME:-databreeze-pilot}" --file "${COMPOSE_FILE}")

run_stack() {
  "${COMPOSE[@]}" pull api-migrate api web
  "${COMPOSE[@]}" up -d postgres redis minio mailpit minio-init
  "${COMPOSE[@]}" run --rm api-migrate
  "${COMPOSE[@]}" up -d api web
  "${ROOT_DIR}/healthcheck.sh"
}

print_failure_diagnostics() {
  echo 'Pilot deployment diagnostics:' >&2
  "${COMPOSE[@]}" ps >&2 || true

  local api_container
  api_container="$("${COMPOSE[@]}" ps -q api 2>/dev/null || true)"
  if [[ -n "${api_container}" ]]; then
    echo 'API health state:' >&2
    docker inspect --format '{{json .State.Health}}' "${api_container}" >&2 || true
  fi

  echo 'API logs:' >&2
  "${COMPOSE[@]}" logs --no-color --tail 200 api >&2 || true
}

previous_release=''
if [[ -L "${CURRENT_RELEASE}" ]]; then
  previous_release="$(realpath -- "${CURRENT_RELEASE}")"
fi

if ! run_stack; then
  print_failure_diagnostics
  echo 'New pilot release failed. Restoring the previous release if one exists.' >&2
  if [[ -n "${previous_release}" && -r "${previous_release}" ]]; then
    load_release "${previous_release}"
    run_stack || true
  else
    "${COMPOSE[@]}" down --remove-orphans || true
  fi
  exit 1
fi

ln -sfn "${RELEASE_COPY}" "${CURRENT_RELEASE}"
echo "Pilot release ${RELEASE_ID} is healthy."
