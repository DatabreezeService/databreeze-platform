#!/usr/bin/env bash
set -Eeuo pipefail

readonly ROOT_DIR="${DATABREEZE_DEPLOY_ROOT:-/opt/databreeze}"
readonly RELEASE_ROOT="${ROOT_DIR}/releases"
if [[ "${1:-}" == '' ]]; then
  echo 'Usage: rollback.sh <release-id>' >&2
  exit 2
fi
readonly RELEASE_ID="$1"
if [[ ! "${RELEASE_ID}" =~ ^[A-Za-z0-9._-]+$ ]]; then
  echo 'Release id contains invalid characters.' >&2
  exit 2
fi
readonly RELEASE_FILE="${RELEASE_ROOT}/${RELEASE_ID}.env"
if [[ ! -r "${RELEASE_FILE}" ]]; then
  echo "Release ${RELEASE_ID} does not exist." >&2
  exit 2
fi
exec "${ROOT_DIR}/deploy.sh" "${RELEASE_FILE}"
