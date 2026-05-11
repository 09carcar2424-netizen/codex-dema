import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

function getTldType(domain) {
  if (domain.endsWith('.co.kr') || domain.endsWith('.kr')) return 'kr';
  const match = domain.match(/\.([a-z]+)$/i);
  return match ? match[1].toLowerCase() : 'unknown';
}

function deriveAcquisitionType(site) {
  if (site.is_customer_portal || site.is_internal_infra) return 'unknown';
  if (site.portfolio_status === 'high_risk_hold' || site.portfolio_status === 'recovery_review') {
    return 'expired_domain';
  }
  if (site.dr_score !== null && Number(site.dr_score) > 0) return 'aged_domain';
  return 'unknown';
}

function deriveInventoryStatus(site) {
  if (site.portfolio_status === 'high_risk_hold') return 'rejected';
  if (site.portfolio_status === 'recovery_review') return 'hold';
  if (site.portfolio_status === 'setup_pipeline') return 'internal_review';
  if (site.portfolio_status === 'operating_ready') return 'operating_first';
  return 'internal_review';
}

function deriveOfferStatus(site, inventoryStatus) {
  if (inventoryStatus === 'rejected' || inventoryStatus === 'hold') return 'withdrawn';
  if (site.is_customer_portal || site.is_internal_infra) return 'not_listed';
  if (inventoryStatus === 'operating_first') return 'internal_only';
  return 'not_listed';
}

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function scoreFromDr(drScore) {
  if (drScore === null || drScore === undefined) return 45;
  const dr = Number(drScore);
  if (!Number.isFinite(dr)) return 45;
  return clampScore(35 + dr * 2);
}

function deriveAudit(site, inventoryStatus) {
  const baseByRisk = {
    low: 75,
    medium: 55,
    high: 30,
    critical: 10,
    unknown: 45,
  };
  const base = baseByRisk[site.risk_level] ?? 45;
  const backlinkScore = scoreFromDr(site.dr_score);
  const indexScore = site.approval_status === 'approved' ? 72 : inventoryStatus === 'rejected' ? 10 : 45;
  const spamScore = site.risk_level === 'critical' ? 5 : site.risk_level === 'high' ? 25 : site.risk_level === 'medium' ? 62 : 82;
  const historyScore = inventoryStatus === 'rejected' ? 15 : inventoryStatus === 'hold' ? 35 : base;
  const overallScore = clampScore(historyScore * 0.3 + spamScore * 0.3 + backlinkScore * 0.2 + indexScore * 0.2);

  let finalGrade = 'watch';
  if (inventoryStatus === 'rejected') finalGrade = 'reject';
  else if (inventoryStatus === 'hold') finalGrade = 'hold';
  else if (overallScore >= 75 && site.risk_level === 'low') finalGrade = 'safe_candidate';

  return {
    auditStatus: finalGrade === 'safe_candidate' ? 'checked' : finalGrade === 'reject' ? 'rejected' : 'needs_review',
    historyScore,
    spamScore,
    backlinkScore,
    indexScore,
    overallScore,
    finalGrade,
    trademarkRisk: inventoryStatus === 'rejected' ? 'medium' : 'unknown',
    ymylRiskLevel: site.guardrail_level === 'ymyl' ? 'high' : site.guardrail_level === 'high' ? 'medium' : 'low',
    manualReviewRequired: finalGrade !== 'safe_candidate',
    evidenceAttached: false,
  };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required. Put it in .env or export it before running this script.');
  }

  const client = await pool.connect();

  try {
    await client.query('begin');

    const sites = await client.query(`
      select id, domain, language_code, portfolio_status, risk_level, guardrail_level,
        approval_status, dr_score, monetize_mode, is_customer_portal, is_internal_infra, memo
      from sites
      order by sheet_row_id nulls last, domain
    `);

    let inventoryCount = 0;
    let auditCount = 0;

    for (const site of sites.rows) {
      const inventoryStatus = deriveInventoryStatus(site);
      const offerStatus = deriveOfferStatus(site, inventoryStatus);
      const audit = deriveAudit(site, inventoryStatus);

      const inventoryResult = await client.query(
        `
          insert into domain_inventory (
            site_id, domain, ownership_type, acquisition_type, tld_type,
            language_priority, category_fit, inventory_status, offer_status,
            public_listing_allowed, revenue_guarantee_forbidden,
            adsense_guarantee_forbidden, risk_disclosure_required, memo, updated_at
          )
          values (
            $1, $2, 'boss_owned', $3, $4,
            $5, $6, $7, $8,
            false, true,
            true, true, $9, now()
          )
          on conflict (domain) do update set
            site_id = excluded.site_id,
            acquisition_type = excluded.acquisition_type,
            tld_type = excluded.tld_type,
            language_priority = excluded.language_priority,
            category_fit = excluded.category_fit,
            inventory_status = excluded.inventory_status,
            offer_status = excluded.offer_status,
            public_listing_allowed = excluded.public_listing_allowed,
            revenue_guarantee_forbidden = true,
            adsense_guarantee_forbidden = true,
            risk_disclosure_required = true,
            memo = excluded.memo,
            updated_at = now()
          returning id
        `,
        [
          site.id,
          site.domain,
          deriveAcquisitionType(site),
          getTldType(site.domain),
          site.language_code,
          site.monetize_mode || site.portfolio_status,
          inventoryStatus,
          offerStatus,
          site.memo,
        ],
      );

      const inventoryId = inventoryResult.rows[0].id;

      await client.query('delete from domain_audits where inventory_id = $1', [inventoryId]);
      await client.query(
        `
          insert into domain_audits (
            inventory_id, audit_status, history_score, spam_score,
            backlink_score, index_score, trademark_risk, ymyl_risk_level,
            overall_score, final_grade, manual_review_required,
            evidence_attached, notes, checked_at, updated_at
          )
          values (
            $1, $2, $3, $4,
            $5, $6, $7, $8,
            $9, $10, $11,
            $12, $13, now(), now()
          )
        `,
        [
          inventoryId,
          audit.auditStatus,
          audit.historyScore,
          audit.spamScore,
          audit.backlinkScore,
          audit.indexScore,
          audit.trademarkRisk,
          audit.ymylRiskLevel,
          audit.overallScore,
          audit.finalGrade,
          audit.manualReviewRequired,
          audit.evidenceAttached,
          'Initial rules-based audit. External evidence such as Ahrefs, Search Console, archive history, and manual screenshots should be attached before public listing.',
        ],
      );

      inventoryCount += 1;
      auditCount += 1;
    }

    await client.query('commit');
    console.log(`Synced ${inventoryCount} domain inventory rows and ${auditCount} audit rows.`);
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
