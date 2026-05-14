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

function keyPart(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
}

function proxyTypeFor(site) {
  if (site.is_customer_portal || site.is_internal_infra) return 'none';
  if (site.language_code === 'en') return 'datacenter';
  return 'datacenter';
}

function proxyRegionFor(site) {
  return site.language_code === 'en' ? 'US' : 'KR';
}

function proxyStatusFor(site) {
  if (site.is_customer_portal || site.is_internal_infra) return 'disabled';
  if (site.portfolio_status === 'high_risk_hold' || site.portfolio_status === 'recovery_review') return 'disabled';
  return 'planned';
}

function runtimeStatusFor(site) {
  if (site.portfolio_status === 'high_risk_hold' || site.portfolio_status === 'recovery_review') return 'disabled';
  return 'planned';
}

function qualityGateFor(site) {
  if (site.portfolio_status === 'high_risk_hold' || site.portfolio_status === 'recovery_review') return 'manual_only';
  if (site.guardrail_level === 'ymyl' || site.guardrail_level === 'high') return 'review_first';
  return 'auto_draft_only';
}

function styleProfileFor(site) {
  const category = site.category_slug || site.monetize_mode || 'general';
  const language = site.language_code || 'ko';
  return `${language}_${keyPart(category) || 'general'}_editorial`;
}

function trustStageFor(site) {
  if (site.portfolio_status === 'high_risk_hold') return 'paused';
  if (site.portfolio_status === 'recovery_review') return 'index_watch';
  if (site.portfolio_status === 'setup_pipeline' || site.portfolio_status === 'unclassified') return 'incubating';
  if (site.approval_status === 'approved') return 'monetization_review';
  return 'content_build';
}

function trustStatusFor(site) {
  if (site.portfolio_status === 'high_risk_hold') return 'rejected';
  if (site.portfolio_status === 'recovery_review') return 'paused';
  return 'active';
}

function trustScoreFor(site) {
  const dr = Number(site.dr_score || 0);
  const riskBase = {
    low: 62,
    medium: 45,
    high: 24,
    critical: 8,
    unknown: 35,
  }[site.risk_level || 'unknown'] ?? 35;
  const portfolioBonus = site.portfolio_status === 'operating_ready' ? 10 : site.portfolio_status === 'setup_pipeline' ? 3 : 0;
  const approvalBonus = site.approval_status === 'approved' ? 8 : 0;
  const guardrailPenalty = site.guardrail_level === 'ymyl' ? 8 : site.guardrail_level === 'high' ? 4 : 0;
  return Math.max(0, Math.min(100, Math.round(riskBase + dr * 0.8 + portfolioBonus + approvalBonus - guardrailPenalty)));
}

function nextTrustActionFor(site) {
  if (site.portfolio_status === 'high_risk_hold') return 'Keep locked until manual evidence review is complete.';
  if (site.portfolio_status === 'recovery_review') return 'Review archive, backlink quality, Search Console ownership, and reindexing evidence.';
  if (site.guardrail_level === 'ymyl' || site.guardrail_level === 'high') {
    return 'Build reviewed drafts only; require human approval before publish.';
  }
  if (site.portfolio_status === 'setup_pipeline') return 'Finish WP setup, required pages, sitemap, and initial draft queue.';
  return 'Build editorial content, index evidence, and authority reference coverage.';
}

