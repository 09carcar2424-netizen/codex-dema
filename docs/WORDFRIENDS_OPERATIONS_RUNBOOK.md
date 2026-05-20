# Wordfriends Operations Runbook

This runbook is the handoff checklist for stabilizing and operating Wordfriends with BOSS SiteOps.

## Scope

```text
Local project: C:\Users\pi\Desktop\BOSS\codex dema
Server project: /home/boss/codex-dema
Wordfriends: https://wordfriends.co.kr
SiteOps admin: https://siteops.09car.co.kr
Core plugin: integrations/wordfriends-siteops-tracker/wordfriends-siteops-tracker.php
Current verified plugin version: 0.6.9
```

## Stabilization Checklist

Run this checklist after every visible Wordfriends change.

Public pages:

- HOME renders in the SiteOps dark tone and the primary CTA links to the intended next step.
- Services explains Wordfriends work without revenue, approval, ranking, or traffic guarantees.
- Start guide shows the build order clearly on desktop and mobile.
- Cases describe customer problem-solving scenarios, not income proof.
- Guide/FAQ links to the published guide articles.
- Question page collects only the information needed for consultation.
- Footer is centered, does not overflow, and shows `talk@wordfriends.co.kr` as a blue email link.

Customer portal:

- Customer portal opens only as the customer-safe view.
- Logged-out customer portal, my sites, my questions, settlement/referrals, and notifications pages show a login gate and no customer data.
- My sites does not expose internal risk scores, raw risk levels, site keys, credentials, proxy details, backend notes, or guarantee language.
- My questions shows only the customer's own question and public response text. It must not show response notes, send errors, backend status details, or admin-only metadata.
- Contract guide and contract request flow show public messages and contract links only, and avoid legal certainty beyond the contract text.
- Settlement/referrals shows one-step referral language only. Empty settlement site labels should display `계약 기준`, not a blank cell.
- Notifications/timeline shows only customer-safe progress messages. It must not expose SMTP errors, admin-only alerts, hidden risk details, or internal notes.

Article pages:

- Guide article detail pages render in the dark tone.
- Guide article comments and pingbacks remain closed.
- Previous/next links are readable and styled in the dark tone.
- Published guide slugs include:
  - `adsense-basic-guide`
  - `domain-before-buy-checklist`
  - `nameserver-dns-setup-guide`
  - `wordpress-required-pages`
  - `adsense-readiness-checklist`
  - `adsense-policy-violations`
  - `search-console-basic`
  - `sitemap-submission-basic`
  - `ads-txt-basic`
  - `customer-portal-guide`
  - `content-operation-routine`

Search Console:

- Wordfriends property `https://wordfriends.co.kr/` is verified with the root HTML file verification method.
- Verification file is kept at `https://wordfriends.co.kr/google1e99994f43630f74.html` and must not be deleted.
- WordPress default sitemap `https://wordfriends.co.kr/wp-sitemap.xml` opens correctly.
- Search Console sitemap submission is complete for `wp-sitemap.xml`.

Mobile:

- Hamburger menu uses the dark background and two-column button layout.
- Long Korean labels wrap without pushing outside buttons or cards.
- CTA buttons, FAQ buttons, footer email, and business information do not overflow.
- Hover/focus states do not cause layout shift.

## Deployment Routine

Use the right path based on the changed files.

Plugin-only changes:

1. Run the PHP syntax check on the Ubuntu repository copy.
2. Upload the plugin file to WordPress with FileZilla.
3. Confirm the WordPress plugin version in WordPress Admin > Plugins.
4. Refresh the affected Wordfriends pages.

API/frontend changes:

1. Pull the server repository.
2. Build the frontend.
3. Restart `boss-siteops-api`.
4. Check `/api/health`.

Combined plugin + API changes require both paths.

On the Ubuntu server:

```bash
cd /home/boss/codex-dema
git pull
php -l /home/boss/codex-dema/integrations/wordfriends-siteops-tracker/wordfriends-siteops-tracker.php
```

If frontend or API files changed:

```bash
npm run build
sudo systemctl restart boss-siteops-api
curl http://127.0.0.1:8787/api/health
curl https://siteops.09car.co.kr/api/health
```

If the Wordfriends plugin changed, upload with FileZilla:

```text
Local:  integrations/wordfriends-siteops-tracker/wordfriends-siteops-tracker.php
Remote: /wp-content/plugins/wordfriends-siteops-tracker/wordfriends-siteops-tracker.php
```

After upload, confirm:

- WordPress plugin is still active.
- WordPress Admin > Plugins shows the expected plugin version.
- Public pages still render.
- Login/register/logout shortcodes still work.
- Guide article detail pages are still dark.
- Comments remain closed on guide articles.
- If customer portal behavior changed, check a logged-in customer account and a logged-out browser session.

