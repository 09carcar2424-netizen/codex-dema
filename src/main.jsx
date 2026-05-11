import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity,
  AlertTriangle,
  Bell,
  CheckCircle2,
  ClipboardCheck,
  Database,
  FileText,
  Globe2,
  KeyRound,
  Moon,
  Play,
  RefreshCw,
  ServerCog,
  ShieldCheck,
  Sun,
  Users,
  UserPlus,
  WalletCards,
} from 'lucide-react';
import { fetchDashboardData } from './api.js';
import {
  contentQueueRows,
  customerRows,
  notificationRows,
  portalSummary,
  referralRows,
  runLogRows,
  settlementRows,
  siteRows,
  taxEstimateRows,
  workflowRows,
  wpSetupRows,
} from './sampleData.js';
import './styles.css';

const fallbackDashboard = {
  source: 'sample',
  sites: siteRows,
  customers: customerRows,
  contentQueue: contentQueueRows,
  wpSetup: wpSetupRows,
  workflows: workflowRows,
  runLogs: runLogRows,
  settlements: settlementRows,
  referrals: referralRows,
  taxEstimates: taxEstimateRows,
  notifications: notificationRows,
};

const siteStatusFilters = [
  { key: 'all', label: '전체' },
  { key: 'operating_ready', label: '운영 가능' },
  { key: 'setup_pipeline', label: '세팅 진행' },
  { key: 'recovery_review', label: '복구 검토' },
  { key: 'high_risk_hold', label: '고위험 보류' },
  { key: 'infra_internal', label: '내부용' },
  { key: 'customer_portal', label: '고객포털' },
  { key: 'unclassified', label: '미분류' },
];

const setupStatusFilters = [
  { key: 'all', label: '전체' },
  { key: 'PROCESSING', label: '진행중' },
  { key: 'PENDING', label: '대기' },
  { key: 'DONE', label: '완료' },
  { key: 'SKIP', label: '보류' },
  { key: 'FAILED', label: '실패' },
];

function StatusPill({ value }) {
  const normalized = String(value || 'not_set').toLowerCase();
  return <span className={`status-pill ${normalized}`}>{value || 'NOT_SET'}</span>;
}

function getSiteNextAction(site) {
  if (site.portfolioStatus === 'customer_portal') return '고객 포털 기능 설계';
  if (site.portfolioStatus === 'infra_internal') return '인프라 전용 유지';
  if (site.portfolioStatus === 'high_risk_hold' || site.riskLevel === 'critical') return '운영 보류 및 원인 기록';
  if (site.portfolioStatus === 'recovery_review') return '색인/스팸/백링크 재검토';
  if (site.setupStatus === 'pending' || site.setupStatus === 'processing') return 'WordPress 세팅 큐 확인';
  if (site.portfolioStatus === 'operating_ready') return '운영 유지 및 발행 품질 확인';
  return '분류 기준 수동 검토';
}

