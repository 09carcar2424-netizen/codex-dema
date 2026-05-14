import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required. Put it in .env or export it before running this script.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

function formatRows(rows, columns) {
  if (!rows.length) return '(none)';

  const widths = columns.map((column) => Math.max(
    column.length,
    ...rows.map((row) => String(row[column] ?? '').length),
  ));

  const line = columns.map((column, index) => String(column).padEnd(widths[index])).join(' | ');
  const sep = widths.map((width) => '-'.repeat(width)).join('-+-');
  const body = rows.map((row) => columns
    .map((column, index) => String(row[column] ?? '').padEnd(widths[index]))
    .join(' | '));

  return [line, sep, ...body].join('\n');
}

const client = await pool.connect();

try {
  const summary = await client.query(`
    select
      coalesce(s.status, 'unknown') as site_status,
      coalesce(s.portfolio_status, 'unknown') as portfolio_status,
      count(*)::int as sites,
      count(spa.id)::int as proxy_rows,
      count(srp.site_id)::int as runtime_rows,
      count(stp.id)::int as trust_rows
    from sites s
    left join site_proxy_assignments spa on spa.site_id = s.id
    left join site_runtime_profiles srp on srp.site_id = s.id
    left join site_trust_plans stp on stp.site_id = s.id
    group by s.status, s.portfolio_status
    order by s.status, s.portfolio_status
  `);

  const missing = await client.query(`
    select
      s.domain,
      s.status as site_status,
      s.portfolio_status,
      s.risk_level,
      s.guardrail_level,
      case
        when s.status = 'archived' then 'excluded_archived'
        when s.portfolio_status = 'high_risk_hold' then 'excluded_high_risk'
        when spa.id is null then 'missing_proxy'
        when srp.site_id is null then 'missing_runtime'
        when stp.id is null then 'missing_trust'
        else 'ready'
      end as readiness_reason
    from sites s
    left join site_proxy_assignments spa on spa.site_id = s.id
    left join site_runtime_profiles srp on srp.site_id = s.id
    left join site_trust_plans stp on stp.site_id = s.id
    where spa.id is null or srp.site_id is null or stp.id is null or s.status = 'archived'
    order by readiness_reason, s.domain
  `);

  const totals = await client.query(`
    select
      count(*)::int as total_sites,
      count(*) filter (where status in ('active', 'draft', 'paused'))::int as sync_eligible,
      count(*) filter (where status = 'archived')::int as archived,
      count(*) filter (where portfolio_status = 'high_risk_hold')::int as high_risk_hold,
      count(spa.id)::int as proxy_rows,
      count(srp.site_id)::int as runtime_rows,
      count(stp.id)::int as trust_rows
    from sites s
    left join site_proxy_assignments spa on spa.site_id = s.id
    left join site_runtime_profiles srp on srp.site_id = s.id
    left join site_trust_plans stp on stp.site_id = s.id
  `);

  console.log('\nSiteOps readiness totals');
  console.log(formatRows(totals.rows, [
    'total_sites',
    'sync_eligible',
    'archived',
    'high_risk_hold',
    'proxy_rows',
    'runtime_rows',
    'trust_rows',
  ]));

  console.log('\nReadiness by site status / portfolio status');
  console.log(formatRows(summary.rows, [
    'site_status',
    'portfolio_status',
    'sites',
    'proxy_rows',
    'runtime_rows',
    'trust_rows',
  ]));

  console.log('\nExcluded or incomplete sites');
  console.log(formatRows(missing.rows, [
    'domain',
    'site_status',
    'portfolio_status',
    'risk_level',
    'guardrail_level',
    'readiness_reason',
  ]));
} finally {
  client.release();
  await pool.end();
}
