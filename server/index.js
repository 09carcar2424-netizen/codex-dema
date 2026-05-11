import 'dotenv/config';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { URL } from 'node:url';
import { checkDatabase, query } from './db.js';

const host = process.env.API_HOST || '127.0.0.1';
const port = Number(process.env.API_PORT || 8787);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const staticDir = path.resolve(__dirname, '..', 'dist');

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || 'http://127.0.0.1:5173',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  });
  res.end(statusCode === 204 ? '' : JSON.stringify(payload));
}

async function sendStatic(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return sendJson(res, 405, { ok: false, error: 'Method not allowed' });
  }

  const requestedPath = decodeURIComponent(url.pathname);
  const safePath = path.normalize(requestedPath).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(staticDir, safePath === '/' ? 'index.html' : safePath);
  const resolvedPath = path.resolve(filePath);

  if (!resolvedPath.startsWith(staticDir)) {
    return sendJson(res, 403, { ok: false, error: 'Forbidden' });
  }

  try {
    const file = await fs.readFile(resolvedPath);
    res.writeHead(200, {
      'Content-Type': contentTypes[path.extname(resolvedPath)] || 'application/octet-stream',
      'Cache-Control': resolvedPath.endsWith('index.html')
        ? 'no-cache'
        : 'public, max-age=31536000, immutable',
    });
    return res.end(req.method === 'HEAD' ? undefined : file);
  } catch (error) {
    if (error.code !== 'ENOENT' && error.code !== 'EISDIR') {
      throw error;
    }

    const indexFile = await fs.readFile(path.join(staticDir, 'index.html'));
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache',
    });
    return res.end(req.method === 'HEAD' ? undefined : indexFile);
  }
}

function mapSite(row) {
  return {
    siteKey: row.site_key,
    domain: row.domain,
    owner: row.customer_name || (row.is_customer_portal ? 'Customer portal' : 'Customer owned'),
    language: row.language_code,
    gLevel: row.g_level,
    guardrail: row.guardrail_level?.toUpperCase(),
    topic: row.b_code,
    portfolioStatus: row.portfolio_status,
    approvalStatus: row.approval_status || row.setup_approval || 'not_submitted',
    riskLevel: row.risk_level,
    monetizeMode: row.monetize_mode,
    setupStatus: row.setup_status,
    memo: row.memo,
    wpBaseUrl: row.wp_base_url,
    credentialRef: row.wp_credential_ref || 'NOT_SET',
    workflow: row.workflow_type || 'NOT_SET',
    promptProfile: row.prompt_profile || 'NOT_SET',
    model: row.primary_model || row.llm_provider || 'NOT_SET',
    automationMode: row.automation_mode?.toUpperCase() || 'MANUAL',
    status: row.status?.toUpperCase(),
    adsense: row.application_status || 'unknown',
    monthlyTarget: row.monthly_target || 0,
    reviewRequired: row.customer_review_required ?? true,
  };
}

async function queryOptional(sql) {
  try {
    return await query(sql);
  } catch (error) {
    if (error.code === '42P01') {
      return { rows: [] };
    }
    throw error;
  }
}

