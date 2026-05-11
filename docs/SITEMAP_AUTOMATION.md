# Sitemap Automation

## Scope

The first SiteOps sitemap feature is a safe management queue.

- Google: prepare rows for Search Console API submission.
- Naver: keep manual registration and verification records until a stable public submit API is confirmed.
- Do not claim ranking, indexing, AdSense approval, or traffic guarantees.

## Google

Google Search Console provides a Sitemaps API.

- Method: `PUT`
- Endpoint pattern: `https://www.googleapis.com/webmasters/v3/sites/{siteUrl}/sitemaps/{feedpath}`
- Required scope: `https://www.googleapis.com/auth/webmasters`
- The site property must already exist in Search Console.

## Naver

Naver Search Advisor sitemap registration should be treated as manual unless an official supported API is confirmed.
Avoid browser automation for customer accounts unless the user explicitly authorizes it and the compliance risk is reviewed.

## Current Commands

After applying `database/schema.sql`, create sitemap management rows from current sites:

```bash
npm run sync:sitemaps
```

The command creates one Google candidate row and one Naver manual-review row for eligible non-critical sites.
