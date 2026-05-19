# Ubuntu Deployment

This document records the production deployment flow for BOSS SiteOps on the Ubuntu server.

## Server Paths

```text
Project: /home/boss/codex-dema
Public admin: https://siteops.09car.co.kr
Wordfriends site: https://wordfriends.co.kr
```

Do not print, commit, or paste `.env`, `wp-config.php`, SMTP keys, database passwords, WordPress admin passwords, Cloudflare tokens, or tunnel credentials.

## Install Runtime

Ubuntu 22.04 or newer is recommended.

```bash
sudo apt-get update
sudo apt-get install -y git curl postgresql postgresql-contrib
node --version
npm --version
```

Use Node.js 20 or newer.

## Prepare Project

```bash
cd /home/boss
git clone https://github.com/09carcar2424-netizen/codex-dema.git
cd /home/boss/codex-dema
npm ci
```

If the repository already exists, deploy with:

```bash
cd /home/boss/codex-dema
git pull
npm ci
```

## Environment

Create `/home/boss/codex-dema/.env` and restrict permissions.

```bash
cd /home/boss/codex-dema
chmod 600 .env
```

Expected production values:

```text
DATABASE_URL=postgresql://wpauto:<DB_PASSWORD>@127.0.0.1:5432/wp_automation
API_HOST=0.0.0.0
API_PORT=8787
CORS_ALLOW_ORIGINS=https://siteops.09car.co.kr,https://wordfriends.co.kr,http://127.0.0.1:5173,http://localhost:5173
VITE_API_BASE_URL=
SITEOPS_ADMIN_USER=boss
SITEOPS_ADMIN_PASSWORD=<STRONG_ADMIN_PASSWORD>
SITEOPS_EVENT_TOKEN=<LONG_RANDOM_SECRET>
```

`VITE_API_BASE_URL` should stay empty for the production build so the frontend calls same-origin `/api`.

## PostgreSQL

For the Docker-based production database:

```bash
docker ps
docker volume inspect codex-dema_postgres_data
```

Known production values:

```text
Container: wp-automation-postgres
Database: wp_automation
User: wpauto
Volume: codex-dema_postgres_data
Volume path: /var/lib/docker/volumes/codex-dema_postgres_data/_data
```

Apply schema changes only after reviewing them:

```bash
cd /home/boss/codex-dema
cat database/schema.sql | docker exec -i wp-automation-postgres psql -U wpauto -d wp_automation
```

## Build And Run

Run this step when frontend, API, server, or database access code changed. Plugin-only changes do not require an API restart unless the plugin depends on a changed SiteOps endpoint.

```bash
cd /home/boss/codex-dema
npm run build
sudo systemctl restart boss-siteops-api
```

Health check:

```bash
curl http://127.0.0.1:8787/api/health
curl https://siteops.09car.co.kr/api/health
```

Expected:

```json
{"ok":true,"database":"connected"}
```

## Wordfriends Plugin Deployment

The core plugin file is:

```text
integrations/wordfriends-siteops-tracker/wordfriends-siteops-tracker.php
```

Before upload, run on the server:

```bash
cd /home/boss/codex-dema
php -l /home/boss/codex-dema/integrations/wordfriends-siteops-tracker/wordfriends-siteops-tracker.php
```

Upload with FileZilla:

```text
Local:  integrations/wordfriends-siteops-tracker/wordfriends-siteops-tracker.php
Remote: /wp-content/plugins/wordfriends-siteops-tracker/wordfriends-siteops-tracker.php
```

After upload, run the same `php -l` check again on the server copy if shell access to the WordPress path is available.

Also confirm in WordPress Admin > Plugins that **Wordfriends SiteOps Tracker** shows the expected version.

If both the plugin and SiteOps API changed:

```bash
cd /home/boss/codex-dema
git pull
npm run build
sudo systemctl restart boss-siteops-api
```

Then upload the plugin file with FileZilla and run the Wordfriends smoke test in `docs/WORDFRIENDS_OPERATIONS_RUNBOOK.md`.

## Cloudflare Tunnel

Keep public port `8787` closed. SiteOps should be exposed through Cloudflare Tunnel:

```text
https://siteops.09car.co.kr -> http://172.17.0.1:8787
```

See `docs/SITEOPS_09CAR_TUNNEL.md` for tunnel-specific checks.
