import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

function sitemapUrlFor(row) {
  const baseUrl = (row.wp_base_url || `https://${row.domain}`).replace(/\/+$/, '');
  return `${baseUrl}/sitemap.xml`;
}

function propertyUrlFor(row) {
  return (row.wp_base_url || `https://${row.domain}`).replace(/\/+$/, '/');
}

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required. Set it in .env or the shell environment.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

const client = await pool.connect();

try {
  await client.query('begin');
  const { rows } = await client.query(`
    select s.id as site_id, s.site_key, s.domain, wc.wp_base_url
    from sites s
    left join wordpress_connections wc on wc.site_id = s.id
    where s.status in ('active', 'draft')
      and s.portfolio_status in ('operating_ready', 'setup_pipeline', 'unclassified')
      and s.risk_level <> 'critical'
    order by s.domain
  `);

  let insertedOrUpdated = 0;

  for (const row of rows) {
    const sitemapUrl = sitemapUrlFor(row);
    const propertyUrl = propertyUrlFor(row);

    await client.query(
      `
        insert into sitemap_submissions (
          site_id, site_key, domain, sitemap_url, search_engine, property_url,
          submission_mode, submission_status, notes, updated_at
        )
        values ($1, $2, $3, $4, 'google', $5, 'pending_api', 'ready',
          'Google Search Console API 연결 후 자동 제출 대상', now())
        on conflict (domain, search_engine) do update set
          site_id = excluded.site_id,
          site_key = excluded.site_key,
          sitemap_url = excluded.sitemap_url,
          property_url = excluded.property_url,
          updated_at = now()
      `,
      [row.site_id, row.site_key, row.domain, sitemapUrl, propertyUrl],
    );

    await client.query(
      `
        insert into sitemap_submissions (
          site_id, site_key, domain, sitemap_url, search_engine, property_url,
          submission_mode, submission_status, notes, updated_at
        )
        values ($1, $2, $3, $4, 'naver', $5, 'manual', 'manual_required',
          '네이버는 공개 제출 API 확인 전까지 수동 등록/검수 대상으로 관리', now())
        on conflict (domain, search_engine) do update set
          site_id = excluded.site_id,
          site_key = excluded.site_key,
          sitemap_url = excluded.sitemap_url,
          property_url = excluded.property_url,
          updated_at = now()
      `,
      [row.site_id, row.site_key, row.domain, sitemapUrl, propertyUrl],
    );

    insertedOrUpdated += 2;
  }

  await client.query('commit');
  console.log(`Synced ${insertedOrUpdated} sitemap submission rows for ${rows.length} sites.`);
} catch (error) {
  await client.query('rollback');
  throw error;
} finally {
  client.release();
  await pool.end();
}
