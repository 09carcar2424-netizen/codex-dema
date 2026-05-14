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

  const head = columns.map((column, index) => column.padEnd(widths[index])).join(' | ');
  const sep = widths.map((width) => '-'.repeat(width)).join('-+-');
  const body = rows.map((row) => columns
    .map((column, index) => String(row[column] ?? '').padEnd(widths[index]))
    .join(' | '));

  return [head, sep, ...body].join('\n');
}

function classify(row) {
  const score = Number(row.overall_score ?? 0);
  const spam = Number(row.spam_score ?? 0);
  const index = Number(row.index_score ?? 0);
  const memo = String(row.memo || '').toLowerCase();

  const hardBadSignals = ['도박', '비아그라', '웹툰', '스팸', '해킹', '어뷰징', '링크판매'];
  const hasHardBadSignal = hardBadSignals.some((word) => memo.includes(word));

  if (score <= 20 && spam <= 10 && hasHardBadSignal) {
    return {
      decision: 'discard_candidate',
      nextAction: 'Do not renew unless manual evidence proves recovery value.',
    };
  }

  if (score <= 25 && hasHardBadSignal) {
    return {
      decision: 'deep_quarantine',
      nextAction: 'Keep isolated. Check archive, backlinks, trademark, and index before any rebuild.',
    };
  }

  if (index >= 10 || score >= 25) {
    return {
      decision: 'manual_recovery_review',
      nextAction: 'Run evidence review: Search Console ownership, archive history, backlinks, and niche match.',
    };
  }

  return {
    decision: 'quarantine_hold',
    nextAction: 'Hold locked. No customer exposure, no monetization, no automatic publishing.',
  };
}

const client = await pool.connect();

try {
  const { rows } = await client.query(`
    select
      s.domain,
      s.status as site_status,
      s.portfolio_status,
      s.risk_level,
      s.guardrail_level,
      s.recovery_status,
      di.acquisition_type,
      di.inventory_status,
      di.offer_status,
      da.final_grade,
      da.overall_score,
      da.spam_score,
      da.backlink_score,
      da.index_score,
      s.memo
    from sites s
    left join domain_inventory di on di.site_id = s.id
    left join lateral (
      select *
      from domain_audits da
      where da.inventory_id = di.id
      order by da.created_at desc
      limit 1
    ) da on true
    where s.portfolio_status = 'high_risk_hold'
       or s.status = 'archived'
       or s.risk_level = 'critical'
    order by coalesce(da.overall_score, 0) asc, s.domain
  `);

  const classified = rows.map((row) => ({
    ...row,
    ...classify(row),
  }));

  const summaryMap = new Map();
  for (const row of classified) {
    summaryMap.set(row.decision, (summaryMap.get(row.decision) || 0) + 1);
  }
  const summary = [...summaryMap.entries()].map(([decision, count]) => ({ decision, count }));

  console.log('\nDomain quarantine summary');
  console.log(formatRows(summary, ['decision', 'count']));

  console.log('\nDomain quarantine review queue');
  console.log(formatRows(classified, [
    'domain',
    'decision',
    'site_status',
    'risk_level',
    'final_grade',
    'overall_score',
    'spam_score',
    'index_score',
    'nextAction',
  ]));

  console.log('\nPolicy');
  console.log('- These domains stay excluded from readiness, customer exposure, monetization, and automated publishing.');
  console.log('- Move one domain out of quarantine only after manual evidence review and a deliberate status change.');
} finally {
  client.release();
  await pool.end();
}
