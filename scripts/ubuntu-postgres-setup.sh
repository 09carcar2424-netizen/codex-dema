#!/usr/bin/env bash
set -euo pipefail

APP_DB_NAME="${APP_DB_NAME:-wp_automation}"
APP_DB_USER="${APP_DB_USER:-wpauto}"
APP_DB_PASSWORD="${APP_DB_PASSWORD:-change-this-before-running}"
SCHEMA_FILE="${SCHEMA_FILE:-database/schema.sql}"

if [[ "$APP_DB_PASSWORD" == "change-this-before-running" ]]; then
  echo "ERROR: Set APP_DB_PASSWORD before running this script." >&2
  echo "Example: APP_DB_PASSWORD='strong-random-password' bash scripts/ubuntu-postgres-setup.sh" >&2
  exit 1
fi

if [[ ! -f "$SCHEMA_FILE" ]]; then
  echo "ERROR: schema file not found: $SCHEMA_FILE" >&2
  exit 1
fi

sudo apt-get update
sudo apt-get install -y postgresql postgresql-contrib

sudo systemctl enable postgresql
sudo systemctl start postgresql

sudo -u postgres psql <<SQL
DO
\$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${APP_DB_USER}') THEN
    CREATE ROLE ${APP_DB_USER} LOGIN PASSWORD '${APP_DB_PASSWORD}';
  ELSE
    ALTER ROLE ${APP_DB_USER} WITH PASSWORD '${APP_DB_PASSWORD}';
  END IF;
END
\$\$;

SELECT 'CREATE DATABASE ${APP_DB_NAME} OWNER ${APP_DB_USER}'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${APP_DB_NAME}')\\gexec
GRANT ALL PRIVILEGES ON DATABASE ${APP_DB_NAME} TO ${APP_DB_USER};
SQL

sudo -u postgres psql -d "$APP_DB_NAME" -f "$SCHEMA_FILE"

cat <<EOF
PostgreSQL is ready.

DATABASE_URL=postgresql://${APP_DB_USER}:<hidden>@127.0.0.1:5432/${APP_DB_NAME}

Add the real password to your Ubuntu .env file only.
EOF
