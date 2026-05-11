# siteops.09car.co.kr Tunnel Plan

Purpose: expose the BOSS SiteOps admin app safely without opening the Ubuntu API port directly.

## Target

```text
https://siteops.09car.co.kr -> http://127.0.0.1:8787
```

The Node server on `8787` serves both:

- admin UI
- `/api/*`

So a separate API subdomain is not required for the first internal MVP.

## Security Defaults

- Do not open port `8787` directly to the public internet.
- Use Cloudflare Tunnel.
- Add Cloudflare Access before relying on this for real operations.
- Allow only BOSS/admin emails first.
- Do not commit tunnel tokens, cert files, Cloudflare API tokens, or `.env`.

## Ubuntu Checks

Run on the Ubuntu server.

```bash
docker ps
```

Confirm a `cloudflared` container is already running.

Check whether the SiteOps API is listening:

```bash
curl http://127.0.0.1:8787/api/health
```

Expected:

```json
{"ok":true,"database":"connected"}
```

## Cloudflare Tunnel Route

In Cloudflare Zero Trust or existing cloudflared config, add this public hostname:

```text
Hostname: siteops.09car.co.kr
Service:  http://127.0.0.1:8787
```

If using a Docker compose tunnel config, route format is typically:

```yaml
ingress:
  - hostname: siteops.09car.co.kr
    service: http://127.0.0.1:8787
  - service: http_status:404
```

Keep existing N8N routes intact.

## SiteOps `.env`

On Ubuntu, `/home/boss/codex-dema/.env` should include:

```text
API_HOST=127.0.0.1
API_PORT=8787
CORS_ALLOW_ORIGINS=https://siteops.09car.co.kr,http://127.0.0.1:5173,http://localhost:5173
VITE_API_BASE_URL=
```

`API_HOST=127.0.0.1` is preferred when Cloudflare Tunnel is on the same host. It keeps the app private to the server.

After editing `.env`, restart the API:

```bash
cd /home/boss/codex-dema
npm run start
```

If it is already running, stop it first with `Ctrl + C`.

## PC Admin Screen

After the tunnel works, open:

```text
https://siteops.09car.co.kr
```

In the API address field, use either:

```text
https://siteops.09car.co.kr
```

or leave it as same-origin when using the production page from the same domain.

## Final Verification

From any browser:

```text
https://siteops.09car.co.kr/api/health
```

Expected:

```json
{"ok":true,"database":"connected"}
```

Then open:

```text
https://siteops.09car.co.kr/#inventory
```

Expected:

- domain inventory count uses PostgreSQL data
- not the 3-row sample fallback
- API banner says connected
