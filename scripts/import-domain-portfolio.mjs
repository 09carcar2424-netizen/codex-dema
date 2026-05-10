import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const portfolioPath = path.join(rootDir, 'docs', 'domain_portfolio_rows.md');
const schemaPath = path.join(rootDir, 'database', 'schema.sql');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

function cleanCell(value) {
  const trimmed = value.trim();
  return trimmed === '' || trimmed === '-' ? null : trimmed;
}

function parseTable(markdown) {
  return markdown
    .split('\n')
    .filter((line) => line.startsWith('|') && !line.includes('---'))
    .slice(1)
    .map((line) => {
      const cells = line.split('|').slice(1, -1).map(cleanCell);
      return {
        row: Number(cells[0]),
        domain: cells[1],
        lang: cells[2],
        rawPortfolioStatus: cells[3],
        approval: cells[4],
        setup: cells[5],
        monetize: cells[6],
        dr: cells[7] === null ? null : Number(cells[7]),
        memo: cells[8] || '',
      };
    })
    .filter((row) => row.row && row.domain);
}

function toSiteKey(domain) {
  return domain
    .replace(/^www\./, '')
    .replace(/\.[a-z.]+$/i, '')
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

function toCredentialRef(domain) {
  return `${toSiteKey(domain).toUpperCase()}_AUTH`;
}

function toSetupStatus(setup) {
  const normalized = setup?.toUpperCase();
  if (normalized === 'DONE') return 'done';
  if (normalized === 'PROCESSING') return 'processing';
  if (normalized === 'PENDING') return 'pending';
  if (normalized === 'SKIP') return 'skip';
  return 'pending';
}

function hasHighRiskSignal(row) {
  return /스팸|도박|해킹|비아그라|링크판매|링크 농장|블랙햇|악성|오염|폐기|회생 불가/i.test(
    `${row.approval || ''} ${row.memo || ''}`,
  );
}

function classifyPortfolio(row) {
  const raw = row.rawPortfolioStatus?.toUpperCase();

  if (row.domain === 'wordfriends.co.kr') return 'customer_portal';
  if (row.domain === '09car.co.kr' || raw === 'INFRA_INTERNAL') return 'infra_internal';
  if (raw === 'SETUP_PIPELINE' || ['PROCESSING', 'PENDING'].includes(row.setup?.toUpperCase())) {
    return 'setup_pipeline';
  }
  if (hasHighRiskSignal(row)) return 'high_risk_hold';
  if (raw === 'RECOVERY_REVIEW') return 'recovery_review';
  if (row.setup?.toUpperCase() === 'DONE' && row.approval === '합격') return 'operating_ready';
  return 'unclassified';
}

function deriveRiskLevel(row, portfolioStatus) {
  if (portfolioStatus === 'high_risk_hold') return 'critical';
  if (portfolioStatus === 'recovery_review') return 'high';
  if (portfolioStatus === 'setup_pipeline') return 'medium';
  if (row.dr !== null && row.dr < 1) return 'medium';
  return 'low';
}

function deriveRecoveryStatus(portfolioStatus) {
  if (portfolioStatus === 'high_risk_hold') return 'rejected';
  if (portfolioStatus === 'recovery_review') return 'needs_review';
  return 'not_needed';
}

function deriveSiteStatus(portfolioStatus) {
  if (portfolioStatus === 'operating_ready' || portfolioStatus === 'customer_portal') return 'active';
  if (portfolioStatus === 'infra_internal') return 'paused';
  if (portfolioStatus === 'high_risk_hold') return 'archived';
  return 'draft';
}

function deriveGuardrail(row, portfolioStatus) {
  if (portfolioStatus === 'high_risk_hold' || portfolioStatus === 'recovery_review') return 'high';
  if (/medical|med|bio|health|rescue|병원|건강|바이오|제약/i.test(`${row.domain} ${row.memo}`)) {
    return 'ymyl';
  }
  return 'standard';
}

function deriveTopic(row) {
  const text = `${row.domain} ${row.memo}`.toLowerCase();
  if (/medical|med|bio|health|rescue|병원|건강|바이오|제약/.test(text)) return 'health';
  if (/housing|real|부동산/.test(text)) return 'real_estate';
  if (/news|journal|daily|times|언론|뉴스/.test(text)) return 'news';
  if (/cattery|반려동물/.test(text)) return 'pet';
  if (/fishing|ranching|streams|outdoor|아웃도어|낚시/.test(text)) return 'outdoor';
  if (/art|문화|travel|resort|tour|요가|명상/.test(text)) return 'culture';
  if (/logistics|trade|business|마케팅|공구|산업/.test(text)) return 'business';
  if (/clean|청소/.test(text)) return 'local_service';
  return 'general';
}

function deriveSiteName(domain) {
  return domain
    .replace(/\.[a-z.]+$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function deriveAutomation(row, portfolioStatus) {
  if (portfolioStatus === 'operating_ready' && row.approval === '합격') {
    return {
      enabled: false,
      mode: 'draft_only',
      workflowType: 'content_draft',
      promptProfile: `${deriveTopic(row)}_${row.lang}`,
      monthlyTarget: row.lang === 'en' ? 12 : 20,
      publishMode: 'draft',
    };
  }

  return {
    enabled: false,
    mode: 'manual',
    workflowType: portfolioStatus,
    promptProfile: 'manual_review',
    monthlyTarget: 0,
    publishMode: 'draft',
  };
}

function deriveAdsenseStatus(row, portfolioStatus) {
  if (portfolioStatus === 'customer_portal' || portfolioStatus === 'infra_internal') return 'paused';
  if (portfolioStatus === 'high_risk_hold' || portfolioStatus === 'recovery_review') return 'rejected';
  if (row.approval === '합격') return 'approved';
  return 'not_started';
}

function normalizeMonetizeMode(monetize, portfolioStatus) {
  const allowed = new Set([
    'adsense',
    'adsense_agency',
    'adsense_affiliate',
    'adsense_cpa',
    'business',
    'internal',
  ]);

  if (allowed.has(monetize)) return monetize;
  if (portfolioStatus === 'customer_portal' || portfolioStatus === 'infra_internal') return 'internal';
  return null;
}

function shouldCreateWordPressConnection(row, portfolioStatus) {
  if (portfolioStatus === 'infra_internal' || portfolioStatus === 'high_risk_hold') return false;
  return row.setup?.toUpperCase() === 'DONE';
}

async function upsertSite(client, row) {
  const portfolioStatus = classifyPortfolio(row);
  const siteKey = toSiteKey(row.domain);
  const riskLevel = deriveRiskLevel(row, portfolioStatus);
  const recoveryStatus = deriveRecoveryStatus(portfolioStatus);
  const status = deriveSiteStatus(portfolioStatus);
  const guardrail = deriveGuardrail(row, portfolioStatus);
  const topic = deriveTopic(row);
  const setupStatus = toSetupStatus(row.setup);
  const automation = deriveAutomation(row, portfolioStatus);

  const siteResult = await client.query(
    `
      insert into sites (
        sheet_row_id, site_key, domain, language_code, cluster_code, g_level,
        guardrail_level, b_code, site_name, site_concept, portfolio_status,
        recovery_status, risk_level, is_customer_portal, is_internal_infra,
        status, approval_status, monetize_mode, dr_score, memo, updated_at
      )
      values (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11,
        $12, $13, $14, $15,
        $16, $17, $18, $19, $20, now()
      )
      on conflict (site_key) do update set
        sheet_row_id = excluded.sheet_row_id,
        domain = excluded.domain,
        language_code = excluded.language_code,
        cluster_code = excluded.cluster_code,
        g_level = excluded.g_level,
        guardrail_level = excluded.guardrail_level,
        b_code = excluded.b_code,
        site_name = excluded.site_name,
        site_concept = excluded.site_concept,
        portfolio_status = excluded.portfolio_status,
        recovery_status = excluded.recovery_status,
        risk_level = excluded.risk_level,
        is_customer_portal = excluded.is_customer_portal,
        is_internal_infra = excluded.is_internal_infra,
        status = excluded.status,
        approval_status = excluded.approval_status,
        monetize_mode = excluded.monetize_mode,
        dr_score = excluded.dr_score,
        memo = excluded.memo,
        updated_at = now()
      returning id
    `,
    [
      row.row,
      siteKey,
      row.domain,
      row.lang,
      topic,
      row.lang === 'en' ? 'G_EN' : 'G_KO',
      guardrail,
      topic,
      deriveSiteName(row.domain),
      row.memo,
      portfolioStatus,
      recoveryStatus,
      riskLevel,
      portfolioStatus === 'customer_portal',
      portfolioStatus === 'infra_internal',
      status,
      row.approval === '합격' ? 'approved' : row.approval === '폐기' ? 'rejected' : 'pending',
      normalizeMonetizeMode(row.monetize, portfolioStatus),
      row.dr,
      row.memo,
    ],
  );

  const siteId = siteResult.rows[0].id;

  if (shouldCreateWordPressConnection(row, portfolioStatus)) {
    await client.query('delete from wordpress_connections where site_id = $1', [siteId]);
    await client.query(
      `
        insert into wordpress_connections (
          site_id, wp_base_url, wp_username, wp_credential_ref, seo_plugin, status, updated_at
        )
        values ($1, $2, $3, $4, $5, $6, now())
      `,
      [
        siteId,
        `https://${row.domain}`,
        'admin',
        toCredentialRef(row.domain),
        'rank_math',
        setupStatus === 'done' ? 'pending' : 'disabled',
      ],
    );
  } else {
    await client.query('delete from wordpress_connections where site_id = $1', [siteId]);
  }

  await client.query(
    `
      insert into site_ai_settings (
        site_id, automation_enabled, automation_mode, workflow_type, prompt_profile,
        llm_provider, llm_mode, primary_model, repair_model, temperature_primary,
        temperature_repair, translation_enabled, post_frequency, monthly_target,
        default_publish_mode
      )
      values ($1, $2, $3, $4, $5, 'openai', 'standard', 'gpt-5-mini', 'gpt-5-mini', 0.70, 0.20, $6, $7, $8, $9)
      on conflict (site_id) do update set
        automation_enabled = excluded.automation_enabled,
        automation_mode = excluded.automation_mode,
        workflow_type = excluded.workflow_type,
        prompt_profile = excluded.prompt_profile,
        llm_provider = excluded.llm_provider,
        llm_mode = excluded.llm_mode,
        primary_model = excluded.primary_model,
        repair_model = excluded.repair_model,
        temperature_primary = excluded.temperature_primary,
        temperature_repair = excluded.temperature_repair,
        translation_enabled = excluded.translation_enabled,
        post_frequency = excluded.post_frequency,
        monthly_target = excluded.monthly_target,
        default_publish_mode = excluded.default_publish_mode
    `,
    [
      siteId,
      automation.enabled,
      automation.mode,
      automation.workflowType,
      automation.promptProfile,
      row.lang === 'en',
      automation.monthlyTarget > 0 ? 1 : 0,
      automation.monthlyTarget,
      automation.publishMode,
    ],
  );

  await client.query(
    `
      insert into site_validation_rules (
        site_id, validation_min_length, validation_min_h2, required_keywords,
        ymyl_disclaimer_required, customer_review_required, boss_review_required
      )
      values ($1, $2, 3, '{}', $3, $4, true)
      on conflict (site_id) do update set
        validation_min_length = excluded.validation_min_length,
        validation_min_h2 = excluded.validation_min_h2,
        required_keywords = excluded.required_keywords,
        ymyl_disclaimer_required = excluded.ymyl_disclaimer_required,
        customer_review_required = excluded.customer_review_required,
        boss_review_required = excluded.boss_review_required
    `,
    [siteId, row.lang === 'en' ? 1200 : 1500, guardrail === 'ymyl', portfolioStatus !== 'operating_ready'],
  );

  await client.query(
    `
      insert into site_image_settings (
        site_id, image_provider, image_style, image_count, image_source,
        fallback_to_generate, include_video, image_pipeline_mode, featured_image_required
      )
      values ($1, 'openai', $2, $3, 'generated', true, false, $4, $5)
      on conflict (site_id) do update set
        image_provider = excluded.image_provider,
        image_style = excluded.image_style,
        image_count = excluded.image_count,
        image_source = excluded.image_source,
        fallback_to_generate = excluded.fallback_to_generate,
        include_video = excluded.include_video,
        image_pipeline_mode = excluded.image_pipeline_mode,
        featured_image_required = excluded.featured_image_required
    `,
    [
      siteId,
      topic === 'news' ? 'editorial' : 'clean_documentary',
      portfolioStatus === 'operating_ready' ? 1 : 0,
      portfolioStatus === 'operating_ready' ? 'featured_only' : 'none',
      portfolioStatus === 'operating_ready',
    ],
  );

  await client.query('delete from adsense_status where site_id = $1', [siteId]);
  await client.query(
    `
      insert into adsense_status (
        site_id, account_owner, application_status, ads_txt_status, notes, updated_at
      )
      values ($1, $2, $3, $4, $5, now())
    `,
    [
      siteId,
      portfolioStatus === 'customer_portal' || portfolioStatus === 'infra_internal'
        ? 'boss_internal_test'
        : 'customer',
      deriveAdsenseStatus(row, portfolioStatus),
      row.approval === '합격' ? 'valid' : 'unknown',
      row.memo,
    ],
  );

  await client.query('delete from wp_setup_queue where sheet_row_id = $1', [row.row]);
  if (portfolioStatus === 'setup_pipeline') {
    await client.query(
      `
        insert into wp_setup_queue (
          sheet_row_id, site_id, language_code, domain, linux_user, wp_username,
          wp_credential_ref, site_name, site_concept, categories, theme_slug,
          monetize, dr_score, approval, setup_status, memo, updated_at
        )
        values ($1, $2, $3, $4, $5, 'admin', $6, $7, $8, $9, 'generatepress', $10, $11, $12, $13, $14, now())
      `,
      [
        row.row,
        siteId,
        row.lang,
        row.domain,
        toSiteKey(row.domain).slice(0, 24),
        toCredentialRef(row.domain),
        deriveSiteName(row.domain),
        row.memo,
        [topic],
        row.monetize,
        row.dr,
        row.approval || '미분류',
        setupStatus,
        row.memo,
      ],
    );
  }

  return portfolioStatus;
}

async function ensureSchema(client) {
  const schema = await fs.readFile(schemaPath, 'utf8');
  await client.query(schema);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required. Put it in .env or export it before running the import.');
  }

  const markdown = await fs.readFile(portfolioPath, 'utf8');
  const rows = parseTable(markdown);

  if (rows.length === 0) {
    throw new Error(`No portfolio rows found in ${portfolioPath}`);
  }

  const client = await pool.connect();

  try {
    await client.query('begin');
    await ensureSchema(client);

    const counts = new Map();
    for (const row of rows) {
      const portfolioStatus = await upsertSite(client, row);
      counts.set(portfolioStatus, (counts.get(portfolioStatus) || 0) + 1);
    }

    await client.query('commit');

    console.log(`Imported ${rows.length} domain portfolio rows.`);
    for (const [status, count] of [...counts.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      console.log(`- ${status}: ${count}`);
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
