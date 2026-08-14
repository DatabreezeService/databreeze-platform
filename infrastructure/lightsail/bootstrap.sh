#!/usr/bin/env bash
set -Eeuo pipefail

readonly ROOT_DIR="${DATABREEZE_DEPLOY_ROOT:-/opt/databreeze}"
readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

if [[ "${EUID}" -ne 0 ]]; then
  echo 'bootstrap.sh must run as root.' >&2
  exit 2
fi

if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  echo 'Docker Engine and Docker Compose v2 must be installed before bootstrap.' >&2
  exit 2
fi

install -d -m 0750 "${ROOT_DIR}" "${ROOT_DIR}/releases" "${ROOT_DIR}/backups"
install -m 0640 "${SCRIPT_DIR}/compose.pilot.yml" "${ROOT_DIR}/compose.pilot.yml"
install -m 0640 "${SCRIPT_DIR}/Caddyfile" "${ROOT_DIR}/Caddyfile"
install -m 0750 "${SCRIPT_DIR}/deploy.sh" "${ROOT_DIR}/deploy.sh"
install -m 0750 "${SCRIPT_DIR}/rollback.sh" "${ROOT_DIR}/rollback.sh"
install -m 0750 "${SCRIPT_DIR}/healthcheck.sh" "${ROOT_DIR}/healthcheck.sh"

if [[ ! -e "${ROOT_DIR}/.env" ]]; then
  install -m 0600 "${SCRIPT_DIR}/.env.example" "${ROOT_DIR}/.env"
  echo "Created ${ROOT_DIR}/.env. Replace every CHANGE_ME value before deployment." >&2
else
  chmod 0600 "${ROOT_DIR}/.env"
fi

echo "Pilot deployment root is ${ROOT_DIR}. Add owner secrets to ${ROOT_DIR}/.env, then run deploy.sh with an immutable release manifest."
