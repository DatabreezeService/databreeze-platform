#!/bin/sh
# Mounted into a Linux container; repository attributes keep this script LF-only.
set -eu

: "${MINIO_ROOT_USER:?MINIO_ROOT_USER is required}"
: "${MINIO_ROOT_PASSWORD:?MINIO_ROOT_PASSWORD is required}"
: "${MINIO_BUCKET_ARTIFACTS:?MINIO_BUCKET_ARTIFACTS is required}"
: "${MINIO_BUCKET_RESULTS:?MINIO_BUCKET_RESULTS is required}"

mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"
mc mb --ignore-existing "local/$MINIO_BUCKET_ARTIFACTS"
mc mb --ignore-existing "local/$MINIO_BUCKET_RESULTS"
mc anonymous set none "local/$MINIO_BUCKET_ARTIFACTS"
mc anonymous set none "local/$MINIO_BUCKET_RESULTS"
