# Google Search Console API Setup

This project uses one BOSS-owned Google account first:

```text
news122488@gmail.com
```

Use this only for BOSS-owned domains at the MVP stage.
For customer-owned domains, the customer should keep ownership and invite the BOSS account or connect with OAuth later.

## Google Cloud

1. Open Google Cloud Console with `news122488@gmail.com`.
2. Create or select a project for BOSS SiteOps.
3. Enable **Google Search Console API**.
4. Configure OAuth consent screen.
5. Create an OAuth client for a web application.
6. Add this authorized redirect URI:

```text
https://siteops.09car.co.kr/api/google/search-console/callback
```

## Ubuntu `.env`

Store these values only in `/home/boss/codex-dema/.env`:

```text
GOOGLE_CLIENT_ID=<CLIENT_ID>
GOOGLE_CLIENT_SECRET=<CLIENT_SECRET>
GOOGLE_REDIRECT_URI=https://siteops.09car.co.kr/api/google/search-console/callback
```

Do not commit these values.

## Get Refresh Token

After setting `GOOGLE_CLIENT_ID` and restarting the API, open:

```text
https://siteops.09car.co.kr/api/google/search-console/auth-url
```

Copy the `authUrl` value, open it in the browser, and approve access with `news122488@gmail.com`.
The callback page will show a refresh token.

Add it to `.env`:

```text
GOOGLE_REFRESH_TOKEN=<REFRESH_TOKEN>
```

Then restart:

```bash
sudo systemctl restart boss-siteops-api
```

## Submit Sitemap Queue

Run a small batch first:

```bash
npm run submit:sitemaps:google -- 5
```

If successful, the script updates `sitemap_submissions` rows from `ready` to `submitted`.

## Safety Rules

- Do not submit every domain at once.
- Submit only prepared domains with working sitemap, legal pages, and no critical risk flag.
- Submission is not indexing, ranking, traffic, or AdSense approval.
- Failed rows should be manually reviewed before retrying.
