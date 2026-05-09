# Security Operations v1

## Core Principle

Security and policy safety are not separate add-ons. They are part of the platform architecture.

BOSS SiteOps should optimize for:

- customer-owned accounts
- least privilege
- auditable operations
- review-before-publish for risky content
- official APIs where possible
- isolation for reliability and damage control

It should not optimize for:

- hiding ownership
- evading platform detection
- artificial traffic or click behavior
- mass identical publishing

## Secrets Handling

Never store these in PostgreSQL:

- WordPress Application Password
- N8N credentials
- Google OAuth client secret
- Cloudflare API token
- registrar API key
- database password
- SSH private key

Store only references:

- `wp_credential_ref`
- `wp_secret_ref`
- `n8n_credential_ref`
- `cloudflare_token_ref`

Actual secrets should live in:

- N8N Credentials
- Ubuntu `.env` files with strict permissions
- server environment variables
- a secret manager when the system grows

Ubuntu file rule:

```bash
chmod 600 .env
```

## Server Hardening

Recommended Ubuntu baseline:

- SSH key login only
- password login disabled
- root SSH disabled
- UFW firewall enabled
- only 22, 80, 443, and required internal ports exposed
- fail2ban enabled
- unattended security updates enabled
- N8N and PostgreSQL not publicly exposed
- PostgreSQL bound to localhost or private network
- daily encrypted backups
- separate backup account
- Cloudflare WAF and DNS proxy for public sites

## WordPress Hardening

For every WordPress site:

- unique admin username
- unique Application Password
- least-privilege automation user
- no shared admin password across sites
- disable file editing in wp-admin
- remove unused themes/plugins
- install security plugin only if it does not conflict with automation
- enforce updates for critical plugins
- schedule malware scan
- keep audit logs
- use separate `wp_credential_ref` per site

## Automation and IP Guidance

Do not use IP rotation to hide behavior from Google, Naver, or other platforms.

Use separation for legitimate reasons:

- customer account isolation
- security blast-radius control
- rate-limit management
- uptime and capacity
- regional latency
- server failure containment

Recommended approach:

- one central BOSS SiteOps control server
- N8N worker server for automation
- PostgreSQL private database
- per-customer OAuth or delegated access where needed
- official APIs for Search Console when available
- manual customer verification when API automation would require unsafe credential sharing
- conservative queue rate limits

Avoid:

- logging into many unrelated customer Google accounts from one browser profile
- reusing one Google account for all customer properties
- mass identical Search Console submission patterns
- storing customer Google credentials

## Google and Naver Search Registration

Preferred model:

- customer owns the Google account
- customer grants property access or completes verification
- BOSS stores property status, not credentials
- SiteOps queues indexing requests conservatively

For Naver:

- use official webmaster tools/API where available
- if automation requires customer credentials, prefer manual verification instead
- do not store plain credentials

## Operational Rate Limits

Use queues and limits:

- WordPress setup jobs: small batches
- Search registration: small batches per account/property
- content generation: rate-limited by model/provider
- publishing: review-gated for new/YMYL/recovered domains
- image generation: retry with backoff

## Incident Response

Every site should have:

- last clean backup
- last malware scan time
- Search Console security status
- WordPress users audit
- plugin/theme audit
- recovery notes

Incident states:

- `suspected`
- `contained`
- `cleaning`
- `reindex_requested`
- `recovered`
- `rejected`

Recovered domains should remain `DRAFT_ONLY` until stable.
