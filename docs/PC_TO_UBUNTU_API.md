# PC to Ubuntu API Connection

This note keeps the admin screen connection explicit and safe.

## Current Roles

- PC browser: `http://127.0.0.1:5173`
- Ubuntu API: `http://127.0.0.1:8787` inside the Ubuntu server
- PostgreSQL: Docker container on the Ubuntu server

`127.0.0.1` always means "this computer." The PC browser cannot reach Ubuntu's `127.0.0.1` unless a tunnel or public server address is used.

## Recommended Options

### Option A. SSH tunnel for private admin work

Use this when only BOSS needs to view the admin screen from the PC.

```powershell
ssh -L 8787:127.0.0.1:8787 boss@<SERVER_PUBLIC_IP>
```

Then set the admin screen API address to:

```text
http://127.0.0.1:8787
```

This keeps the API private and avoids opening port `8787` to the public internet.

### Option B. Cloudflare Tunnel for controlled web access

Use this later if the admin UI or API needs a stable HTTPS address.

Recommended pattern:

```text
admin-api.example.com -> http://127.0.0.1:8787
```

Then set the admin screen API address to:

```text
https://admin-api.example.com
```

Add access control before sharing this URL with staff or customers.

### Option C. Direct IP and port

This is the least preferred option.

Only use it temporarily on a trusted network with firewall restrictions.

Ubuntu `.env` example:

```text
API_HOST=0.0.0.0
API_PORT=8787
CORS_ALLOW_ORIGINS=http://127.0.0.1:5173,http://localhost:5173
```

PC admin screen API address:

```text
http://<SERVER_PUBLIC_IP>:8787
```

Do not leave this publicly open without authentication and firewall rules.

## After Changing `.env`

Restart the API server.

```bash
cd /home/boss/codex-dema
npm run start
```

If the API was already running, stop it first with `Ctrl + C`, then start it again.
