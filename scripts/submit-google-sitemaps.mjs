import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GSC_BASE_URL = 'https://www.googleapis.com/webmasters/v3';

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function getAccessToken() {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: requiredEnv('GOOGLE_CLIENT_ID'),
      client_secret: requiredEnv('GOOGLE_CLIENT_SECRET'),
      refresh_token: requiredEnv('GOOGLE_REFRESH_TOKEN'),
      grant_type: 'refresh_token',
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error_description || payload.error || 'Failed to refresh Google access token.');
  }
  return payload.access_token;
}

async function submitSitemap(row, accessToken) {
  const siteUrl = encodeURIComponent(row.property_url || `https://${row.domain}/`);
  const feedPath = encodeURIComponent(row.sitemap_url);
  const response = await fetch(`${GSC_BASE_URL}/sites/${siteUrl}/sitemaps/${feedPath}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (response.ok) return { ok: true, message: 'Submitted to Google Search Console.' };

  const text = await response.text();
  return { ok: false, message: text || `Google API returned HTTP ${response.status}` };
}

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required. Set it in .env or the shell environment.');
}

const limit = Number(process.argv[2] || process.env.GOOGLE_SITEMAP_SUBMIT_LIMIT || 10);
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

const accessToken = await getAccessToken();
const client = await pool.connect();

try {
  const { rows } = await client.query(
    `
      select id, domain, sitemap_url, property_url
      from sitemap_submissions
      where search_engine = 'google'
        and submission_status in ('ready', 'failed')
      order by updated_at asc
      limit $1
    `,
    [limit],
  );

  let successCount = 0;
  let failedCount = 0;

  for (const row of rows) {
    const result = await submitSitemap(row, accessToken);
    if (result.ok) successCount += 1;
    else failedCount += 1;

    await client.query(
      `
        update sitemap_submissions
        set submission_status = $2,
          submission_mode = 'api',
          last_submitted_at = case when $2 = 'submitted' then now() else last_submitted_at end,
          last_checked_at = now(),
          response_message = $3,
          updated_at = now()
        where id = $1
      `,
      [row.id, result.ok ? 'submitted' : 'failed', result.message],
    );

    console.log(`${result.ok ? 'OK' : 'FAIL'} ${row.domain} ${row.sitemap_url}`);
  }

  console.log(`Google sitemap submit complete. submitted=${successCount}, failed=${failedCount}, total=${rows.length}`);
} finally {
  client.release();
  await pool.end();
}