async function main() {
  const client = await pool.connect();

  try {
    await client.query('begin');

    const { rows: sites } = await client.query(`
      select id, site_key, domain, language_code, category_slug, portfolio_status,
        risk_level, guardrail_level, approval_status, monetize_mode, dr_score,
        is_customer_portal, is_internal_infra
      from sites
      where status in ('active', 'draft', 'paused')
      order by sheet_row_id nulls last, domain
    `);

    let proxyCount = 0;
    let runtimeCount = 0;
    let trustCount = 0;

    for (const site of sites) {
      const siteKey = keyPart(site.site_key || site.domain);
      const proxyStatus = proxyStatusFor(site);
      const proxyProfileKey = `proxy_${siteKey}`;
      const credentialRef = proxyStatus === 'disabled' ? 'not_required' : `n8n_credential_proxy_${siteKey}`;

      await client.query(
        `
          insert into site_proxy_assignments (
            site_id, proxy_profile_key, proxy_provider, proxy_type, proxy_region,
            egress_policy, credential_ref, status, notes, updated_at
          )
          values ($1, $2, 'manual', $3, $4, $5, $6, $7, $8, now())
          on conflict (site_id) do update set
            proxy_type = case
              when excluded.status = 'disabled' then excluded.proxy_type
              else site_proxy_assignments.proxy_type
            end,
            proxy_region = case
              when site_proxy_assignments.status = 'planned' then excluded.proxy_region
              else site_proxy_assignments.proxy_region
            end,
            egress_policy = excluded.egress_policy,
            status = case
              when excluded.status = 'disabled' then 'disabled'
              else site_proxy_assignments.status
            end,
            notes = excluded.notes,
            updated_at = now()
        `,
        [
          site.id,
          proxyProfileKey,
          proxyTypeFor(site),
          proxyRegionFor(site),
          proxyStatus === 'disabled' ? 'disabled' : 'wp_publish_only',
          credentialRef,
          proxyStatus,
          'Readiness seed only. Store proxy secrets in N8N Credentials or server environment variables, not PostgreSQL.',
        ],
      );
      proxyCount += 1;

      await client.query(
        `
          insert into site_runtime_profiles (
            site_id, request_profile_key, user_agent_label, publish_window_start,
            publish_window_end, max_posts_per_day, style_profile, quality_gate,
            status, notes, updated_at
          )
          values ($1, $2, $3, 9, 21, $4, $5, $6, $7, $8, now())
          on conflict (site_id) do update set
            user_agent_label = excluded.user_agent_label,
            max_posts_per_day = excluded.max_posts_per_day,
            style_profile = excluded.style_profile,
            quality_gate = excluded.quality_gate,
            status = case
              when excluded.status = 'disabled' then 'disabled'
              else site_runtime_profiles.status
            end,
            notes = excluded.notes,
            updated_at = now()
        `,
        [
          site.id,
          `runtime_${siteKey}`,
          `siteops-${site.language_code || 'ko'}-${keyPart(site.category_slug || site.monetize_mode || 'general') || 'general'}`,
          site.guardrail_level === 'ymyl' || site.guardrail_level === 'high' ? 1 : 2,
          styleProfileFor(site),
          qualityGateFor(site),
          runtimeStatusFor(site),
          'Runtime profile for N8N publishing cadence, review gate, and editorial style variation. It is an operations control, not a guarantee.',
        ],
      );
      runtimeCount += 1;

      await client.query(
        `
          insert into site_trust_plans (
            site_id, plan_stage, trust_score, content_target, indexed_target,
            authority_outbound_target, outbound_policy, next_action, status,
            notes, updated_at
          )
          values ($1, $2, $3, 30, 10, 5, 'editorial_reference_only', $4, $5, $6, now())
          on conflict (site_id) do update set
            plan_stage = excluded.plan_stage,
            trust_score = excluded.trust_score,
            outbound_policy = excluded.outbound_policy,
            next_action = excluded.next_action,
            status = excluded.status,
            notes = excluded.notes,
            updated_at = now()
        `,
        [
          site.id,
          trustStageFor(site),
          trustScoreFor(site),
          nextTrustActionFor(site),
          trustStatusFor(site),
          'Trust plan is for incubation tracking: required pages, content quality, index evidence, and natural authority references.',
        ],
      );
      trustCount += 1;
    }

    await client.query('commit');
    console.log(`Synced readiness rows. proxy=${proxyCount}, runtime=${runtimeCount}, trust=${trustCount}, sites=${sites.length}`);
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
