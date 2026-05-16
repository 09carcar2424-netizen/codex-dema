import 'dotenv/config';
import fs from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import crypto from 'node:crypto';
import tls from 'node:tls';
import { fileURLToPath } from 'node:url';
import { URL } from 'node:url';
import { checkDatabase, query } from './db.js';

const host = process.env.API_HOST || '127.0.0.1';
const port = Number(process.env.API_PORT || 8787);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const staticDir = path.resolve(__dirname, '..', 'dist');
const adminUser = process.env.SITEOPS_ADMIN_USER || 'boss';
const adminPassword = process.env.SITEOPS_ADMIN_PASSWORD || '';
const wordfriendsEventToken = process.env.SITEOPS_EVENT_TOKEN || '';
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
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-SiteOps-Event-Token',
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
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-SiteOps-Event-Token',
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

function normalizeDomain(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '');
}

function normalizeTextArray(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean).slice(0, 20);
  }

  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function getRequestClientMeta(req) {
  return {
    userAgent: req.headers['user-agent'] || '',
    referer: req.headers.referer || '',
    forwardedFor: req.headers['x-forwarded-for'] || '',
  };
}

function isSmtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD);
}

function extractEmailAddress(text) {
  const match = String(text || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0] : '';
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase().slice(0, 320);
}

function encodeMailHeader(value) {
  return String(value || '').replace(/[\r\n]+/g, ' ').trim();
}

function escapeSmtpBody(value) {
  return String(value || '')
    .replace(/\r?\n/g, '\r\n')
    .split('\r\n')
    .map((line) => (line.startsWith('.') ? `.${line}` : line))
    .join('\r\n');
}

function parseSmtpCode(line) {
  const match = String(line || '').match(/^(\d{3})/);
  return match ? Number(match[1]) : 0;
}

function waitForSmtpResponse(socket, expectedCodes) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('SMTP response timeout.'));
    }, 15000);

    const cleanup = () => {
      clearTimeout(timeout);
      socket.off('data', handleData);
      socket.off('error', handleError);
    };

    const handleError = (error) => {
      cleanup();
      reject(error);
    };

    const handleData = (chunk) => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split(/\r?\n/).filter(Boolean);
      const lastLine = lines[lines.length - 1] || '';

      if (!/^\d{3} /.test(lastLine)) return;

      const code = parseSmtpCode(lastLine);
      cleanup();

      if (expectedCodes.includes(code)) {
        resolve(buffer.trim());
      } else {
        reject(new Error(`SMTP error ${code}: ${buffer.trim()}`));
      }
    };

    socket.on('data', handleData);
    socket.on('error', handleError);
  });
}

async function smtpCommand(socket, command, expectedCodes) {
  socket.write(`${command}\r\n`);
  return waitForSmtpResponse(socket, expectedCodes);
}

async function connectSmtpSocket() {
  const hostName = process.env.SMTP_HOST;
  const smtpPort = Number(process.env.SMTP_PORT || 587);
  const secure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || smtpPort === 465;

  const socket = secure
    ? tls.connect({ host: hostName, port: smtpPort, servername: hostName })
    : net.connect({ host: hostName, port: smtpPort });

  await new Promise((resolve, reject) => {
    socket.once(secure ? 'secureConnect' : 'connect', resolve);
    socket.once('error', reject);
  });

  await waitForSmtpResponse(socket, [220]);
  await smtpCommand(socket, `EHLO ${process.env.SMTP_HELO_DOMAIN || 'siteops.09car.co.kr'}`, [250]);

  if (!secure) {
    await smtpCommand(socket, 'STARTTLS', [220]);
    const upgraded = tls.connect({ socket, servername: hostName });
    await new Promise((resolve, reject) => {
      upgraded.once('secureConnect', resolve);
      upgraded.once('error', reject);
    });
    await smtpCommand(upgraded, `EHLO ${process.env.SMTP_HELO_DOMAIN || 'siteops.09car.co.kr'}`, [250]);
    return upgraded;
  }

  return socket;
}

async function sendEmailViaSmtp({ to, subject, text }) {
  if (!isSmtpConfigured()) {
    throw new Error('SMTP is not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASSWORD, and SMTP_FROM.');
  }

  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const socket = await connectSmtpSocket();

  try {
    await smtpCommand(socket, 'AUTH LOGIN', [334]);
    await smtpCommand(socket, Buffer.from(process.env.SMTP_USER || '').toString('base64'), [334]);
    await smtpCommand(socket, Buffer.from(process.env.SMTP_PASSWORD || '').toString('base64'), [235]);
    await smtpCommand(socket, `MAIL FROM:<${from}>`, [250]);
    await smtpCommand(socket, `RCPT TO:<${to}>`, [250, 251]);
    await smtpCommand(socket, 'DATA', [354]);

    const messageId = `${Date.now()}.${crypto.randomBytes(8).toString('hex')}@siteops.09car.co.kr`;
    const body = [
      `From: ${encodeMailHeader(process.env.SMTP_FROM_NAME || 'Wordfriends')} <${from}>`,
      `To: <${to}>`,
      `Subject: ${encodeMailHeader(subject)}`,
      `Message-ID: <${messageId}>`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      escapeSmtpBody(text),
      '.',
      '',
    ].join('\r\n');

    socket.write(body);
    await waitForSmtpResponse(socket, [250]);
    await smtpCommand(socket, 'QUIT', [221]);

    return { messageId, to };
  } finally {
    socket.end();
  }
}

function hasValidEventToken(req) {
  if (!wordfriendsEventToken) return false;

  const headerToken = String(req.headers['x-siteops-event-token'] || '').trim();
  const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  const token = headerToken || bearer;

  return Boolean(token) && safeEquals(token, wordfriendsEventToken);
}

function requireEventToken(req, res) {
  if (hasValidEventToken(req)) return true;

  const statusCode = wordfriendsEventToken ? 401 : 503;
  sendJson(req, res, statusCode, {
    ok: false,
    error: wordfriendsEventToken
      ? 'Invalid Wordfriends event token.'
      : 'SITEOPS_EVENT_TOKEN is not configured.',
  });
  return false;
}

async function findCustomerId(customerCode) {
  const normalized = String(customerCode || '').trim();
  if (!normalized) return null;

  const result = await query(
    `
      select id
      from customers
      where customer_code = $1
      limit 1
    `,
    [normalized],
  );

  return result.rows[0]?.id || null;
}

async function findCustomerIdByCodeOrEmail(customerCode, email) {
  const normalizedCode = String(customerCode || '').trim();
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedCode && !normalizedEmail) return null;

  const result = await query(
    `
      select id
      from customers
      where ($1 <> '' and customer_code = $1)
        or ($2 <> '' and lower(contact_email) = $2)
        or (
          $2 <> ''
          and exists (
            select 1
            from customer_portal_accounts cpa
            where cpa.customer_id = customers.id
              and lower(cpa.email) = $2
          )
        )
      order by
        case when $1 <> '' and customer_code = $1 then 1 else 2 end,
        created_at desc
      limit 1
    `,
    [normalizedCode, normalizedEmail],
  );

  return result.rows[0]?.id || null;
}

async function ensurePortalCustomer({ customerCode, email, name, phone }) {
  const normalizedCode = String(customerCode || '').trim().slice(0, 80);
  const normalizedEmail = normalizeEmail(email);
  const displayName = String(name || normalizedEmail || normalizedCode || '').trim().slice(0, 160);
  const contactPhone = String(phone || '').trim().slice(0, 80);

  if (normalizedCode) {
    const result = await query(
      `
        insert into customers (
          customer_code, display_name, contact_email, contact_phone, contract_status, ownership_type
        )
        values ($1, $2, nullif($3, ''), nullif($4, ''), 'lead', 'customer_owned')
        on conflict (customer_code) do update
        set
          display_name = excluded.display_name,
          contact_email = coalesce(excluded.contact_email, customers.contact_email),
          contact_phone = coalesce(excluded.contact_phone, customers.contact_phone),
          updated_at = now()
        returning id
      `,
      [normalizedCode, displayName || normalizedCode, normalizedEmail, contactPhone],
    );

    return result.rows[0]?.id || null;
  }

  return findCustomerIdByCodeOrEmail('', normalizedEmail);
}