If database schema changed:

```bash
cd /home/boss/codex-dema
cat database/schema.sql | docker exec -i wp-automation-postgres psql -U wpauto -d wp_automation
```

## Backup Checklist

Before major changes:

- Confirm the latest git commit is pushed or recorded.
- Export the WordPress database from hosting/admin tooling.
- Download the active WordPress plugin file if the live copy may differ from git.
- Back up `/home/boss/codex-dema/.env` securely without pasting its values into chat or git.
- Confirm Docker volume name before touching PostgreSQL data.

Known PostgreSQL production values:

```text
Container: wp-automation-postgres
Database: wp_automation
User: wpauto
Volume: codex-dema_postgres_data
Volume path: /var/lib/docker/volumes/codex-dema_postgres_data/_data
```

Recommended database backup command:

```bash
docker exec wp-automation-postgres pg_dump -U wpauto -d wp_automation > boss-siteops-$(date +%Y%m%d-%H%M%S).sql
```

Store backups outside the repository.

## Post-Deploy Smoke Test

Run this quick pass after each deployment.

Server:

```bash
curl http://127.0.0.1:8787/api/health
curl https://siteops.09car.co.kr/api/health
```

WordPress:

- WordPress Admin > Plugins shows the expected Wordfriends SiteOps Tracker version.
- HOME, Services, Start Guide, Cases, Guide/FAQ, and Question pages render in the dark tone.
- Guide article detail pages render in the dark tone and do not show comments.
- Mobile hamburger menu opens as a dark two-column menu.
- Footer does not overflow and shows `talk@wordfriends.co.kr`.
- `contract-guide` and `notifications` slug labels do not appear on customer-facing pages.

Customer portal, logged out:

- Customer portal, my sites, my questions, settlement/referrals, and notifications show only the login gate.
- No shortcode text such as `[wordfriends_dashboard]` is visible.
- No customer domains, settlement data, questions, or notifications are visible.

Customer portal, logged in:

- My sites shows public status labels only. It must not show raw risk levels, site keys, credentials, proxy details, or internal notes.
- My questions shows the customer's question and public answer only.
- Contract guide shows public contract request status, public messages, and contract document links only.
- Settlement/referrals shows one-step referral language and `계약 기준` for settlements without a domain.
- Notifications shows customer-safe progress messages only.
- Every portal page keeps the no-guarantee statement visible.

## Incident Recovery Order

1. Check SiteOps health:

```bash
curl http://127.0.0.1:8787/api/health
sudo systemctl status boss-siteops-api
journalctl -u boss-siteops-api -n 100 --no-pager
```

2. Check Docker services:

```bash
docker ps
docker logs --tail 100 wp-automation-postgres
docker logs --tail 100 cloudflared-siteops
```

3. Restart only the affected service:

```bash
sudo systemctl restart boss-siteops-api
```

4. If SiteOps is healthy locally but not public, check Cloudflare Tunnel routing:

```bash
curl http://172.17.0.1:8787/api/health
```

5. If Wordfriends pages turn white or lose styling, verify the plugin upload and run PHP syntax check on the active plugin file.

6. If guide article detail pages become white, confirm the article slug, title, or category is still covered by the guide article detection list.

7. If customer portal pages show raw shortcode text, confirm the plugin is active and the page body uses a supported shortcode.

8. If customer portal data looks stale, restart `boss-siteops-api`, clear the browser cache, and recheck that the WordPress plugin endpoint/token configuration still points to `https://siteops.09car.co.kr`.

## Legal And Copy Guardrails

Never use wording that promises:

- revenue
- AdSense approval
- traffic
- search ranking
- passive income without work
- stability compared with rent or salary
- customer Google account password collection or storage

Keep these principles visible:

- Customer Google, domain, hosting, and AdSense accounts are customer-owned.
- Wordfriends provides operations support, content operations, technical support, and progress organization.
- Results depend on platform policy, content quality, market conditions, and the customer account state.
- Aged or sandbox-cleared domains are only candidate types for review.
- Multi-level referral rewards remain paused until legal review.

## Current Published Shortcodes

```text
[wordfriends_home]
[wordfriends_services]
[wordfriends_start_guide]
[wordfriends_cases]
[wordfriends_guide]
[wordfriends_question]
[wordfriends_login]
[wordfriends_signup]
[wordfriends_register]
[wordfriends_logout]
[wordfriends_portal]
[wordfriends_dashboard]
[wordfriends_my_sites]
[wordfriends_my_questions]
[wordfriends_contract_request]
[wordfriends_contract]
[wordfriends_settlement_referrals]
[wordfriends_notifications]
[wordfriends_timeline]
```

Some names may be aliases on the live WordPress pages. If a shortcode page stops rendering, check the active plugin file first, then confirm the page body shortcode in WordPress Admin.
