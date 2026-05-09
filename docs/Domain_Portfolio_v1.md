# Domain Portfolio v1

Source file:

- `C:\Users\pi\Desktop\도메인 정리 목록.xlsx`

Imported summary:

- Total domains: 68
- Korean domains/sites: 47
- English domains/sites: 21
- `DONE`: 47
- `PROCESSING`: 1
- `PENDING`: 1
- `SKIP`: 19

## Key Decision

`wordfriends.co.kr` is not a normal content site.

It should become the customer-facing BOSS portal:

- AdSense operator recruitment
- Customer login
- Customer site status
- Monthly settlement display
- Agency fee and revenue share records
- Referral/downline incentive records
- Support tickets and notices

This means it should be handled as `CUSTOMER_PORTAL`, not as an automated article-publishing domain.

## Credential Decision

The current domain list does not need `wp_credential_ref` for every unbuilt site.

For unbuilt domains, credentials do not exist yet. When a WordPress site is built, the system can generate a predictable reference such as:

- `STINGER_AUTH`
- `SJOURNAL_AUTH`
- `EMF_BIOSHIELD_AUTH`

Do not import or store real `wp_app_password` values in PostgreSQL.

## Portfolio Status Model

Use these internal statuses.

### CUSTOMER_PORTAL

For `wordfriends.co.kr`.

This site is the business portal for customers, settlements, referrals, and applications.

### INFRA_INTERNAL

Internal technical domains such as N8N tunnel or system routing domains.

These do not need AdSense or normal content operations.

### OPERATING_READY

WordPress is installed, approval is acceptable, and the domain can be managed by SiteOps.

This does not mean full auto-publishing is allowed. Publishing mode still depends on guardrail level, customer agreement, and review policy.

### SETUP_PIPELINE

The domain is pending or currently being set up.

These should appear in `wp_setup_queue`.

### RECOVERY_REVIEW

The domain is not currently operating, but should not be permanently discarded without review.

Use this for:

- Newly purchased domains that were attacked after WordPress approval
- Domains where index recovery may be possible
- Domains needing Search Console, malware, backlink, and content history checks

### HIGH_RISK_HOLD

Domains with strong spam, gambling, malware, link-farm, or black-hat contamination signals.

These should not be used for customer AdSense operations unless a separate recovery process proves they are safe.

### UNCLASSIFIED

Needs manual review.

## Recovery Review Checklist

Before reviving any skipped or previously discarded domain:

1. Check Search Console manual actions and security issues.
2. Check indexed pages and spam remnants.
3. Check current WordPress files, plugins, users, and admin accounts.
4. Check backlinks for gambling, adult, pharma, hacking, link sale, or doorway patterns.
5. Clean hosting account and reinstall WordPress from scratch if needed.
6. Remove malicious pages and request reindexing only after cleanup.
7. Keep the domain in `DRAFT_ONLY` mode until it proves stable.
8. Never place customer AdSense on a recovered domain until review passes.

## Next Schema Changes

Add or use these fields in the `sites` table:

- `portfolio_status`
- `is_customer_portal`
- `is_internal_infra`
- `recovery_status`
- `risk_level`

The current full row list has been saved here:

- [domain_portfolio_rows.md](domain_portfolio_rows.md)