async function getDashboardData() {
  const [sites, customers, contentQueue, wpSetup, workflows, runLogs, settlements, referrals] =
    await Promise.all([
      query(`
        select s.site_key, s.domain, s.language_code, s.g_level, s.guardrail_level, s.b_code,
          s.portfolio_status, s.approval_status, s.risk_level, s.monetize_mode, s.memo, s.status,
          s.is_customer_portal, c.display_name as customer_name, wps.setup_status,
          wps.approval as setup_approval, wc.wp_base_url,
          wc.wp_credential_ref, ai.workflow_type, ai.prompt_profile, ai.llm_provider,
          ai.primary_model, ai.automation_mode, ai.monthly_target,
          vr.customer_review_required, ads.application_status
        from sites s
        left join customers c on c.id = s.customer_id
        left join wp_setup_queue wps on wps.domain = s.domain
        left join wordpress_connections wc on wc.site_id = s.id
        left join site_ai_settings ai on ai.site_id = s.id
        left join site_validation_rules vr on vr.site_id = s.id
        left join adsense_status ads on ads.site_id = s.id
        order by s.is_customer_portal desc, s.created_at desc
        limit 100
      `),
      query(`
        select customer_code as code, display_name as name, contract_status,
          0 as sites, 'UNKNOWN' as adsense_status, 'NONE' as settlement_status
        from customers
        order by created_at desc
        limit 100
      `),
      query(`
        select cq.sheet_row_id as id, cq.site_key, cq.my_title as title, cq.keyword,
          cq.category, cq.status, cq.publish_mode, coalesce(cvr.h2_count, 0) as h2_count,
          coalesce(cvr.content_length, 0) as content_length, cq.priority
        from content_queue cq
        left join content_validation_results cvr on cvr.content_queue_id = cq.id
        order by cq.created_at desc
        limit 100
      `),
      query(`
        select domain, language_code as language, linux_user, site_name,
          site_concept as concept, theme_slug as theme, monetize, approval,
          dr_score, setup_status as status, memo, error_log,
          to_char(setup_date, 'YYYY-MM-DD HH24:MI') as setup_date
        from wp_setup_queue
        order by
          case setup_status
            when 'processing' then 1
            when 'pending' then 2
            when 'failed' then 3
            when 'done' then 4
            when 'skip' then 5
            else 6
          end,
          created_at desc
        limit 100
      `),
      query(`
        select workflow_key as key, workflow_name as name, workflow_type as type,
          coalesce(notes, workflow_type) as target,
          case when active then 'ACTIVE' else 'DISABLED' end as status,
          'DB' as last_run
        from n8n_workflows
        order by created_at desc
        limit 100
      `),
      query(`
        select to_char(run_timestamp, 'YYYY-MM-DD HH24:MI') as time, site_key,
          workflow_type as workflow, status, concat('$', coalesce(cost_usd, 0)) as cost,
          coalesce(execution_time_sec, 0) as seconds,
          coalesce(final_post_url, error_message, 'No result yet') as result
        from run_logs
        order by run_timestamp desc
        limit 20
      `),
      query(`
        select to_char(settlement_month, 'YYYY-MM') as month,
          coalesce(c.customer_code, 'NO_CUSTOMER') as customer,
          concat(gross_revenue, ' ', currency) as gross_revenue,
          concat(agency_fee_amount, ' ', currency) as agency_fee,
          status
        from revenue_settlements rs
        left join customers c on c.id = rs.customer_id
        order by settlement_month desc
        limit 50
      `),
      query(`
        select rc.customer_code as referrer, cc.customer_code as referred,
          rr.depth, coalesce(rule.rule_name, 'Referral rule not set') as rule,
          coalesce(rule.active, false) as active, rr.status
        from referral_relationships rr
        join customers rc on rc.id = rr.referrer_customer_id
        join customers cc on cc.id = rr.referred_customer_id
        left join referral_reward_rules rule on rule.depth = rr.depth
        order by rr.created_at desc
        limit 50
      `),
    ]);

  const notifications = await queryOptional(`
    select id::text, audience_type, visibility, title, message, channel,
      category, severity, send_status, marketing_message
    from notifications
    order by
      case severity
        when 'critical' then 1
        when 'warning' then 2
        when 'action_required' then 3
        else 4
      end,
      created_at desc
    limit 50
  `);

  return {
    source: 'postgres',
    sites: sites.rows.map(mapSite),
    customers: customers.rows.map((row) => ({
      code: row.code,
      name: row.name,
      contractStatus: row.contract_status?.toUpperCase(),
      sites: Number(row.sites || 0),
      adsenseStatus: row.adsense_status,
      settlementStatus: row.settlement_status,
    })),
    contentQueue: contentQueue.rows.map((row) => ({
      id: row.id,
      siteKey: row.site_key,
      title: row.title,
      keyword: row.keyword,
      category: row.category,
      status: row.status?.toUpperCase(),
      publishMode: row.publish_mode,
      h2Count: Number(row.h2_count || 0),
      contentLength: Number(row.content_length || 0),
      priority: row.priority,
    })),
    wpSetup: wpSetup.rows.map((row) => ({
      domain: row.domain,
      language: row.language,
      linuxUser: row.linux_user,
      siteName: row.site_name,
      concept: row.concept,
      theme: row.theme,
      monetize: row.monetize,
      approval: row.approval,
      drScore: row.dr_score === null ? null : Number(row.dr_score),
      status: row.status?.toUpperCase(),
      memo: row.memo,
      errorLog: row.error_log,
      setupDate: row.setup_date,
    })),
    workflows: workflows.rows.map((row) => ({
      key: row.key,
      name: row.name,
      type: row.type,
      target: row.target,
      status: row.status,
      lastRun: row.last_run,
    })),
    runLogs: runLogs.rows.map((row) => ({
      time: row.time,
      siteKey: row.site_key,
      workflow: row.workflow,
      status: row.status?.toUpperCase(),
      cost: row.cost,
      seconds: Number(row.seconds || 0),
      result: row.result,
    })),
    settlements: settlements.rows.map((row) => ({
      month: row.month,
      customer: row.customer,
      grossRevenue: row.gross_revenue,
      agencyFee: row.agency_fee,
      status: row.status?.toUpperCase(),
    })),
    referrals: referrals.rows.map((row) => ({
      referrer: row.referrer,
      referred: row.referred,
      depth: row.depth,
      rule: row.rule,
      active: row.active,
      status: row.status?.toUpperCase(),
    })),
    notifications: notifications.rows.map((row) => ({
      id: row.id,
      audience: row.audience_type,
      visibility: row.visibility,
      title: row.title,
      message: row.message,
      channel: row.channel,
      category: row.category,
      severity: row.severity,
      status: row.send_status,
      marketing: row.marketing_message,
    })),
    taxEstimates: [
      {
        label: '소개 보상 예시',
        grossAmount: '100,000원',
        category: '사업소득 3.3% 참고',
        withholding: '3,300원',
        netPayable: '96,700원',
        status: 'REFERENCE',
      },
      {
        label: '기타소득 참고 예시',
        grossAmount: '100,000원',
        category: '기타소득 8.8% 참고',
        withholding: '8,800원',
        netPayable: '91,200원',
        status: 'REFERENCE',
      },
    ],
  };
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    return sendJson(res, 204, {});
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  try {
    if (url.pathname === '/api/health') {
      const db = await checkDatabase();
      return sendJson(res, 200, { ok: true, database: 'connected', checkedAt: db.now });
    }

    if (url.pathname === '/api/dashboard') {
      return sendJson(res, 200, await getDashboardData());
    }

    return sendStatic(req, res, url);
  } catch (error) {
    return sendJson(res, 503, {
      ok: false,
      source: 'fallback',
      error: 'Database unavailable',
      detail: error.message,
    });
  }
});

server.listen(port, host, () => {
  console.log(`BOSS SiteOps API listening on http://${host}:${port}`);
});
