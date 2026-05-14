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

function hasHardBadSignal(row) {
  const memo = String(row.memo || '').toLowerCase();
  return ['도박', '비아그라', '웹툰', '스팸', '해킹', '어뷰징', '링크판매'].some((word) => memo.includes(word));
}

function renewalDecisionFor(row) {
  const score = Number(row.overall_score ?? 0);
  const spam = Number(row.spam_score ?? 0);

  if (row.ownership_type === 'customer_owned') {
    return {
      renewalDecision: 'manual_review',
      decisionReason: 'customer_owned',
      evidenceRequired: true,
      customerExposureAllowed: false,
      automationAllowed: false,
      nextAction: 'Confirm customer renewal ownership and payment status before any operation.',
    };
  }

  if (row.portfolio_status === 'high_risk_hold' || row.risk_level === 'critical') {
    if (score <= 20 && spam <= 10 && hasHardBadSignal(row)) {
      return {
        renewalDecision: 'do_not_renew',
        decisionReason: 'discard_candidate',
        evidenceRequired: true,
        customerExposureAllowed: false,
        automationAllowed: false,
        nextAction: 'Do not renew unless manual evidence proves exceptional recovery value.',
      };
    }

    return {
      renewalDecision: 'manual_review',
      decisionReason: 'quarantine_review',
      evidenceRequired: true,
      customerExposureAllowed: false,
      automationAllowed: false,
      nextAction: 'Keep isolated. Review archive, backlinks, trademark, index status, and niche match.',
    };
  }

  if (['rejected', 'hold'].includes(row.inventory_status) || ['reject', 'hold'].includes(row.final_grade)) {
    return {
      renewalDecision: 'hold',
      decisionReason: 'spam_risk',
      evidenceRequired: true,
      customerExposureAllowed: false,
      automationAllowed: false,
      nextAction: 'Hold renewal until manual audit evidence is attached.',
    };
  }

  if (row.portfolio_status === 'operating_ready' && row.risk_level === 'low') {
    return {
      renewalDecision: 'renew',
      decisionReason: 'safe_operating_asset',
      evidenceRequired: false,
      customerExposureAllowed: false,
      automationAllowed: true,
      nextAction: 'Renew unless registrar, ownership, or DNS evidence shows a new issue.',
    };
  }

  return {
    renewalDecision: 'manual_review',
    decisionReason: 'manual_review_required',
    evidenceRequired: true,
    customerExposureAllowed: false,
    automationAllowed: false,
    nextAction: 'Review registrar, DNS, category fit, and audit evidence before renewal.',
  };
}

async function main() {
  const client = await pool.connect();

  try {
    await client.query('begin');

    const { rows } = await client.query(`
      select
        s.id as site_id,
        s.domain,
        s.portfolio_status,
        s.risk_level,
        s.memo,
        di.id as inventory_id,
        di.ownership_type,
        di.inventory_status,
        di.offer_status,
        da.final_grade,
        da.overall_score,
        da.spam_score
      from sites s
      left join domain_inventory di on di.site_id = s.id
      left join lateral (
        select *
        from domain_audits da
        where da.inventory_id = di.id
        order by da.created_at desc
        limit 1
      ) da on true
      order by s.domain
    `);

    const counts = new Map();

    for (const row of rows) {
      const decision = renewalDecisionFor(row);
      counts.set(decision.renewalDecision, (counts.get(decision.renewalDecision) || 0) + 1);

      await client.query(
        `
          insert into domain_renewal_decisions (
            site_id, inventory_id, domain, renewal_decision, decision_reason,
            evidence_required, customer_exposure_allowed, automation_allowed,
            next_action, decided_by, decided_at, updated_at
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'system', now(), now())
          on conflict (domain) do update set
            site_id = excluded.site_id,
            inventory_id = excluded.inventory_id,
            renewal_decision = excluded.renewal_decision,
            decision_reason = excluded.decision_reason,
            evidence_required = excluded.evidence_required,
            customer_exposure_allowed = excluded.customer_exposure_allowed,
            automation_allowed = excluded.automation_allowed,
            next_action = excluded.next_action,
            decided_by = 'system',
            decided_at = now(),
            updated_at = now()
        `,
        [
          row.site_id,
          row.inventory_id,
          row.domain,
          decision.renewalDecision,
          decision.decisionReason,
          decision.evidenceRequired,
          decision.customerExposureAllowed,
          decision.automationAllowed,
          decision.nextAction,
        ],
      );
    }

    await client.query('commit');
    console.log(`Synced renewal decisions for ${rows.length} domains.`);
    for (const [decision, count] of [...counts.entries()].sort()) {
      console.log(`${decision}=${count}`);
    }
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
