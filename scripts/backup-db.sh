#!/usr/bin/env bash
# Backup script for jnc_crm_dev database
# Refuses to run unless the DB host is allow‑listed
# Prints the database name and writes a compressed, encrypted backup file

set -euo pipefail

# Configuration - adjust as needed
ALLOWED_HOSTS=("dev-db.example.com" "localhost")
DB_HOST="${DB_HOST:-localhost}"
DB_NAME="${POSTGRES_DB:-jnc_crm_dev}"
DB_USER="${POSTGRES_USER:-jnc_user}"
DB_PASSWORD="${POSTGRES_PASSWORD:-}" # expecting env var, never printed
BACKUP_DIR="/var/backups/jnc_crm"  # external storage, NOT inside project
DATE_SUFFIX=$(date +"%Y%m%d_%H%M%S")
FILE_NAME="${DB_NAME}_backup_${DATE_SUFFIX}.sql.gz.gpg"

# Check host allow‑list
if [[ ! " ${ALLOWED_HOSTS[@]} " =~ " ${DB_HOST} " ]]; then
  echo "Error: host '${DB_HOST}' is not allow‑listed for backups" >&2
  exit 1
fi

echo "Backing up database: ${DB_NAME}"
# Perform pg_dump, pipe to gzip and then encrypt with GPG (symmetric encryption)
# The passphrase should be supplied via an env var BACKUP_PASSPHRASE; never logged
export GPG_TTY=$(tty)
pg_dump -h "${DB_HOST}" -U "${DB_USER}" "${DB_NAME}" \
  | gzip \
  | gpg --symmetric --cipher-algo AES256 --batch --passphrase "${BACKUP_PASSPHRASE}" \
  -o "${BACKUP_DIR}/${FILE_NAME}"

echo "Backup written to ${BACKUP_DIR}/${FILE_NAME}"