function classifyPortalQuestion(question, requestedCategory, requestedStatus) {
  const text = String(question || '').toLowerCase();
  const category = normalizeChoice(
    requestedCategory,
    ['general', 'settlement', 'contract', 'adsense', 'tax', 'policy', 'technical'],
    'general',
  );
  const contains = (words) => words.some((word) => text.includes(word));
  const blockedKeywords = [
    '수익 보장',
    '애드센스 승인 보장',
    '승인 보장',
    '순위 보장',
    '트래픽 보장',
    '정책 우회',
    '계정 우회',
    '클릭 유도',
    '무효 트래픽',
  ];
  const reviewKeywords = [
    '세금',
    '원천징수',
    '사업자',
    '환급',
    '애드센스',
    'adsense',
    '계약',
    '해지',
    '정산',
    '입금',
    '개인정보',
  ];
  const isBlocked = contains(blockedKeywords);
  const needsReview = isBlocked || contains(reviewKeywords) || ['adsense', 'tax', 'policy', 'contract', 'settlement'].includes(category);
  const status = isBlocked
    ? 'blocked'
    : needsReview
      ? 'human_review'
      : normalizeChoice(requestedStatus, ['open', 'ai_draft', 'human_review', 'answered', 'closed', 'blocked'], 'open');

  return {
    category,
    status,
    aiAllowed: !isBlocked && !needsReview,
    humanReviewRequired: needsReview,
  };
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

function getContractStatusLabel(status) {
  const labels = {
    requested: '요청 접수',
    document_sent: '계약서 발송',
    signed: '서명 완료',
    setup_ready: '세팅 대기',
    closed: '종료',
    canceled: '취소',
  };

  return labels[status] || '요청 접수';
}

function mapContractRequest(row, { publicOnly = false } = {}) {
  const request = {
    id: row.id,
    customerCode: row.customer_code || row.requester_customer_code || 'NO_CUSTOMER',
    requesterName: row.requester_name,
    requesterEmail: publicOnly ? undefined : row.requester_email,
    requesterPhone: publicOnly ? undefined : row.requester_phone,
    desiredDomainCount: Number(row.desired_domain_count || 1),
    contractAmount: row.contract_amount,
    paymentTerms: row.payment_terms,
    status: row.status,
    statusLabel: getContractStatusLabel(row.status),
    requestMessage: row.request_message,
    publicMessage: row.public_message,
    contractDocumentUrl: row.contract_document_url,
    requestedAt: row.requested_at,
    updatedAt: row.updated_at,
    sentAt: row.sent_at,
    signedAt: row.signed_at,
    setupReadyAt: row.setup_ready_at,
    closedAt: row.closed_at,
  };

  if (!publicOnly) {
    request.internalNote = row.internal_note;
  }

  return request;
}

function mapTimelineItem(row) {
  return {
    id: row.id,
    type: row.item_type,
    title: row.title,
    message: row.message,
    status: row.status,
    statusLabel: row.status_label,
    category: row.category,
    occurredAt: row.occurred_at,
  };
}

async function createWordfriendsContractRequest(req, res) {
  if (!requireEventToken(req, res)) return undefined;

  const body = await readJsonBody(req);
  const requesterCustomerCode = String(body.customerCode || body.customer_code || '').trim().slice(0, 80);
  const requesterEmail = normalizeEmail(body.requesterEmail || body.requester_email || body.email);
  const requesterName = String(body.requesterName || body.requester_name || body.name || '').trim().slice(0, 160);
  const requesterPhone = String(body.requesterPhone || body.requester_phone || body.phone || '').trim().slice(0, 80);
  const desiredDomainCount = Math.min(100, Math.max(1, Number.parseInt(body.desiredDomainCount || body.desired_domain_count || 1, 10) || 1));
  const requestMessage = String(body.requestMessage || body.request_message || '').trim().slice(0, 2000);
  const sessionId = String(body.sessionId || body.session_id || '').trim().slice(0, 120);
  const pagePath = String(body.pagePath || body.page_path || '/contract-guide').trim().slice(0, 500);

  if (!requesterName || !requesterEmail) {
    return sendJson(req, res, 400, {
      ok: false,
      error: 'Requester name and email are required.',
    });
  }

  const customerId = await ensurePortalCustomer({
    customerCode: requesterCustomerCode,
    email: requesterEmail,
    name: requesterName,
    phone: requesterPhone,
  });
  const result = await query(
    `
      insert into portal_contract_requests (
        customer_id, requester_customer_code, requester_name, requester_email,
        requester_phone, desired_domain_count, contract_amount, payment_terms,
        status, request_message, public_message, updated_at
      )
      values ($1, nullif($2, ''), $3, $4, nullif($5, ''), $6, $7, 'lump_sum',
        'requested', nullif($8, ''), $9, now())
      returning id::text, requester_customer_code, requester_name, requester_email,
        requester_phone, desired_domain_count, contract_amount, payment_terms,
        status, request_message, public_message, internal_note, contract_document_url,
        requested_at, updated_at, sent_at, signed_at, setup_ready_at, closed_at
    `,
    [
      customerId,
      requesterCustomerCode,
      requesterName,
      requesterEmail,
      requesterPhone,
      desiredDomainCount,
      3000000,
      requestMessage,
      '계약 요청이 접수되었습니다. 담당자가 확인 후 전자계약 안내를 드립니다.',
    ],
  );

  await query(
    `
      insert into portal_activity_events (
        customer_id, session_id, event_type, page_path, event_payload, occurred_at
      )
      values ($1, $2, 'contract_started', $3, $4::jsonb, now())
    `,
    [
      customerId,
      sessionId || null,
      pagePath || null,
      JSON.stringify({
        source: 'wordfriends',
        contractRequestId: result.rows[0].id,
        requesterCustomerCode,
        requesterEmail,
        desiredDomainCount,
        client: getRequestClientMeta(req),
      }),
    ],
  );

  let emailWarning = '';

  try {
    await sendEmailViaSmtp({
      to: requesterEmail,
      subject: '[Wordfriends] 전자계약 요청 접수 안내',
      text: [
        `${requesterName}님, 전자계약 요청이 접수되었습니다.`,
        '',
        `요청 도메인 수: ${desiredDomainCount}개`,
        '담당자가 확인 후 전자계약 링크와 진행 안내를 드립니다.',
        '',
        '---',
        '수익, 애드센스 승인, 트래픽은 보장하지 않으며 계약 조건과 운영 현황을 기준으로 안내드립니다.',
      ].join('\n'),
    });
  } catch (error) {
    emailWarning = `Contract request email failed: ${error.message}`;
  }

  return sendJson(req, res, 201, {
    ok: true,
    contractRequest: mapContractRequest(result.rows[0], { publicOnly: true }),
    emailWarning,
  });
}

async function listWordfriendsContractRequests(req, res, url) {
  if (!requireEventToken(req, res)) return undefined;

  const customerCode = String(url.searchParams.get('customerCode') || url.searchParams.get('customer_code') || '')
    .trim()
    .slice(0, 80);
  const email = normalizeEmail(url.searchParams.get('email'));

  if (!customerCode && !email) {
    return sendJson(req, res, 400, {
      ok: false,
      error: 'customerCode or email is required.',
    });
  }

  const result = await query(
    `
      select pcr.id::text, c.customer_code, pcr.requester_customer_code,
        pcr.requester_name, pcr.requester_email, pcr.requester_phone,
        pcr.desired_domain_count, pcr.contract_amount, pcr.payment_terms,
        pcr.status, pcr.request_message, pcr.public_message, pcr.internal_note,
        pcr.contract_document_url, pcr.requested_at, pcr.updated_at,
        pcr.sent_at, pcr.signed_at, pcr.setup_ready_at, pcr.closed_at
      from portal_contract_requests pcr
      left join customers c on c.id = pcr.customer_id
      where
        ($1 <> '' and (pcr.requester_customer_code = $1 or c.customer_code = $1))
        or ($2 <> '' and lower(pcr.requester_email) = $2)
      order by pcr.requested_at desc
      limit 20
    `,
    [customerCode, email],
  );

  return sendJson(req, res, 200, {
    ok: true,
    contractRequests: result.rows.map((row) => mapContractRequest(row, { publicOnly: true })),
  });
}

async function listWordfriendsTimeline(req, res, url) {
  if (!requireEventToken(req, res)) return undefined;

  const customerCode = String(url.searchParams.get('customerCode') || url.searchParams.get('customer_code') || '')
    .trim()
    .slice(0, 80);
  const email = normalizeEmail(url.searchParams.get('email'));

  if (!customerCode && !email) {
    return sendJson(req, res, 400, {
      ok: false,
      error: 'customerCode or email is required.',
    });
  }

  const customerResult = await queryOptionalParams(
    `
      select id, customer_code
      from customers
      where
        ($1 <> '' and customer_code = $1)
        or ($2 <> '' and lower(contact_email) = $2)
        or exists (
          select 1
          from customer_portal_accounts cpa
          where cpa.customer_id = customers.id
            and $2 <> ''
            and lower(cpa.email) = $2
        )
      limit 20
    `,
    [customerCode, email],
  );
  const customerIds = customerResult.rows.map((row) => row.id);

  const [notifications, contracts, questions, sites] = await Promise.all([
    queryOptionalParams(
      `
        select id::text, title, message, send_status as status, severity, category,
          created_at as sort_at, to_char(created_at, 'YYYY-MM-DD HH24:MI') as occurred_at
        from notifications
        where audience_type = 'customer'
          and visibility = 'public_to_customer'
          and marketing_message = false
          and (customer_id is null or customer_id = any($1::uuid[]))
        order by created_at desc
        limit 20
      `,
      [customerIds],
    ),
    queryOptionalParams(
      `
        select id::text, status, public_message, updated_at as sort_at,
          to_char(updated_at, 'YYYY-MM-DD HH24:MI') as occurred_at
        from portal_contract_requests
        where
          ($1 <> '' and (requester_customer_code = $1 or customer_id = any($3::uuid[])))
          or ($2 <> '' and lower(requester_email) = $2)
        order by updated_at desc
        limit 20
      `,
      [customerCode, email, customerIds],
    ),
    queryOptionalParams(
      `
        select id::text, category, status, response_status, response_message, updated_at as sort_at,
          to_char(updated_at, 'YYYY-MM-DD HH24:MI') as occurred_at
        from portal_question_threads
        where
          ($1 <> '' and (requester_customer_code = $1 or customer_id = any($3::uuid[])))
          or ($2 <> '' and lower(requester_email) = $2)
        order by updated_at desc
        limit 20
      `,
      [customerCode, email, customerIds],
    ),
    queryOptionalParams(
      `
        select id::text, domain, status, updated_at as sort_at,
          to_char(updated_at, 'YYYY-MM-DD HH24:MI') as occurred_at
        from sites
        where customer_id = any($1::uuid[])
          and is_internal_infra = false
        order by updated_at desc
        limit 20
      `,
      [customerIds],
    ),
  ]);

  const items = [
    ...notifications.rows.map((row) => ({
      id: row.id,
      item_type: 'notification',
      title: row.title,
      message: row.message,
      status: row.status,
      status_label: row.severity === 'critical'
        ? '중요'
        : row.severity === 'warning'
          ? '확인 필요'
          : row.severity === 'action_required'
            ? '조치 필요'
            : '안내',
      category: row.category,
      occurred_at: row.occurred_at,
      sort_at: row.sort_at,
    })),
    ...contracts.rows.map((row) => ({
      id: row.id,
      item_type: 'contract',
      title: '전자계약 진행',
      message: row.public_message || '전자계약 요청 상태가 갱신되었습니다.',
      status: row.status,
      status_label: getContractStatusLabel(row.status),
      category: 'contract',
      occurred_at: row.occurred_at,
      sort_at: row.sort_at,
    })),
    ...questions.rows.map((row) => ({
      id: row.id,
      item_type: 'question',
      title: '문의 처리',
      message: row.response_message || '문의가 접수되어 담당자가 확인 중입니다.',
      status: row.status,
      status_label: row.status === 'answered' || ['sent', 'recorded'].includes(row.response_status)
        ? '답변 완료'
        : row.status === 'human_review'
          ? '사람 검토'
          : row.status === 'blocked'
            ? '확인 필요'
            : '접수',
      category: row.category,
      occurred_at: row.occurred_at,
      sort_at: row.sort_at,
    })),
    ...sites.rows.map((row) => ({
      id: row.id,
      item_type: 'site',
      title: '사이트 현황',
      message: `${row.domain} 운영 상태가 갱신되었습니다.`,
      status: row.status,
      status_label: getPublicSiteStatusLabel(row.status),
      category: 'domain',
      occurred_at: row.occurred_at,
      sort_at: row.sort_at,
    })),
  ]
    .sort((a, b) => new Date(b.sort_at).getTime() - new Date(a.sort_at).getTime())
    .slice(0, 40);

  return sendJson(req, res, 200, {
    ok: true,
    timeline: items.map(mapTimelineItem),
  });
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

function mapDomainCandidate(row) {
  return {
    id: row.id,
    domain: row.domain,
    sourceType: row.source_type,
    category: row.category,
    keywords: row.keywords || [],
    languagePriority: row.language_priority,
    tld: row.tld,
    pricePolicy: row.price_policy,
    registrarChannel: row.registrar_channel,
    candidateStyle: row.candidate_style,
    availabilityStatus: row.availability_status,
    auditStatus: row.audit_status,
    purchaseStatus: row.purchase_status,
    notes: row.notes,
    updatedAt: row.updated_at,
  };
}

async function createDomainCandidates(req, res) {
  const body = await readJsonBody(req);
  const rawCandidates = Array.isArray(body.candidates) ? body.candidates : [];
  const category = String(body.category || '').trim();
  const keywords = normalizeTextArray(body.keywords);
  const languagePriority = normalizeChoice(body.languagePriority, ['ko', 'en', 'mixed'], 'mixed');
  const pricePolicy = normalizeChoice(
    body.pricePolicy,
    ['general_only', 'premium_review', 'premium_allowed'],
    'general_only',
  );

  const candidates = rawCandidates
    .map((candidate) => ({
      domain: normalizeDomain(candidate.domain),
      tld: String(candidate.tld || '').trim(),
      registrarChannel: String(candidate.channel || candidate.registrarChannel || '').trim(),
      candidateStyle: String(candidate.style || candidate.candidateStyle || '').trim(),
      notes: String(candidate.notes || '').trim(),
    }))
    .filter((candidate) => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(candidate.domain))
    .slice(0, 100);

  if (!candidates.length) {
    return sendJson(req, res, 400, {
      ok: false,
      error: 'At least one valid candidate domain is required.',
    });
  }

  const saved = [];

  for (const candidate of candidates) {
    const result = await query(
      `
        insert into domain_candidates (
          domain, source_type, category, keywords, language_priority, tld,
          price_policy, registrar_channel, candidate_style, availability_status,
          audit_status, purchase_status, notes, updated_at
        )
        values (
          $1, 'generated', $2, $3, $4, $5,
          $6, $7, $8, 'unchecked',
          'queued', 'not_approved', $9, now()
        )
        on conflict (domain) do update set
          category = excluded.category,
          keywords = excluded.keywords,
          language_priority = excluded.language_priority,
          tld = excluded.tld,
          price_policy = excluded.price_policy,
          registrar_channel = excluded.registrar_channel,
          candidate_style = excluded.candidate_style,
          audit_status = 'queued',
          purchase_status = case
            when domain_candidates.purchase_status = 'purchased' then domain_candidates.purchase_status
            else 'not_approved'
          end,
          notes = excluded.notes,
          updated_at = now()
        returning id::text, domain, source_type, category, keywords, language_priority,
          tld, price_policy, registrar_channel, candidate_style, availability_status,
          audit_status, purchase_status, notes, to_char(updated_at, 'YYYY-MM-DD HH24:MI') as updated_at
      `,
      [
        candidate.domain,
        category,
        keywords,
        languagePriority,
        candidate.tld,
        pricePolicy,
        candidate.registrarChannel,
        candidate.candidateStyle,
        candidate.notes || 'Generated from SiteOps domain discovery.',
      ],
    );

    saved.push(mapDomainCandidate(result.rows[0]));
  }

  return sendJson(req, res, 201, { ok: true, savedCount: saved.length, candidates: saved });
}

async function createWordfriendsEvent(req, res) {
  if (!requireEventToken(req, res)) return undefined;

  const body = await readJsonBody(req);
  const eventType = normalizeChoice(
    body.eventType || body.event_type,
    [
      'page_view',
      'signup_started',
      'signup_completed',
      'login',
      'contract_started',
      'contract_completed',
      'site_viewed',
      'settlement_viewed',
      'question_submitted',
      'ai_handoff',
    ],
    '',
  );

  if (!eventType) {
    return sendJson(req, res, 400, {
      ok: false,
      error: 'A valid eventType is required.',
    });
  }

  const customerId = await findCustomerIdByCodeOrEmail(
    body.customerCode || body.customer_code,
    body.email || body.requesterEmail || body.requester_email,
  );
  const sessionId = String(body.sessionId || body.session_id || '').trim().slice(0, 120);
  const pagePath = String(body.pagePath || body.page_path || '').trim().slice(0, 500);
  const payload = {
    ...(body.payload && typeof body.payload === 'object' ? body.payload : {}),
    source: 'wordfriends',
    client: getRequestClientMeta(req),
  };

  const event = await query(
    `
      insert into portal_activity_events (
        customer_id, session_id, event_type, page_path, event_payload, occurred_at
      )
      values ($1, $2, $3, $4, $5::jsonb, now())
      returning id::text, event_type, to_char(occurred_at, 'YYYY-MM-DD HH24:MI:SS') as occurred_at
    `,
    [customerId, sessionId || null, eventType, pagePath || null, JSON.stringify(payload)],
  );

  return sendJson(req, res, 201, {
    ok: true,
    event: event.rows[0],
  });
}

async function createWordfriendsQuestion(req, res) {
  if (!requireEventToken(req, res)) return undefined;

  const body = await readJsonBody(req);
  const question = String(body.question || '').trim();

  if (question.length < 3) {
    return sendJson(req, res, 400, {
      ok: false,
      error: 'Question is required.',
    });
  }

  const requesterCustomerCode = String(body.customerCode || body.customer_code || '').trim().slice(0, 80);
  const requesterEmail = normalizeEmail(body.requesterEmail || body.requester_email || body.email);
  const requesterName = String(body.requesterName || body.requester_name || body.name || '').trim().slice(0, 160);
  const requesterPhone = String(body.requesterPhone || body.requester_phone || body.phone || '').trim().slice(0, 80);
  const customerId = await ensurePortalCustomer({
    customerCode: requesterCustomerCode,
    email: requesterEmail,
    name: requesterName,
    phone: requesterPhone,
  });
  const sessionId = String(body.sessionId || body.session_id || '').trim().slice(0, 120);
  const pagePath = String(body.pagePath || body.page_path || '/contact').trim().slice(0, 500);
  const classification = classifyPortalQuestion(question, body.category, body.status);
  const answerSummary = String(body.answerSummary || body.answer_summary || '').trim();

  let thread;

  try {
    thread = await query(
      `
        insert into portal_question_threads (
          customer_id, question, category, status, ai_allowed,
          human_review_required, answer_summary, requester_customer_code,
          requester_email, requester_name, requester_phone, updated_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, nullif($8, ''), nullif($9, ''), nullif($10, ''), nullif($11, ''), now())
        returning id::text, category, status, ai_allowed, human_review_required,
          to_char(updated_at, 'YYYY-MM-DD HH24:MI') as updated_at
      `,
      [
        customerId,
        question.slice(0, 2000),
        classification.category,
        classification.status,
        classification.aiAllowed,
        classification.humanReviewRequired,
        answerSummary || null,
        requesterCustomerCode,
        requesterEmail,
        requesterName,
        requesterPhone,
      ],
    );
  } catch (error) {
    if (error.code !== '42703') {
      throw error;
    }

    const contactLines = [
      requesterName ? `Requester: ${requesterName}` : '',
      requesterEmail ? `Email: ${requesterEmail}` : '',
      requesterPhone ? `Phone: ${requesterPhone}` : '',
      requesterCustomerCode ? `Customer code: ${requesterCustomerCode}` : '',
    ].filter(Boolean);
    const fallbackQuestion = `${contactLines.join('\n')}${contactLines.length ? '\n\n' : ''}${question}`.slice(0, 2000);

    thread = await query(
      `
        insert into portal_question_threads (
          customer_id, question, category, status, ai_allowed,
          human_review_required, answer_summary, updated_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, now())
        returning id::text, category, status, ai_allowed, human_review_required,
          to_char(updated_at, 'YYYY-MM-DD HH24:MI') as updated_at
      `,
      [
        customerId,
        fallbackQuestion,
        classification.category,
        classification.status,
        classification.aiAllowed,
        classification.humanReviewRequired,
        answerSummary || null,
      ],
    );
  }

  await query(
    `
      insert into portal_activity_events (
        customer_id, session_id, event_type, page_path, event_payload, occurred_at
      )
      values ($1, $2, 'question_submitted', $3, $4::jsonb, now())
    `,
    [
      customerId,
      sessionId || null,
      pagePath || null,
      JSON.stringify({
        source: 'wordfriends',
        questionThreadId: thread.rows[0].id,
        category: classification.category,
        status: classification.status,
        requesterCustomerCode,
        requesterEmail,
        client: getRequestClientMeta(req),
      }),
    ],
  );

  if (classification.humanReviewRequired) {
    await query(
      `
        insert into portal_activity_events (
          customer_id, session_id, event_type, page_path, event_payload, occurred_at
        )
        values ($1, $2, 'ai_handoff', $3, $4::jsonb, now())
      `,
      [
        customerId,
        sessionId || null,
        pagePath || null,
        JSON.stringify({
          source: 'wordfriends',
          questionThreadId: thread.rows[0].id,
          reason: classification.status === 'blocked' ? 'blocked_keyword' : 'human_review_required',
        }),
      ],
    );
  }

  return sendJson(req, res, 201, {
    ok: true,
    question: {
      ...thread.rows[0],
      customerCode: requesterCustomerCode || 'NO_CUSTOMER',
    },
  });
}

function mapPublicQuestion(row) {
  const statusLabel = row.status === 'answered' || ['sent', 'recorded'].includes(row.response_status)
    ? '답변 완료'
    : row.status === 'human_review'
      ? '사람 검토'
      : '접수';

  return {
    id: row.id,
    category: row.category,
    status: row.status,
    statusLabel,
    question: row.question,
    answerSummary: row.response_message ? '답변이 등록되었습니다.' : '담당자 검토 대기',
    responseStatus: row.response_status,
    responseMessage: row.response_message,
    respondedAt: row.responded_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function listWordfriendsQuestions(req, res, url) {
  if (!requireEventToken(req, res)) return undefined;

  const customerCode = String(url.searchParams.get('customerCode') || url.searchParams.get('customer_code') || '')
    .trim()
    .slice(0, 80);
  const email = normalizeEmail(url.searchParams.get('email'));

  if (!customerCode && !email) {
    return sendJson(req, res, 400, {
      ok: false,
      error: 'customerCode or email is required.',
    });
  }

  const result = await queryOptionalParams(
    `
      select pqt.id::text, pqt.category, pqt.status, pqt.question,
        pqt.response_status, pqt.response_message, pqt.responded_at,
        pqt.created_at, pqt.updated_at
      from portal_question_threads pqt
      left join customers c on c.id = pqt.customer_id
      where
        ($1 <> '' and (pqt.requester_customer_code = $1 or c.customer_code = $1))
        or ($2 <> '' and lower(pqt.requester_email) = $2)
      order by pqt.created_at desc
      limit 50
    `,
    [customerCode, email],
  );

  if (!result.rows.length) {
    const fallbackResult = await queryOptionalParams(
      `
        select pqt.id::text, pqt.category, pqt.status, pqt.question,
          pqt.response_status, pqt.response_message, pqt.responded_at,
          pqt.created_at, pqt.updated_at
        from portal_question_threads pqt
        left join customers c on c.id = pqt.customer_id
        where
          ($1 <> '' and c.customer_code = $1)
          or ($2 <> '' and lower(pqt.question) like '%' || $2 || '%')
        order by pqt.created_at desc
        limit 50
      `,
      [customerCode, email],
    );

    return sendJson(req, res, 200, {
      ok: true,
      questions: fallbackResult.rows.map(mapPublicQuestion),
    });
  }

  return sendJson(req, res, 200, {
    ok: true,
    questions: result.rows.map(mapPublicQuestion),
  });
}

function getPublicSiteStatusLabel(status) {
  if (status === 'active') return '운영 중';
  if (status === 'paused') return '일시 중지';
  if (status === 'archived') return '보관됨';
  return '준비 중';
}

function getPublicContentStatusLabel(row) {
  const published = Number(row.published_count || 0);
  const approved = Number(row.approved_count || 0);
  const inProgress = Number(row.in_progress_count || 0);

  if (published > 0) return `${published}건 발행 완료`;
  if (approved > 0) return `${approved}건 발행 준비`;
  if (inProgress > 0) return `${inProgress}건 작성/검토 중`;
  return '콘텐츠 준비 중';
}

function getPublicSitemapStatusLabel(status) {
  if (['submitted', 'verified'].includes(status)) return '제출 완료';
  if (status === 'ready') return '제출 준비';
  if (['failed', 'manual_required'].includes(status)) return '확인 필요';
  return '준비 중';
}

function getPublicSettlementStatusLabel(status) {
  if (status === 'paid') return '입금 완료';
  if (status === 'invoiced') return '입금 예정';
  if (status === 'confirmed') return '정산 확정';
  if (status === 'void') return '정산 제외';
  return '정산 준비 중';
}

function getPublicReferralStatusLabel(status) {
  if (status === 'paid') return '지급 완료';
  if (status === 'payable') return '지급 예정';
  if (status === 'confirmed') return '확정';
  if (status === 'held') return '보류';
  if (status === 'void') return '제외';
  if (status === 'approved') return '승인';
  if (status === 'rejected') return '반려';
  return '검토 중';
}

function formatKrw(value) {
  const amount = Number(value || 0);
  return `${Math.round(amount).toLocaleString('ko-KR')}원`;
}

function mapPublicSettlement(row) {
  return {
    month: row.settlement_month,
    domain: row.domain,
    grossRevenue: formatKrw(row.gross_revenue),
    agencyFee: formatKrw(row.agency_fee_amount),
    status: row.status,
    statusLabel: getPublicSettlementStatusLabel(row.status),
    withholdingEstimate: row.total_withholding_amount === null ? null : {
      type: row.estimate_type || 'manual_review',
      grossAmount: formatKrw(row.estimate_gross_amount),
      totalWithholdingAmount: formatKrw(row.total_withholding_amount),
      netPayableAmount: formatKrw(row.net_payable_amount),
      disclaimer: row.disclaimer || '세액은 참고용이며 최종 처리는 세무 전문가 확인이 필요합니다.',
    },
  };
}

function mapPublicReferralReward(row) {
  return {
    referredCustomerCode: row.referred_customer_code,
    depth: Number(row.depth || 1),
    rewardMonth: row.reward_month,
    rewardAmount: formatKrw(row.reward_amount),
    status: row.reward_status,
    statusLabel: getPublicReferralStatusLabel(row.reward_status || row.relationship_status),
  };
}

function mapPublicSite(row) {
  return {
    siteKey: row.site_key,
    domain: row.domain,
    siteName: row.site_name || row.domain,
    status: row.status,
    statusLabel: getPublicSiteStatusLabel(row.status),
    wpStatus: row.wp_status || 'pending',
    contentStatus: getPublicContentStatusLabel(row),
    content: {
      publishedCount: Number(row.published_count || 0),
      approvedCount: Number(row.approved_count || 0),
      inProgressCount: Number(row.in_progress_count || 0),
      failedCount: Number(row.failed_count || 0),
      nextScheduledAt: row.next_scheduled_at,
    },
    sitemap: {
      status: row.sitemap_status || 'draft',
      statusLabel: getPublicSitemapStatusLabel(row.sitemap_status),
      lastCheckedAt: row.sitemap_last_checked_at,
    },
    seo: {
      adsTxtStatus: row.ads_txt_status || 'unknown',
      adsenseStatus: row.adsense_status || 'not_started',
      note: '승인, 트래픽, 수익은 보장되지 않으며 운영 현황 기준으로 안내됩니다.',
    },
    settlementStatus: getPublicSettlementStatusLabel(row.settlement_status),
    updatedAt: row.updated_at,
  };
}

async function listWordfriendsSites(req, res, url) {
  if (!requireEventToken(req, res)) return undefined;

  const customerCode = String(url.searchParams.get('customerCode') || url.searchParams.get('customer_code') || '')
    .trim()
    .slice(0, 80);
  const email = normalizeEmail(url.searchParams.get('email'));

  if (!customerCode && !email) {
    return sendJson(req, res, 400, {
      ok: false,
      error: 'customerCode or email is required.',
    });
  }

  const result = await query(
    `
      with matched_customers as (
        select id
        from customers
        where
          ($1 <> '' and customer_code = $1)
          or ($2 <> '' and lower(contact_email) = $2)
        union
        select customer_id
        from customer_portal_accounts
        where $2 <> '' and lower(email) = $2
      )
      select s.site_key, s.domain, s.site_name, s.status, s.updated_at,
        wc.status as wp_status,
        ads.application_status as adsense_status,
        ads.ads_txt_status,
        cq.published_count,
        cq.approved_count,
        cq.in_progress_count,
        cq.failed_count,
        cq.next_scheduled_at,
        ss.submission_status as sitemap_status,
        ss.last_checked_at as sitemap_last_checked_at,
        rs.status as settlement_status
      from sites s
      join matched_customers mc on mc.id = s.customer_id
      left join wordpress_connections wc on wc.site_id = s.id
      left join adsense_status ads on ads.site_id = s.id
      left join lateral (
        select
          count(*) filter (where status = 'published')::int as published_count,
          count(*) filter (where status = 'approved')::int as approved_count,
          count(*) filter (where status in ('draft', 'ready', 'processing', 'generated', 'review_required'))::int as in_progress_count,
          count(*) filter (where status in ('failed', 'validation_failed'))::int as failed_count,
          to_char(min(scheduled_date) filter (where scheduled_date >= now()), 'YYYY-MM-DD HH24:MI') as next_scheduled_at
        from content_queue
        where site_id = s.id or site_key = s.site_key
      ) cq on true
      left join lateral (
        select submission_status, to_char(last_checked_at, 'YYYY-MM-DD HH24:MI') as last_checked_at
        from sitemap_submissions
        where site_id = s.id or domain = s.domain
        order by coalesce(last_checked_at, updated_at, created_at) desc
        limit 1
      ) ss on true
      left join lateral (
        select status
        from revenue_settlements
        where site_id = s.id
        order by settlement_month desc, updated_at desc
        limit 1
      ) rs on true
      where s.is_internal_infra = false
      order by
        case s.status when 'active' then 1 when 'draft' then 2 when 'paused' then 3 else 4 end,
        s.updated_at desc
      limit 50
    `,
    [customerCode, email],
  );

  return sendJson(req, res, 200, {
    ok: true,
    sites: result.rows.map(mapPublicSite),
  });
}

async function listWordfriendsSettlementReferrals(req, res, url) {
  if (!requireEventToken(req, res)) return undefined;

  const customerCode = String(url.searchParams.get('customerCode') || url.searchParams.get('customer_code') || '')
    .trim()
    .slice(0, 80);
  const email = normalizeEmail(url.searchParams.get('email'));

  if (!customerCode && !email) {
    return sendJson(req, res, 400, {
      ok: false,
      error: 'customerCode or email is required.',
    });
  }

  const customerResult = await query(
    `
      select id, customer_code
      from customers
      where
        ($1 <> '' and customer_code = $1)
        or ($2 <> '' and lower(contact_email) = $2)
        or exists (
          select 1
          from customer_portal_accounts cpa
          where cpa.customer_id = customers.id
            and $2 <> ''
            and lower(cpa.email) = $2
        )
      order by updated_at desc
      limit 1
    `,
    [customerCode, email],
  );

  if (!customerResult.rowCount) {
    return sendJson(req, res, 200, {
      ok: true,
      customerCode: customerCode || '',
      referralCode: null,
      settlements: [],
      referralRewards: [],
      taxProfile: {
        withholdingCategory: 'needs_review',
        label: '세무 정보 확인 필요',
        disclaimer: '세액과 지급 방식은 참고용이며 최종 처리는 세무 전문가 확인이 필요합니다.',
      },
    });
  }

  const customer = customerResult.rows[0];

  const [referralCode, settlements, referralRewards, taxProfile] = await Promise.all([
    query(
      `
        select code, status
        from referral_codes
        where customer_id = $1
        order by case status when 'active' then 1 when 'paused' then 2 else 3 end, created_at desc
        limit 1
      `,
      [customer.id],
    ),
    query(
      `
        select to_char(rs.settlement_month, 'YYYY-MM') as settlement_month,
          s.domain, rs.gross_revenue, rs.agency_fee_amount, rs.status,
          we.estimate_type, we.gross_amount as estimate_gross_amount,
          we.total_withholding_amount, we.net_payable_amount, we.disclaimer
        from revenue_settlements rs
        left join sites s on s.id = rs.site_id
        left join lateral (
          select estimate_type, gross_amount, total_withholding_amount, net_payable_amount, disclaimer
          from withholding_estimates
          where settlement_id = rs.id
          order by created_at desc
          limit 1
        ) we on true
        where rs.customer_id = $1
        order by rs.settlement_month desc
        limit 12
      `,
      [customer.id],
    ),
    query(
      `
        select cc.customer_code as referred_customer_code, rr.depth, rr.status as relationship_status,
          to_char(rew.reward_month, 'YYYY-MM') as reward_month,
          rew.reward_amount, rew.status as reward_status
        from referral_relationships rr
        join customers cc on cc.id = rr.referred_customer_id
        left join referral_rewards rew on rew.referral_relationship_id = rr.id
        where rr.referrer_customer_id = $1
          and rr.depth = 1
        order by coalesce(rew.reward_month, date_trunc('month', rr.created_at)) desc, rr.created_at desc
        limit 20
      `,
      [customer.id],
    ),
    query(
      `
        select withholding_category
        from tax_profiles
        where customer_id = $1
        order by updated_at desc
        limit 1
      `,
      [customer.id],
    ),
  ]);

  const taxCategory = taxProfile.rows[0]?.withholding_category || 'needs_review';
  const taxLabels = {
    business_income_3_3: '사업소득 3.3% 참고',
    other_income_8_8_reference: '기타소득 8.8% 참고',
    invoice_required: '세금계산서 확인 필요',
    needs_review: '세무 정보 확인 필요',
  };

  return sendJson(req, res, 200, {
    ok: true,
    customerCode: customer.customer_code,
    referralCode: referralCode.rows[0] || null,
    settlements: settlements.rows.map(mapPublicSettlement),
    referralRewards: referralRewards.rows.map(mapPublicReferralReward),
    taxProfile: {
      withholdingCategory: taxCategory,
      label: taxLabels[taxCategory] || taxLabels.needs_review,
      disclaimer: '세액과 지급 방식은 참고용이며 최종 처리는 세무 전문가 확인이 필요합니다.',
    },
    policyNote: '수익, 애드센스 승인, 트래픽은 보장하지 않으며 정산/추천 보상은 계약과 검토 결과를 기준으로 안내됩니다.',
  });
}

async function updateWordfriendsQuestionReply(req, res, questionId) {
  const body = await readJsonBody(req);
  const channel = normalizeChoice(body.responseChannel || body.response_channel, ['manual', 'email', 'sms', 'kakao', 'telegram'], 'manual');
  const responseStatus = normalizeChoice(
    body.responseStatus || body.response_status,
    ['not_started', 'draft', 'queued', 'sent', 'recorded', 'failed'],
    'draft',
  );
  let nextStatus = normalizeChoice(body.status, ['open', 'ai_draft', 'human_review', 'answered', 'closed', 'blocked'], 'human_review');
  const message = String(body.responseMessage || body.response_message || '').trim();
  const note = String(body.responseNote || body.response_note || '').trim();

  if (!message && !note) {
    return sendJson(req, res, 400, {
      ok: false,
      error: 'Response message or note is required.',
    });
  }

  let existing = await queryOptionalParams(
    `
      select id::text, category, status, question, response_channel, response_status,
        response_message, response_note, answer_summary, requester_email, responded_at, updated_at
      from portal_question_threads
      where id = $1
    `,
    [questionId],
  );

  if (!existing.rowCount) {
    existing = await query(
      `
        select id::text, category, status, question, response_channel, response_status,
          response_message, response_note, answer_summary, null::text as requester_email,
          responded_at, updated_at
        from portal_question_threads
        where id = $1
      `,
      [questionId],
    );
  }

  if (!existing.rowCount) {
    return sendJson(req, res, 404, {
      ok: false,
      error: 'Question was not found.',
    });
  }

  let effectiveResponseStatus = responseStatus;
  let responseError = null;

  if (channel !== 'email' && responseStatus === 'sent') {
    effectiveResponseStatus = 'recorded';
    nextStatus = 'answered';
  }

  if (channel === 'email' && responseStatus === 'sent') {
    if (!message) {
      return sendJson(req, res, 400, {
        ok: false,
        error: 'Response message is required before sending email.',
      });
    }

    const recipientEmail = existing.rows[0].requester_email || extractEmailAddress(existing.rows[0].question);

    if (!recipientEmail) {
      return sendJson(req, res, 400, {
        ok: false,
        error: 'No recipient email was found in the question.',
      });
    }

    try {
      await sendEmailViaSmtp({
        to: recipientEmail,
        subject: '[Wordfriends] 문의 답변 안내',
        text: [
          message,
          '',
          '---',
          '본 메일은 Wordfriends 문의 답변으로 발송되었습니다.',
          '수익, 애드센스 승인, 트래픽은 보장하지 않으며 운영 현황과 검토 결과를 기준으로 안내드립니다.',
        ].join('\n'),
      });
      nextStatus = 'answered';
      effectiveResponseStatus = 'sent';
    } catch (error) {
      responseError = error.message;
      effectiveResponseStatus = 'failed';
      nextStatus = 'human_review';
    }
  }

  let updated;

  try {
    updated = await query(
      `
        update portal_question_threads
        set
          response_channel = $2,
          response_status = $3,
          response_message = nullif($4, ''),
          response_note = nullif($5, ''),
          response_error = nullif($7, ''),
          answer_summary = coalesce(nullif($5, ''), nullif($4, ''), answer_summary),
          status = $6,
          responded_at = case when $3 in ('queued', 'sent', 'recorded') then coalesce(responded_at, now()) else responded_at end,
          updated_at = now()
        where id = $1
        returning id::text, category, status, response_channel, response_status,
          response_message, response_note, response_error, answer_summary, responded_at, updated_at
      `,
      [questionId, channel, effectiveResponseStatus, message, note, nextStatus, responseError],
    );
  } catch (error) {
    if (error.code !== '42703') {
      throw error;
    }

    updated = await query(
      `
        update portal_question_threads
        set
          response_channel = $2,
          response_status = $3,
          response_message = nullif($4, ''),
          response_note = nullif($5, ''),
          answer_summary = coalesce(nullif($5, ''), nullif($4, ''), answer_summary),
          status = $6,
          responded_at = case when $3 in ('queued', 'sent', 'recorded') then coalesce(responded_at, now()) else responded_at end,
          updated_at = now()
        where id = $1
        returning id::text, category, status, response_channel, response_status,
          response_message, response_note, null::text as response_error, answer_summary, responded_at, updated_at
      `,
      [questionId, channel, effectiveResponseStatus, message, note, nextStatus],
    );
  }

  if (responseError) {
    return sendJson(req, res, 200, {
      ok: false,
      error: `Email send failed: ${responseError}`,
      question: updated.rows[0],
    });
  }

  return sendJson(req, res, 200, {
    ok: true,
    question: updated.rows[0],
  });
}

async function updateWordfriendsContractRequest(req, res, contractRequestId) {
  const body = await readJsonBody(req);
  const status = normalizeChoice(
    body.status,
    ['requested', 'document_sent', 'signed', 'setup_ready', 'closed', 'canceled'],
    'requested',
  );
  const publicMessage = String(body.publicMessage || body.public_message || '').trim().slice(0, 2000);
  const internalNote = String(body.internalNote || body.internal_note || '').trim().slice(0, 2000);
  const contractDocumentUrl = String(body.contractDocumentUrl || body.contract_document_url || '').trim().slice(0, 1000);

  if (status === 'document_sent' && !contractDocumentUrl) {
    return sendJson(req, res, 400, {
      ok: false,
      error: 'Contract document URL is required before marking the request as document_sent.',
    });
  }

  const result = await query(
    `
      update portal_contract_requests
      set status = $2,
        public_message = nullif($3, ''),
        internal_note = nullif($4, ''),
        contract_document_url = nullif($5, ''),
        updated_at = now(),
        sent_at = case when $2 = 'document_sent' and sent_at is null then now() else sent_at end,
        signed_at = case when $2 = 'signed' and signed_at is null then now() else signed_at end,
        setup_ready_at = case when $2 = 'setup_ready' and setup_ready_at is null then now() else setup_ready_at end,
        closed_at = case when $2 in ('closed', 'canceled') and closed_at is null then now() else closed_at end
      where id = $1::uuid
      returning id::text, requester_customer_code, requester_name, requester_email,
        requester_phone, desired_domain_count, contract_amount, payment_terms,
        status, request_message, public_message, internal_note, contract_document_url,
        requested_at, updated_at, sent_at, signed_at, setup_ready_at, closed_at
    `,
    [contractRequestId, status, publicMessage, internalNote, contractDocumentUrl],
  );

  if (result.rowCount === 0) {
    return sendJson(req, res, 404, {
      ok: false,
      error: 'Contract request not found.',
    });
  }

  if (status === 'signed' || status === 'setup_ready') {
    await query(
      `
        insert into portal_activity_events (
          customer_id, session_id, event_type, page_path, event_payload, occurred_at
        )
        select customer_id, null, 'contract_completed', '/contract-guide', $2::jsonb, now()
        from portal_contract_requests
        where id = $1::uuid
      `,
      [
        contractRequestId,
        JSON.stringify({
          source: 'siteops',
          contractRequestId,
          status,
          requesterCustomerCode: result.rows[0].requester_customer_code,
        }),
      ],
    );
  }

  let emailWarning = '';
  let emailSent = false;
  const savedRequest = result.rows[0];

  if (savedRequest.requester_email && ['document_sent', 'signed', 'setup_ready'].includes(status)) {
    try {
      const statusLabel = getContractStatusLabel(status);
      const lines = [
        `${savedRequest.requester_name}님, 전자계약 진행 상태가 변경되었습니다.`,
        '',
        `현재 상태: ${statusLabel}`,
      ];

      if (status === 'document_sent' && savedRequest.contract_document_url) {
        lines.push('', `전자계약 링크: ${savedRequest.contract_document_url}`);
      }

      if (savedRequest.public_message) {
        lines.push('', savedRequest.public_message);
      }

      lines.push(
        '',
        '---',
        '수익, 애드센스 승인, 트래픽은 보장하지 않으며 계약 조건과 운영 현황을 기준으로 안내드립니다.',
      );

      await sendEmailViaSmtp({
        to: savedRequest.requester_email,
        subject: `[Wordfriends] 전자계약 ${statusLabel} 안내`,
        text: lines.join('\n'),
      });
      emailSent = true;
    } catch (error) {
      emailWarning = `Contract status email failed: ${error.message}`;
    }
  }

  return sendJson(req, res, 200, {
    ok: true,
    contractRequest: mapContractRequest(savedRequest),
    emailSent,
    emailWarning,
  });
}

async function getN8nSiteRuntime(req, res, url) {
  const siteKey = String(url.searchParams.get('siteKey') || url.searchParams.get('site_key') || '').trim();

  if (!siteKey) {
    return sendJson(req, res, 400, {
      ok: false,
      error: 'siteKey is required.',
    });
  }

  const result = await query(
    `
      select s.site_key, s.domain, s.status as site_status, s.portfolio_status,
        s.risk_level, s.guardrail_level, wc.wp_base_url, wc.wp_credential_ref,
        wc.status as wp_connection_status,
        spa.proxy_profile_key, spa.proxy_provider, spa.proxy_type, spa.proxy_region,
        spa.egress_policy, spa.credential_ref as proxy_credential_ref,
        spa.status as proxy_status,
        srp.request_profile_key, srp.user_agent_label, srp.publish_window_start,
        srp.publish_window_end, srp.max_posts_per_day, srp.style_profile,
        srp.quality_gate, srp.status as runtime_status,
        stp.plan_stage, stp.trust_score, stp.status as trust_status
      from sites s
      left join wordpress_connections wc on wc.site_id = s.id
      left join site_proxy_assignments spa on spa.site_id = s.id
      left join site_runtime_profiles srp on srp.site_id = s.id
      left join site_trust_plans stp on stp.site_id = s.id
      where s.site_key = $1
      limit 1
    `,
    [siteKey],
  );

  const row = result.rows[0];
  if (!row) {
    return sendJson(req, res, 404, {
      ok: false,
      error: 'Site not found.',
    });
  }

  const blockers = [];
  if (row.site_status !== 'active') blockers.push('site_not_active');
  if (['high_risk_hold'].includes(row.portfolio_status)) blockers.push('portfolio_hold');
  if (['high', 'critical'].includes(row.risk_level)) blockers.push('risk_hold');
  if (!row.wp_base_url || row.wp_connection_status === 'failed') blockers.push('wp_not_verified');
  if (row.proxy_status && row.proxy_status !== 'active') blockers.push('proxy_not_active');
  if (row.runtime_status && row.runtime_status !== 'active') blockers.push('runtime_profile_not_active');
  if (row.quality_gate === 'manual_only' || row.quality_gate === 'disabled') blockers.push('manual_quality_gate');

  return sendJson(req, res, 200, {
    ok: true,
    canPublish: blockers.length === 0,
    blockers,
    site: {
      siteKey: row.site_key,
      domain: row.domain,
      portfolioStatus: row.portfolio_status,
      riskLevel: row.risk_level,
      guardrailLevel: row.guardrail_level,
      wpBaseUrl: row.wp_base_url,
      wpCredentialRef: row.wp_credential_ref,
    },
    proxy: {
      profileKey: row.proxy_profile_key,
      provider: row.proxy_provider,
      type: row.proxy_type,
      region: row.proxy_region,
      egressPolicy: row.egress_policy,
      credentialRef: row.proxy_credential_ref,
      status: row.proxy_status || 'not_assigned',
    },
    runtimeProfile: {
      requestProfileKey: row.request_profile_key,
      userAgentLabel: row.user_agent_label,
      publishWindowStart: row.publish_window_start,
      publishWindowEnd: row.publish_window_end,
      maxPostsPerDay: row.max_posts_per_day,
      styleProfile: row.style_profile,
      qualityGate: row.quality_gate || 'review_first',
      status: row.runtime_status || 'not_configured',
    },
    trustPlan: {
      stage: row.plan_stage,
      trustScore: row.trust_score,
      status: row.trust_status,
    },
  });
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

async function queryOptionalParams(sql, params = []) {
  try {
    return await query(sql, params);
  } catch (error) {
    if (error.code === '42P01' || error.code === '42703') {
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
        with customer_base as (
          select
            c.customer_code as code,
            c.display_name as name,
            c.contact_email,
            c.contract_status,
            count(distinct s.id)::int as sites,
            coalesce(
              max(ads.application_status) filter (where ads.application_status = 'approved'),
              max(ads.application_status) filter (where ads.application_status = 'submitted'),
              max(ads.application_status) filter (where ads.application_status = 'paused'),
              max(ads.application_status) filter (where ads.application_status = 'rejected'),
              max(ads.application_status) filter (where ads.application_status = 'not_started'),
              'UNKNOWN'
            ) as adsense_status,
            coalesce(
              max(rs.status) filter (where rs.status = 'paid'),
              max(rs.status) filter (where rs.status = 'invoiced'),
              max(rs.status) filter (where rs.status = 'confirmed'),
              max(rs.status) filter (where rs.status = 'draft'),
              'NONE'
            ) as settlement_status,
            c.created_at
          from customers c
          left join sites s on s.customer_id = c.id
          left join adsense_status ads on ads.site_id = s.id
          left join revenue_settlements rs on rs.customer_id = c.id
          group by c.id
        ),
        portal_requesters as (
          select
            requester_customer_code as code,
            coalesce(max(nullif(requester_name, '')), requester_customer_code) as name,
            max(nullif(requester_email, '')) as contact_email,
            'lead' as contract_status,
            0::int as sites,
            'UNKNOWN' as adsense_status,
            'NONE' as settlement_status,
            max(updated_at) as created_at
          from (
            select requester_customer_code, requester_name, requester_email, updated_at
            from portal_question_threads
            union all
            select requester_customer_code, requester_name, requester_email, updated_at
            from portal_contract_requests
          ) request_rows
          where nullif(requester_customer_code, '') is not null
          group by requester_customer_code
        )
        select code, name, contact_email, contract_status, sites, adsense_status, settlement_status
        from customer_base
        union all
        select pr.code, pr.name, pr.contact_email, pr.contract_status, pr.sites,
          pr.adsense_status, pr.settlement_status
        from portal_requesters pr
        left join customer_base cb on cb.code = pr.code
        where cb.code is null
        order by code desc
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

  const domainCandidates = await queryOptional(`
    select id::text, domain, source_type, category, keywords, language_priority,
      tld, price_policy, registrar_channel, candidate_style, availability_status,
      audit_status, purchase_status, notes,
      to_char(updated_at, 'YYYY-MM-DD HH24:MI') as updated_at
    from domain_candidates
    order by
      case audit_status
        when 'queued' then 1
        when 'checking' then 2
        when 'needs_review' then 3
        when 'approved' then 4
        when 'rejected' then 5
        else 6
      end,
      updated_at desc
    limit 100
  `);

  const proxyAssignments = await queryOptional(`
    select spa.id::text, s.site_key, s.domain, coalesce(c.customer_code, 'BOSS') as customer_code,
      spa.proxy_profile_key, spa.proxy_provider, spa.proxy_type, spa.proxy_region,
      spa.egress_policy, spa.credential_ref, spa.status,
      to_char(spa.last_verified_at, 'YYYY-MM-DD HH24:MI') as last_verified_at,
      spa.notes
    from site_proxy_assignments spa
    join sites s on s.id = spa.site_id
    left join customers c on c.id = s.customer_id
    order by
      case spa.status
        when 'failed' then 1
        when 'verify_required' then 2
        when 'planned' then 3
        when 'active' then 4
        when 'disabled' then 5
        else 6
      end,
      s.domain
    limit 100
  `);

  const runtimeProfiles = await queryOptional(`
    select s.site_key, s.domain, srp.request_profile_key, srp.user_agent_label,
      srp.publish_window_start, srp.publish_window_end, srp.max_posts_per_day,
      srp.style_profile, srp.quality_gate, srp.status, srp.notes,
      to_char(srp.updated_at, 'YYYY-MM-DD HH24:MI') as updated_at
    from site_runtime_profiles srp
    join sites s on s.id = srp.site_id
    order by
      case srp.status
        when 'verify_required' then 1
        when 'planned' then 2
        when 'active' then 3
        when 'disabled' then 4
        else 5
      end,
      s.domain
    limit 100
  `);

  const healthAlerts = await queryOptional(`
    select sha.id::text, s.site_key, s.domain, sha.alert_type, sha.severity,
      sha.status, sha.metric_name, sha.current_value, sha.baseline_value,
      sha.threshold_value, sha.title, sha.message, sha.source,
      to_char(sha.detected_at, 'YYYY-MM-DD HH24:MI') as detected_at
    from site_health_alerts sha
    left join sites s on s.id = sha.site_id
    order by
      case sha.severity
        when 'critical' then 1
        when 'warning' then 2
        else 3
      end,
      case sha.status
        when 'open' then 1
        when 'acknowledged' then 2
        else 3
      end,
      sha.detected_at desc
    limit 100
  `);

  const trustPlans = await queryOptional(`
    select stp.id::text, s.site_key, s.domain, stp.plan_stage, stp.trust_score,
      stp.content_target, stp.indexed_target, stp.authority_outbound_target,
      stp.outbound_policy, stp.next_action, stp.status,
      to_char(stp.last_reviewed_at, 'YYYY-MM-DD HH24:MI') as last_reviewed_at,
      stp.notes
    from site_trust_plans stp
    join sites s on s.id = stp.site_id
    order by
      case stp.status
        when 'active' then 1
        when 'paused' then 2
        when 'completed' then 3
        else 4
      end,
      stp.trust_score desc,
      s.domain
    limit 100
  `);

  const renewalDecisions = await queryOptional(`
    select drd.id::text, s.site_key, drd.domain, drd.renewal_decision,
      drd.decision_reason, drd.evidence_required, drd.customer_exposure_allowed,
      drd.automation_allowed, drd.next_action, drd.decided_by,
      to_char(drd.decided_at, 'YYYY-MM-DD HH24:MI') as decided_at
    from domain_renewal_decisions drd
    left join sites s on s.id = drd.site_id
    order by
      case drd.renewal_decision
        when 'do_not_renew' then 1
        when 'hold' then 2
        when 'manual_review' then 3
        when 'renew' then 4
        else 5
      end,
      drd.domain
    limit 100
  `);

  const portalRealtimeStats = await queryOptional(`
    select
      count(distinct coalesce(session_id, id::text)) filter (where occurred_at >= now() - interval '5 minutes')::int as active_5m,
      count(*) filter (where event_type = 'signup_started' and occurred_at >= date_trunc('day', now()))::int as signup_started_today,
      count(*) filter (where event_type = 'signup_completed' and occurred_at >= date_trunc('day', now()))::int as signup_completed_today,
      count(*) filter (where event_type = 'contract_started' and occurred_at >= date_trunc('day', now()))::int as contract_started_today,
      count(*) filter (where event_type = 'contract_completed' and occurred_at >= date_trunc('day', now()))::int as contract_completed_today,
      count(*) filter (where event_type = 'question_submitted' and occurred_at >= date_trunc('day', now()))::int as questions_today,
      count(*) filter (where event_type = 'ai_handoff' and occurred_at >= date_trunc('day', now()))::int as handoffs_today
    from portal_activity_events
  `);

  const portalQuestions = await queryOptional(`
    select pqt.id::text, coalesce(c.customer_code, pqt.requester_customer_code, 'NO_CUSTOMER') as customer_code,
      pqt.category, pqt.status, pqt.ai_allowed, pqt.human_review_required,
      pqt.question, pqt.answer_summary, pqt.response_channel, pqt.response_status,
      pqt.response_message, pqt.response_note, pqt.response_error, pqt.responded_at,
      pqt.updated_at
    from portal_question_threads pqt
    left join customers c on c.id = pqt.customer_id
      or (pqt.customer_id is null and pqt.requester_customer_code is not null and c.customer_code = pqt.requester_customer_code)
    order by
      case pqt.status
        when 'human_review' then 1
        when 'open' then 2
        when 'ai_draft' then 3
        when 'blocked' then 4
        else 5
      end,
      pqt.updated_at desc
    limit 10
  `);

  const portalContractRequests = await queryOptional(`
    select pcr.id::text, coalesce(c.customer_code, pcr.requester_customer_code, 'NO_CUSTOMER') as customer_code,
      pcr.requester_customer_code, pcr.requester_name, pcr.requester_email, pcr.requester_phone,
      pcr.desired_domain_count, pcr.contract_amount, pcr.payment_terms, pcr.status,
      pcr.request_message, pcr.public_message, pcr.internal_note, pcr.contract_document_url,
      pcr.requested_at, pcr.updated_at, pcr.sent_at, pcr.signed_at, pcr.setup_ready_at, pcr.closed_at
    from portal_contract_requests pcr
    left join customers c on c.id = pcr.customer_id
      or (pcr.customer_id is null and pcr.requester_customer_code is not null and c.customer_code = pcr.requester_customer_code)
    order by
      case pcr.status
        when 'requested' then 1
        when 'document_sent' then 2
        when 'signed' then 3
        when 'setup_ready' then 4
        else 5
      end,
      pcr.updated_at desc
    limit 10
  `);

  const realtimeRow = portalRealtimeStats.rows[0] || {};
  const questionRows = portalQuestions.rows || [];
  const contractRequestRows = portalContractRequests.rows || [];

  return {
    source: 'postgres',
    sites: sites.rows.map(mapSite),
    customers: customers.rows.map((row) => ({
      code: row.code,
      name: row.name,
      contactEmail: row.contact_email,
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
    domainCandidates: domainCandidates.rows.map(mapDomainCandidate),
    proxyAssignments: proxyAssignments.rows.map((row) => ({
      id: row.id,
      siteKey: row.site_key,
      domain: row.domain,
      customerCode: row.customer_code,
      profileKey: row.proxy_profile_key,
      provider: row.proxy_provider,
      proxyType: row.proxy_type,
      region: row.proxy_region,
      egressPolicy: row.egress_policy,
      credentialRef: row.credential_ref,
      status: row.status,
      lastVerifiedAt: row.last_verified_at,
      notes: row.notes,
    })),
    runtimeProfiles: runtimeProfiles.rows.map((row) => ({
      siteKey: row.site_key,
      domain: row.domain,
      requestProfileKey: row.request_profile_key,
      userAgentLabel: row.user_agent_label,
      publishWindowStart: row.publish_window_start,
      publishWindowEnd: row.publish_window_end,
      maxPostsPerDay: row.max_posts_per_day,
      styleProfile: row.style_profile,
      qualityGate: row.quality_gate,
      status: row.status,
      notes: row.notes,
      updatedAt: row.updated_at,
    })),
    healthAlerts: healthAlerts.rows.map((row) => ({
      id: row.id,
      siteKey: row.site_key,
      domain: row.domain,
      alertType: row.alert_type,
      severity: row.severity,
      status: row.status,
      metricName: row.metric_name,
      currentValue: row.current_value,
      baselineValue: row.baseline_value,
      thresholdValue: row.threshold_value,
      title: row.title,
      message: row.message,
      source: row.source,
      detectedAt: row.detected_at,
    })),
    trustPlans: trustPlans.rows.map((row) => ({
      id: row.id,
      siteKey: row.site_key,
      domain: row.domain,
      planStage: row.plan_stage,
      trustScore: row.trust_score,
      contentTarget: row.content_target,
      indexedTarget: row.indexed_target,
      authorityOutboundTarget: row.authority_outbound_target,
      outboundPolicy: row.outbound_policy,
      nextAction: row.next_action,
      status: row.status,
      lastReviewedAt: row.last_reviewed_at,
      notes: row.notes,
    })),
    renewalDecisions: renewalDecisions.rows.map((row) => ({
      id: row.id,
      siteKey: row.site_key,
      domain: row.domain,
      renewalDecision: row.renewal_decision,
      decisionReason: row.decision_reason,
      evidenceRequired: row.evidence_required,
      customerExposureAllowed: row.customer_exposure_allowed,
      automationAllowed: row.automation_allowed,
      nextAction: row.next_action,
      decidedBy: row.decided_by,
      decidedAt: row.decided_at,
    })),
    portalRealtime: {
      activeVisitors5m: Number(realtimeRow.active_5m || 0),
      signupStartedToday: Number(realtimeRow.signup_started_today || 0),
      signupCompletedToday: Number(realtimeRow.signup_completed_today || 0),
      contractStartedToday: Number(realtimeRow.contract_started_today || 0),
      contractCompletedToday: Number(realtimeRow.contract_completed_today || 0),
      questionsToday: Number(realtimeRow.questions_today || 0),
      handoffsToday: Number(realtimeRow.handoffs_today || 0),
      openQuestions: questionRows.filter((row) => ['open', 'ai_draft', 'human_review'].includes(row.status)).length,
      humanReviewQuestions: questionRows.filter((row) => row.human_review_required || row.status === 'human_review').length,
      blockedQuestions: questionRows.filter((row) => !row.ai_allowed || row.status === 'blocked').length,
      contractRequests: contractRequestRows.map((row) => mapContractRequest(row)),
      questions: questionRows.map((row) => ({
        id: row.id,
        customerCode: row.customer_code,
        category: row.category,
        status: row.status,
        aiAllowed: row.ai_allowed,
        humanReviewRequired: row.human_review_required,
        question: row.question,
        answerSummary: row.answer_summary,
        responseChannel: row.response_channel,
        responseStatus: row.response_status,
        responseMessage: row.response_message,
        responseNote: row.response_note,
        responseError: row.response_error,
        respondedAt: row.responded_at,
        updatedAt: row.updated_at,
      })),
    },
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

  try {
    if (url.pathname === '/api/wordfriends/events' && req.method === 'POST') {
      return createWordfriendsEvent(req, res);
    }

    if (url.pathname === '/api/wordfriends/questions' && req.method === 'POST') {
      return createWordfriendsQuestion(req, res);
    }

    if (url.pathname === '/api/wordfriends/questions' && req.method === 'GET') {
      return listWordfriendsQuestions(req, res, url);
    }

    if (url.pathname === '/api/wordfriends/contracts' && req.method === 'POST') {
      return createWordfriendsContractRequest(req, res);
    }

    if (url.pathname === '/api/wordfriends/contracts' && req.method === 'GET') {
      return listWordfriendsContractRequests(req, res, url);
    }

    if (url.pathname === '/api/wordfriends/timeline' && req.method === 'GET') {
      return listWordfriendsTimeline(req, res, url);
    }

    if (url.pathname === '/api/wordfriends/sites' && req.method === 'GET') {
      return listWordfriendsSites(req, res, url);
    }

    if (url.pathname === '/api/wordfriends/settlement-referrals' && req.method === 'GET') {
      return listWordfriendsSettlementReferrals(req, res, url);
    }

    if (!requireAdminAuth(req, res)) return;

    if (url.pathname === '/api/health') {
      const db = await checkDatabase();
      return sendJson(req, res, 200, { ok: true, database: 'connected', checkedAt: db.now });
    }

    if (url.pathname === '/api/dashboard') {
      return sendJson(req, res, 200, await getDashboardData());
    }

    const questionReplyMatch = url.pathname.match(/^\/api\/wordfriends\/questions\/([^/]+)\/reply$/);
    if (questionReplyMatch && req.method === 'POST') {
      return updateWordfriendsQuestionReply(req, res, questionReplyMatch[1]);
    }

    const contractRequestMatch = url.pathname.match(/^\/api\/wordfriends\/contracts\/([^/]+)$/);
    if (contractRequestMatch && req.method === 'POST') {
      return updateWordfriendsContractRequest(req, res, contractRequestMatch[1]);
    }

    if (url.pathname === '/api/n8n/site-runtime') {
      return getN8nSiteRuntime(req, res, url);
    }

    if (url.pathname === '/api/notifications' && req.method === 'POST') {
      return createNotification(req, res);
    }

    if (url.pathname === '/api/domain-candidates' && req.method === 'POST') {
      return createDomainCandidates(req, res);
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

    if (url.pathname === '/api/google/search-console/start') {
      const authUrl = buildGoogleSearchConsoleAuthUrl(req);
      if (!authUrl) {
        return sendJson(req, res, 400, {
          ok: false,
          error: 'GOOGLE_CLIENT_ID is not configured.',
        });
      }

      res.writeHead(302, { Location: authUrl });
      return res.end();
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
