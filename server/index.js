import 'dotenv/config';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { URL } from 'node:url';
import { checkDatabase, query } from './db.js';

const host = process.env.API_HOST || '127.0.0.1';
const port = Number(process.env.API_PORT || 8787);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const staticDir = path.resolve(__dirname, '..', 'dist');
const adminUser = process.env.SITEOPS_ADMIN_USER || 'boss';
const adminPassword = process.env.SITEOPS_ADMIN_PASSWORD || '';
const googleSearchConsoleScope = 'https://www.googleapis.com/auth/webmasters';

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

function getAllowedOrigins() {
  const configured = process.env.CORS_ALLOW_ORIGINS || process.env.CORS_ORIGIN || 'http://127.0.0.1:5173';
  return configured
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function getCorsOrigin(req) {
  const requestOrigin = req.headers.origin;
  const allowedOrigins = getAllowedOrigins();

  if (allowedOrigins.includes('*')) return '*';
  if (requestOrigin && allowedOrigins.includes(requestOrigin)) return requestOrigin;
  return allowedOrigins[0] || 'http://127.0.0.1:5173';
}

function sendJson(req, res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': getCorsOrigin(req),
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  });
  res.end(statusCode === 204 ? '' : JSON.stringify(payload));
}

function safeEquals(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);

  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function hasValidAdminAuth(req) {
  if (!adminPassword) return true;

  const header = req.headers.authorization || '';
  if (!header.startsWith('Basic ')) return false;

  try {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const separatorIndex = decoded.indexOf(':');
    if (separatorIndex === -1) return false;

    const username = decoded.slice(0, separatorIndex);
    const password = decoded.slice(separatorIndex + 1);

    return safeEquals(username, adminUser) && safeEquals(password, adminPassword);
  } catch {
    return false;
  }
}

function requireAdminAuth(req, res) {
  if (hasValidAdminAuth(req)) return true;

  res.writeHead(401, {
    'Content-Type': 'text/plain; charset=utf-8',
    'WWW-Authenticate': 'Basic realm="BOSS SiteOps", charset="UTF-8"',
    'Access-Control-Allow-Origin': getCorsOrigin(req),
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  });
  res.end('Authentication required');
  return false;
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function normalizeChoice(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function mapNotification(row) {
  return {
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
  };
}

async function createNotification(req, res) {
  const body = await readJsonBody(req);
  const title = String(body.title || '').trim();
  const message = String(body.message || '').trim();

  if (title.length < 2 || message.length < 5) {
    return sendJson(req, res, 400, {
      ok: false,
      error: 'Title and message are required.',
    });
  }

  const audienceType = normalizeChoice(body.audienceType, ['customer', 'admin', 'staff'], 'customer');
  const visibility =
    audienceType === 'customer'
      ? normalizeChoice(body.visibility, ['public_to_customer', 'internal_only'], 'public_to_customer')
      : 'internal_only';
  const category = normalizeChoice(
    body.category,
    ['notice', 'settlement', 'payment', 'account_action', 'contract', 'domain', 'automation', 'security', 'general'],
    'general',
  );
  const severity = normalizeChoice(body.severity, ['info', 'action_required', 'warning', 'critical'], 'info');
  const channel = normalizeChoice(body.channel, ['portal', 'sms', 'kakao', 'telegram', 'portal_sms', 'portal_telegram'], 'portal');

  const result = await query(
    `
      insert into notifications (
        audience_type, visibility, category, severity, title, message, channel,
        marketing_message, opt_in_required, send_status
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'draft')
      returning id::text, audience_type, visibility, title, message, channel,
        category, severity, send_status, marketing_message
    `,
    [
      audienceType,
      visibility,
      category,
      severity,
      title,
      message,
      channel,
      Boolean(body.marketingMessage),
      Boolean(body.marketingMessage),
    ],
  );

  return sendJson(req, res, 201, { ok: true, notification: mapNotification(result.rows[0]) });
}

function getPublicBaseUrl(req) {
  const configured = process.env.SITEOPS_PUBLIC_URL || '';
  if (configured) return configured.replace(/\/+$/, '');

  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const hostHeader = req.headers['x-forwarded-host'] || req.headers.host;
  return `${protocol}://${hostHeader}`;
}

function getGoogleRedirectUri(req) {
  return (
    process.env.GOOGLE_REDIRECT_URI ||
    `${getPublicBaseUrl(req)}/api/google/search-console/callback`
  );
}

function buildGoogleSearchConsoleAuthUrl(req) {
  if (!process.env.GOOGLE_CLIENT_ID) {
    return null;
  }

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', process.env.GOOGLE_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', getGoogleRedirectUri(req));
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', googleSearchConsoleScope);
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');
  authUrl.searchParams.set('include_granted_scopes', 'true');
  return authUrl.toString();
}

async function exchangeGoogleCode(req, code) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
      redirect_uri: getGoogleRedirectUri(req),
      grant_type: 'authorization_code',
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error_description || payload.error || 'Google OAuth exchange failed');
  }

  await query(
    `
      insert into google_integrations (
        integration_key, scopes, status, connected_at, last_checked_at, notes, updated_at
      )
      values ('search_console', $1, 'connected', now(), now(), $2, now())
      on conflict (integration_key) do update set
        scopes = excluded.scopes,
        status = excluded.status,
        connected_at = excluded.connected_at,
        last_checked_at = excluded.last_checked_at,
        notes = excluded.notes,
        updated_at = now()
    `,
    [[googleSearchConsoleScope], 'Refresh token is stored only in .env, not in the database.'],
  );

  return payload;
}