function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem('wp-auto-theme') || 'light');
  const [siteFilter, setSiteFilter] = useState('all');
  const [setupFilter, setSetupFilter] = useState('all');
  const [dashboard, setDashboard] = useState(fallbackDashboard);
  const [apiState, setApiState] = useState({ status: 'sample', message: '샘플 데이터 사용 중' });
  const isDark = theme === 'dark';

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('wp-auto-theme', theme);
  }, [theme]);

  useEffect(() => {
    let active = true;

    fetchDashboardData()
      .then((data) => {
        if (!active) return;
        setDashboard({
          source: data.source || 'postgres',
          sites: data.sites?.length ? data.sites : siteRows,
          customers: data.customers?.length ? data.customers : customerRows,
          contentQueue: data.contentQueue?.length ? data.contentQueue : contentQueueRows,
          wpSetup: data.wpSetup?.length ? data.wpSetup : wpSetupRows,
          workflows: data.workflows?.length ? data.workflows : workflowRows,
          runLogs: data.runLogs?.length ? data.runLogs : runLogRows,
          settlements: data.settlements?.length ? data.settlements : settlementRows,
          referrals: data.referrals?.length ? data.referrals : referralRows,
          taxEstimates: data.taxEstimates?.length ? data.taxEstimates : taxEstimateRows,
          notifications: data.notifications?.length ? data.notifications : notificationRows,
        });
        setApiState({ status: 'connected', message: 'PostgreSQL 연결됨' });
      })
      .catch((error) => {
        if (!active) return;
        setApiState({ status: 'sample', message: `샘플 데이터 사용 중 · ${error.message}` });
      });

    return () => {
      active = false;
    };
  }, []);

  const metrics = [
    { label: '운영 사이트', value: dashboard.sites.length, icon: Globe2 },
    { label: '검수 필요', value: dashboard.sites.filter((site) => site.reviewRequired).length, icon: ClipboardCheck },
    { label: '콘텐츠 큐', value: dashboard.contentQueue.length, icon: FileText },
    { label: 'N8N 워크플로우', value: dashboard.workflows.length, icon: Activity },
    { label: '포털 고객', value: dashboard.customers.length, icon: Users },
    { label: '알림 준비', value: dashboard.notifications.length, icon: Bell },
  ];

  const customerNotifications = dashboard.notifications.filter((row) => row.audience === 'customer');
  const internalNotifications = dashboard.notifications.filter((row) => row.visibility === 'internal_only');
  const siteCounts = siteStatusFilters.map((filter) => ({
    ...filter,
    count:
      filter.key === 'all'
        ? dashboard.sites.length
        : dashboard.sites.filter((site) => site.portfolioStatus === filter.key).length,
  }));
  const filteredSites =
    siteFilter === 'all'
      ? dashboard.sites
      : dashboard.sites.filter((site) => site.portfolioStatus === siteFilter);
  const setupCounts = setupStatusFilters.map((filter) => ({
    ...filter,
    count:
      filter.key === 'all'
        ? dashboard.wpSetup.length
        : dashboard.wpSetup.filter((row) => row.status === filter.key).length,
  }));
  const setupDomains = new Set(dashboard.wpSetup.map((row) => row.domain));
  const activeSitesWithoutSetup = dashboard.sites.filter(
    (site) =>
      !setupDomains.has(site.domain) &&
      ['operating_ready', 'setup_pipeline', 'unclassified'].includes(site.portfolioStatus),
  );
  const filteredSetupRows =
    setupFilter === 'all'
      ? dashboard.wpSetup
      : dashboard.wpSetup.filter((row) => row.status === setupFilter);

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">B</div>
          <div>
            <strong>BOSS SiteOps</strong>
            <span>Customer-owned site operations</span>
          </div>
        </div>

        <button
          className="theme-toggle"
          type="button"
          onClick={() => setTheme(isDark ? 'light' : 'dark')}
          aria-label={isDark ? '밝은 배경으로 변경' : '검정 배경으로 변경'}
        >
          {isDark ? <Sun size={18} /> : <Moon size={18} />}
          {isDark ? '밝은 배경' : '검정 배경'}
        </button>

        <nav className="nav-list" aria-label="Primary">
          <a className="active" href="#overview"><Globe2 size={18} />운영 현황</a>
          <a href="#sites"><Users size={18} />사이트 관리</a>
          <a href="#queue"><FileText size={18} />콘텐츠 큐</a>
          <a href="#setup"><ServerCog size={18} />WP 세팅</a>
          <a href="#portal"><UserPlus size={18} />고객 포털</a>
          <a href="#settlements"><WalletCards size={18} />정산/추천</a>
          <a href="#tax"><ClipboardCheck size={18} />세액 안내</a>
          <a href="#notifications"><Bell size={18} />알림센터</a>
          <a href="#n8n"><Play size={18} />N8N 실행</a>
          <a href="#logs"><Database size={18} />작업 로그</a>
          <a href="#security"><ShieldCheck size={18} />보안 기준</a>
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar" id="overview">
          <div>
            <p className="eyebrow">BOSS SiteOps Platform v1</p>
            <h1>고객 소유 사이트 운영대행 콘솔</h1>
          </div>
          <button className="primary-action" type="button">
            <RefreshCw size={18} />
            구글시트 동기화
          </button>
        </header>

        <div className={`connection-banner ${apiState.status}`}>
          <Database size={18} />
          <span>{apiState.message}</span>
        </div>

        <section className="metric-grid" aria-label="Summary">
          {metrics.map((metric) => {
            const Icon = metric.icon;
            return (
              <article className="metric-card" key={metric.label}>
                <Icon size={20} />
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
              </article>
            );
          })}
        </section>

        <section className="content-grid">
          <article className="panel wide-panel" id="sites">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">site_master</p>
                <h2>도메인 운영관리</h2>
              </div>
              <span className="status-pill active">내부 운영 전용</span>
            </div>
            <div className="site-filter-grid" aria-label="도메인 운영상태 필터">
              {siteCounts.map((filter) => (
                <button
                  className={`filter-card ${siteFilter === filter.key ? 'active' : ''}`}
                  key={filter.key}
                  type="button"
                  onClick={() => setSiteFilter(filter.key)}
                >
                  <span>{filter.label}</span>
                  <strong>{filter.count}</strong>
                </button>
              ))}
            </div>
            <div className="ops-table sites-table enhanced-sites-table" role="table">
              <div className="ops-row ops-head" role="row">
                <span>도메인</span>
                <span>운영상태</span>
                <span>승인/위험도</span>
                <span>세팅/수익화</span>
                <span>다음 액션</span>
                <span>메모</span>
              </div>
              {filteredSites.map((site) => (
                <div className={`ops-row risk-${site.riskLevel || 'unknown'}`} role="row" key={site.siteKey}>
                  <div>
                    <strong>{site.domain}</strong>
                    <small>{site.siteKey} · {site.language || '-'} · {site.topic || '-'}</small>
                  </div>
                  <div className="pill-stack">
                    <StatusPill value={site.portfolioStatus || site.status} />
                    <small>{site.owner}</small>
                  </div>
                  <div className="pill-stack">
                    <StatusPill value={site.approvalStatus} />
                    <StatusPill value={site.riskLevel} />
                  </div>
                  <div className="pill-stack">
                    <StatusPill value={site.setupStatus} />
                    <small>{site.monetizeMode || 'monetize 미정'}</small>
                  </div>
                  <strong>{getSiteNextAction(site)}</strong>
                  <small>{site.memo || '운영 메모 없음'}</small>
                </div>
              ))}
            </div>
          </article>

          <article className="panel wide-panel legacy-sites-panel" id="sites-legacy">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">site_master</p>
                <h2>사이트 관리</h2>
              </div>
              <span className="status-pill active">민감정보 숨김</span>
            </div>
            <div className="ops-table sites-table" role="table">
              <div className="ops-row ops-head" role="row">
                <span>사이트</span>
                <span>소유</span>
                <span>가드레일</span>
                <span>워크플로우</span>
                <span>Credential</span>
                <span>상태</span>
              </div>
              {dashboard.sites.map((site) => (
                <div className="ops-row" role="row" key={site.siteKey}>
                  <div>
                    <strong>{site.domain}</strong>
                    <small>{site.siteKey} · {site.topic} · {site.gLevel}</small>
                  </div>
                  <span>{site.owner}</span>
                  <span>{site.guardrail}</span>
                  <span>{site.workflow}</span>
                  <code>{site.credentialRef}</code>
                  <StatusPill value={site.status} />
                </div>
              ))}
            </div>
          </article>

          <article className="panel wide-panel portal-panel" id="portal">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">wordfriends.co.kr</p>
                <h2>고객 포털 계획</h2>
              </div>
              <StatusPill value={portalSummary.status} />
            </div>
            <div className="portal-grid">
              <div>
                <strong>{portalSummary.domain}</strong>
                <span>{portalSummary.role}</span>
                <p>{portalSummary.publicPurpose}</p>
              </div>
              <div className="policy-box">
                <ShieldCheck size={20} />
                <span>{portalSummary.safetyDefault}</span>
              </div>
            </div>
            <div className="ops-table customer-table" role="table">
              <div className="ops-row ops-head" role="row">
                <span>고객</span>
                <span>계약</span>
                <span>사이트</span>
                <span>애드센스</span>
                <span>정산</span>
              </div>
              {dashboard.customers.map((customer) => (
                <div className="ops-row" role="row" key={customer.code}>
                  <div>
                    <strong>{customer.name}</strong>
                    <small>{customer.code}</small>
                  </div>
                  <StatusPill value={customer.contractStatus} />
                  <span>{customer.sites}개</span>
                  <StatusPill value={customer.adsenseStatus} />
                  <StatusPill value={customer.settlementStatus} />
                </div>
              ))}
            </div>
          </article>

          <article className="panel" id="security">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Security Model</p>
                <h2>운영 보안 기준</h2>
              </div>
              <KeyRound size={20} />
            </div>
            <ul className="check-list">
              <li><CheckCircle2 size={18} />DB에는 앱 비밀번호를 저장하지 않음</li>
              <li><CheckCircle2 size={18} />N8N Credentials 또는 서버 환경변수 사용</li>
              <li><CheckCircle2 size={18} />고객 애드센스와 도메인 소유권 분리 기록</li>
              <li><AlertTriangle size={18} />YMYL 콘텐츠는 항상 검수 후 발행</li>
            </ul>
          </article>

          <article className="panel wide-panel" id="queue">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">content_queue</p>
                <h2>콘텐츠 큐</h2>
              </div>
              <button className="secondary-action" type="button">
                <Play size={16} />
                선택 항목 실행
              </button>
            </div>
            <div className="ops-table queue-table" role="table">
              <div className="ops-row ops-head" role="row">
                <span>제목</span>
                <span>사이트</span>
                <span>카테고리</span>
                <span>검증</span>
                <span>발행</span>
                <span>상태</span>
              </div>
              {dashboard.contentQueue.map((item) => (
                <div className="ops-row" role="row" key={`${item.siteKey}-${item.id}`}>
                  <div>
                    <strong>{item.title}</strong>
                    <small>{item.keyword}</small>
                  </div>
                  <span>{item.siteKey}</span>
                  <span>{item.category}</span>
                  <span>{item.contentLength || '-'}자 · H2 {item.h2Count}</span>
                  <span>{item.publishMode}</span>
                  <StatusPill value={item.status} />
                </div>
              ))}
            </div>
          </article>

          <article className="panel" id="n8n">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">N8N Webhooks</p>
                <h2>실행 엔진</h2>
              </div>
            </div>
            <div className="stack-list">
              {dashboard.workflows.map((workflow) => (
                <div className="stack-item" key={workflow.key}>
                  <div>
                    <strong>{workflow.name}</strong>
                    <small>{workflow.key} · {workflow.target}</small>
                  </div>
                  <StatusPill value={workflow.status} />
                </div>
              ))}
            </div>
          </article>

          <article className="panel wide-panel" id="setup">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">wp_setup_queue</p>
                <h2>워드프레스 세팅 큐</h2>
              </div>
              <span className="status-pill planned">비밀번호 숨김</span>
            </div>
            <div className="site-filter-grid setup-filter-grid" aria-label="WP 세팅상태 필터">
              {setupCounts.map((filter) => (
                <button
                  className={`filter-card ${setupFilter === filter.key ? 'active' : ''}`}
                  key={filter.key}
                  type="button"
                  onClick={() => setSetupFilter(filter.key)}
                >
                  <span>{filter.label}</span>
                  <strong>{filter.count}</strong>
                </button>
              ))}
            </div>
            <div className="setup-summary">
              <div>
                <strong>{activeSitesWithoutSetup.length}</strong>
                <span>세팅 큐가 없는 운영/검토 도메인</span>
              </div>
              <p>
                PROCESSING/PENDING을 우선 처리하고, 큐가 없는 도메인은 실제 WP 상태를 확인한 뒤
                필요할 때만 wp_setup_queue에 추가합니다.
              </p>
            </div>
            <div className="setup-grid">
              {filteredSetupRows.map((row) => (
                <article className={`setup-card setup-${String(row.status).toLowerCase()}`} key={row.domain}>
                  <div>
                    <strong>{row.domain}</strong>
                    <small>{row.siteName} · {row.language} · {row.theme}</small>
                  </div>
                  <p>{row.concept}</p>
                  <div className="setup-meta">
                    <span>수익화: {row.monetize || '-'}</span>
                    <span>승인: {row.approval || '-'}</span>
                    <span>DR: {row.drScore ?? '-'}</span>
                  </div>
                  <p>{row.memo || '세팅 메모 없음'}</p>
                  {row.errorLog ? <p className="error-text">{row.errorLog}</p> : null}
                  <div className="card-footer">
                    <span>{row.setupDate || '일정 미정'}</span>
                    <StatusPill value={row.status} />
                  </div>
                </article>
              ))}
            </div>
            <div className="queue-gap-list">
              <strong>세팅 큐 미등록 주요 도메인</strong>
              <div>
                {activeSitesWithoutSetup.slice(0, 10).map((site) => (
                  <span key={site.domain}>{site.domain}</span>
                ))}
              </div>
            </div>
          </article>

          <article className="panel wide-panel" id="settlements">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">settlements / referrals</p>
                <h2>정산 및 추천 보상</h2>
              </div>
              <span className="status-pill active">1단계만 활성</span>
            </div>
            <div className="split-grid">
              <div className="stack-list">
                {dashboard.settlements.map((row) => (
                  <div className="stack-item" key={`${row.customer}-${row.month}`}>
                    <div>
                      <strong>{row.customer}</strong>
                      <small>{row.month} · {row.grossRevenue}</small>
                      <small>{row.agencyFee}</small>
                    </div>
                    <StatusPill value={row.status} />
                  </div>
                ))}
              </div>
              <div className="stack-list">
                {dashboard.referrals.map((row) => (
                  <div className="stack-item" key={`${row.referrer}-${row.referred}-${row.depth}`}>
                    <div>
                      <strong>{row.referrer} → {row.referred}</strong>
                      <small>{row.rule} · depth {row.depth}</small>
                      <small>{row.active ? '지급 가능 규칙' : '법무/세무 검토 전 비활성'}</small>
                    </div>
                    <StatusPill value={row.status} />
                  </div>
                ))}
              </div>
            </div>
          </article>

          <article className="panel wide-panel" id="tax">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">tax estimate</p>
                <h2>세액 및 원천징수 예상 안내</h2>
              </div>
              <span className="status-pill planned">참고용</span>
            </div>
            <div className="tax-notice">
              <AlertTriangle size={20} />
              <p>
                이 화면의 세액은 예상 참고용입니다. 실제 세무 처리는 고객의 사업자 여부, 소득 종류,
                지급 방식, 세무사 검토 결과에 따라 달라질 수 있습니다.
              </p>
            </div>
            <div className="ops-table tax-table" role="table">
              <div className="ops-row ops-head" role="row">
                <span>항목</span>
                <span>총액</span>
                <span>분류</span>
                <span>예상 원천징수</span>
                <span>예상 실지급</span>
                <span>상태</span>
              </div>
              {dashboard.taxEstimates.map((row) => (
                <div className="ops-row" role="row" key={row.label}>
                  <strong>{row.label}</strong>
                  <span>{row.grossAmount}</span>
                  <span>{row.category}</span>
                  <span>{row.withholding}</span>
                  <span>{row.netPayable}</span>
                  <StatusPill value={row.status} />
                </div>
              ))}
            </div>
          </article>

          <article className="panel wide-panel" id="notifications">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">notifications</p>
                <h2>공지사항 및 알림센터</h2>
              </div>
              <span className="status-pill planned">발송 준비</span>
            </div>
            <div className="notification-note">
              <Bell size={20} />
              <p>
                고객에게는 정산, 입금, 계정 확인처럼 꼭 필요한 내용만 전달합니다. 자동화 실패,
                서버 오류, WordPress 연결 문제는 고객에게 노출하지 않고 BOSS 내부 알림으로만 관리합니다.
              </p>
            </div>
            <div className="split-grid notification-grid">
              <div>
                <h3>고객 알림</h3>
                <div className="stack-list">
                  {customerNotifications.map((row) => (
                    <div className="stack-item notification-item" key={row.id}>
                      <div>
                        <strong>{row.title}</strong>
                        <small>{row.message}</small>
                        <small>{row.channel} · {row.category} · 광고성 {row.marketing ? '동의 필요' : '아님'}</small>
                      </div>
                      <StatusPill value={row.status} />
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3>내부 운영 알림</h3>
                <div className="stack-list">
                  {internalNotifications.map((row) => (
                    <div className="stack-item notification-item" key={row.id}>
                      <div>
                        <strong>{row.title}</strong>
                        <small>{row.message}</small>
                        <small>{row.channel} · {row.category} · {row.severity}</small>
                      </div>
                      <StatusPill value={row.severity} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </article>

          <article className="panel" id="logs">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">run_logs</p>
                <h2>최근 작업 로그</h2>
              </div>
            </div>
            <div className="stack-list">
              {dashboard.runLogs.map((log) => (
                <div className="stack-item" key={`${log.siteKey}-${log.time}`}>
                  <div>
                    <strong>{log.siteKey}</strong>
                    <small>{log.workflow} · {log.time}</small>
                    <small>{log.result}</small>
                  </div>
                  <StatusPill value={log.status} />
                </div>
              ))}
            </div>
          </article>
        </section>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