async function sendStatic(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return sendJson(req, res, 405, { ok: false, error: 'Method not allowed' });
  }

  const requestedPath = decodeURIComponent(url.pathname);
  const safePath = path.normalize(requestedPath).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(staticDir, safePath === '/' ? 'index.html' : safePath);
  const resolvedPath = path.resolve(filePath);

  if (!resolvedPath.startsWith(staticDir)) {
    return sendJson(req, res, 403, { ok: false, error: 'Forbidden' });
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

  const domainInventory = await queryOptional(`
    select di.domain, di.ownership_type, di.acquisition_type, di.language_priority,
      di.category_fit, di.inventory_status, di.offer_status, di.public_listing_allowed,
      di.memo, da.overall_score, da.final_grade, da.history_score, da.spam_score,
      da.backlink_score, da.index_score, da.trademark_risk, da.ymyl_risk_level,
      da.manual_review_required, da.evidence_attached
    from domain_inventory di
    left join lateral (
      select *
      from domain_audits da
      where da.inventory_id = di.id
      order by da.created_at desc
      limit 1
    ) da on true
    order by
      case di.inventory_status
        when 'recommended' then 1
        when 'brokerage_ready' then 2
        when 'operating_first' then 3
        when 'internal_review' then 4
        when 'hold' then 5
        else 6
      end,
      di.updated_at desc
    limit 100
  `);

  const sitemapSubmissions = await queryOptional(`
    select ss.id::text, ss.site_key, ss.domain, ss.sitemap_url, ss.search_engine,
      ss.property_url, ss.submission_mode, ss.submission_status,
      to_char(ss.last_submitted_at, 'YYYY-MM-DD HH24:MI') as last_submitted_at,
      to_char(ss.last_checked_at, 'YYYY-MM-DD HH24:MI') as last_checked_at,
      ss.response_message, ss.notes
    from sitemap_submissions ss
    order by
      case ss.submission_status
        when 'failed' then 1
        when 'manual_required' then 2
        when 'ready' then 3
        when 'draft' then 4
        when 'submitted' then 5
        when 'verified' then 6
        else 7
      end,
      ss.updated_at desc
    limit 100
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
    domainInventory: domainInventory.rows.map((row) => ({
      domain: row.domain,
      ownershipType: row.ownership_type,
      acquisitionType: row.acquisition_type,
      languagePriority: row.language_priority,
      categoryFit: row.category_fit,
      inventoryStatus: row.inventory_status,
      offerStatus: row.offer_status,
      publicListingAllowed: row.public_listing_allowed,
      memo: row.memo,
      overallScore: row.overall_score,
      finalGrade: row.final_grade || 'unrated',
      historyScore: row.history_score,
      spamScore: row.spam_score,
      backlinkScore: row.backlink_score,
      indexScore: row.index_score,
      trademarkRisk: row.trademark_risk || 'unknown',
      ymylRiskLevel: row.ymyl_risk_level || 'unknown',
      manualReviewRequired: row.manual_review_required ?? true,
      evidenceAttached: row.evidence_attached ?? false,
    })),
    sitemapSubmissions: sitemapSubmissions.rows.map((row) => ({
      id: row.id,
      siteKey: row.site_key,
      domain: row.domain,
      sitemapUrl: row.sitemap_url,
      searchEngine: row.search_engine,
      propertyUrl: row.property_url,
      submissionMode: row.submission_mode,
      status: row.submission_status,
      lastSubmittedAt: row.last_submitted_at,
      lastCheckedAt: row.last_checked_at,
      responseMessage: row.response_message,
      notes: row.notes,
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
    return sendJson(req, res, 204, {});
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  if (!requireAdminAuth(req, res)) return;

  try {
    if (url.pathname === '/api/health') {
      const db = await checkDatabase();
      return sendJson(req, res, 200, { ok: true, database: 'connected', checkedAt: db.now });
    }

    if (url.pathname === '/api/dashboard') {
      return sendJson(req, res, 200, await getDashboardData());
    }

    if (url.pathname === '/api/notifications' && req.method === 'POST') {
      return createNotification(req, res);
    }

    if (url.pathname === '/api/google/search-console/auth-url') {
      const authUrl = buildGoogleSearchConsoleAuthUrl(req);
      if (!authUrl) {
        return sendJson(req, res, 400, {
          ok: false,
          error: 'GOOGLE_CLIENT_ID is not configured.',
        });
      }
      return sendJson(req, res, 200, {
        ok: true,
        authUrl,
        redirectUri: getGoogleRedirectUri(req),
        scope: googleSearchConsoleScope,
      });
    }

    if (url.pathname === '/api/google/search-console/callback') {
      const code = url.searchParams.get('code');
      if (!code) {
        return sendJson(req, res, 400, { ok: false, error: 'Missing Google OAuth code.' });
      }

      const tokenPayload = await exchangeGoogleCode(req, code);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(`
        <!doctype html>
        <html lang="ko">
          <head><meta charset="utf-8"><title>Google Search Console 연결</title></head>
          <body style="font-family: sans-serif; max-width: 760px; margin: 40px auto; line-height: 1.6;">
            <h1>Google Search Console 인증 완료</h1>
            <p>아래 refresh token을 Ubuntu 서버의 <code>/home/boss/codex-dema/.env</code>에만 저장하세요.</p>
            <p>이 값은 비밀번호처럼 취급하고 GitHub나 문서에 넣으면 안 됩니다.</p>
            <textarea readonly style="width:100%; min-height: 140px;">${tokenPayload.refresh_token || '이미 동의한 앱이라 refresh_token이 다시 내려오지 않았습니다. Google 동의 화면에서 앱 권한을 해제한 뒤 다시 인증하세요.'}</textarea>
          </body>
        </html>
      `);
    }

    return sendStatic(req, res, url);
  } catch (error) {
    return sendJson(req, res, 503, {
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
