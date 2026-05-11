import React, { useCallback, useEffect, useState } from 'react';
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
  Search,
  ServerCog,
  ShieldCheck,
  Sun,
  Users,
  UserPlus,
  WalletCards,
} from 'lucide-react';
import { createNotificationDraft, fetchDashboardData, getApiBaseUrl, saveApiBaseUrl } from './api.js';
import {
  contentQueueRows,
  customerRows,
  domainInventoryRows,
  notificationRows,
  portalSummary,
  referralRows,
  runLogRows,
  settlementRows,
  sitemapRows,
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
  domainInventory: domainInventoryRows,
  sitemapSubmissions: sitemapRows,
};

const emptyNotificationForm = {
  audienceType: 'customer',
  category: 'settlement',
  severity: 'info',
  channel: 'portal',
  title: '',
  message: '',
  marketingMessage: false,
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
  const [inventoryQuery, setInventoryQuery] = useState('');
  const [inventoryGradeFilter, setInventoryGradeFilter] = useState('all');
  const [inventoryStatusFilter, setInventoryStatusFilter] = useState('all');
  const [inventorySort, setInventorySort] = useState('score_desc');
  const [apiEndpointInput, setApiEndpointInput] = useState(() => getApiBaseUrl());
  const [apiReloadToken, setApiReloadToken] = useState(0);
  const [dashboard, setDashboard] = useState(fallbackDashboard);
  const [apiState, setApiState] = useState({ status: 'sample', message: '샘플 데이터 사용 중' });
  const [notificationForm, setNotificationForm] = useState(emptyNotificationForm);
  const [notificationSaveState, setNotificationSaveState] = useState({ status: 'idle', message: '' });
  const isDark = theme === 'dark';

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('wp-auto-theme', theme);
  }, [theme]);

  const reloadDashboard = useCallback(() => {
    setApiReloadToken((value) => value + 1);
  }, []);

  const updateNotificationForm = (field, value) => {
    setNotificationForm((current) => ({ ...current, [field]: value }));
  };

  const submitNotificationDraft = async (event) => {
    event.preventDefault();
    setNotificationSaveState({ status: 'saving', message: '알림 초안을 저장하는 중입니다.' });

    try {
      await createNotificationDraft({
        ...notificationForm,
        visibility: notificationForm.audienceType === 'customer' ? 'public_to_customer' : 'internal_only',
      });
      setNotificationForm(emptyNotificationForm);
      setNotificationSaveState({ status: 'saved', message: '알림 초안을 저장했습니다. 실제 발송은 아직 하지 않습니다.' });
      reloadDashboard();
    } catch (error) {
      setNotificationSaveState({ status: 'error', message: `저장 실패: ${error.message}` });
    }
  };

  useEffect(() => {
    let active = true;
    const apiBaseUrl = getApiBaseUrl();
    setApiState({ status: 'loading', message: `API 연결 확인 중: ${apiBaseUrl || 'same-origin /api'}` });

    fetchDashboardData(apiBaseUrl)
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
          domainInventory: data.domainInventory?.length ? data.domainInventory : domainInventoryRows,
          sitemapSubmissions: data.sitemapSubmissions?.length ? data.sitemapSubmissions : sitemapRows,
        });
        setApiState({
          status: 'connected',
          message: `PostgreSQL 연결됨 · ${apiBaseUrl || 'same-origin /api'}`,
        });
      })
      .catch((error) => {
        if (!active) return;
        setDashboard(fallbackDashboard);
        setApiState({
          status: 'sample',
          message: `샘플 데이터 표시 중 · API 연결 실패: ${apiBaseUrl || 'same-origin /api'} · ${error.message}`,
        });
      });

    return () => {
      active = false;
    };
  }, [apiReloadToken]);

  const metrics = [
    { label: '운영 사이트', value: dashboard.sites.length, icon: Globe2 },
    { label: '검수 필요', value: dashboard.sites.filter((site) => site.reviewRequired).length, icon: ClipboardCheck },
    { label: '콘텐츠 큐', value: dashboard.contentQueue.length, icon: FileText },
    { label: 'N8N 워크플로우', value: dashboard.workflows.length, icon: Activity },
    { label: '포털 고객', value: dashboard.customers.length, icon: Users },
    { label: '알림 준비', value: dashboard.notifications.length, icon: Bell },
    { label: '사이트맵', value: dashboard.sitemapSubmissions.length, icon: Search },
  ];

  const customerNotifications = dashboard.notifications.filter((row) => row.audience === 'customer');
  const internalNotifications = dashboard.notifications.filter((row) => row.visibility === 'internal_only');
  const googleSitemaps = dashboard.sitemapSubmissions.filter((row) => row.searchEngine === 'google');
  const manualSitemaps = dashboard.sitemapSubmissions.filter((row) =>
    ['manual_required', 'failed'].includes(row.status),
  );
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
  const recommendedDomains = dashboard.domainInventory.filter((row) =>
    ['recommended', 'brokerage_ready'].includes(row.inventoryStatus),
  );
  const heldDomains = dashboard.domainInventory.filter((row) =>
    ['hold', 'rejected'].includes(row.inventoryStatus),
  );
  const inventoryGradeOptions = ['all', ...new Set(dashboard.domainInventory.map((row) => row.finalGrade || 'unrated'))];
  const inventoryStatusOptions = [
    'all',
    ...new Set(dashboard.domainInventory.map((row) => row.inventoryStatus || 'internal_review')),
  ];
  const filteredInventory = dashboard.domainInventory
    .filter((row) => {
      const haystack = [
        row.domain,
        row.ownershipType,
        row.acquisitionType,
        row.languagePriority,
        row.categoryFit,
        row.inventoryStatus,
        row.offerStatus,
        row.finalGrade,
        row.memo,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      const queryMatch = haystack.includes(inventoryQuery.trim().toLowerCase());
      const gradeMatch = inventoryGradeFilter === 'all' || row.finalGrade === inventoryGradeFilter;
      const statusMatch = inventoryStatusFilter === 'all' || row.inventoryStatus === inventoryStatusFilter;
      return queryMatch && gradeMatch && statusMatch;
    })
    .sort((a, b) => {
      if (inventorySort === 'score_asc') return (a.overallScore ?? -1) - (b.overallScore ?? -1);
      if (inventorySort === 'domain_asc') return a.domain.localeCompare(b.domain);
      if (inventorySort === 'risk_first') {
        const riskOrder = { reject: 0, hold: 1, watch: 2, unrated: 3, safe_candidate: 4 };
        return (riskOrder[a.finalGrade] ?? 9) - (riskOrder[b.finalGrade] ?? 9);
      }
      return (b.overallScore ?? -1) - (a.overallScore ?? -1);
    });

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
          <a href="#inventory"><ShieldCheck size={18} />도메인 검수</a>
          <a href="#sitemaps"><Search size={18} />사이트맵</a>
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
          <button className="primary-action" type="button" onClick={reloadDashboard}>
            <RefreshCw size={18} />
            데이터 새로고침
          </button>
        </header>

        <div className={`connection-banner ${apiState.status}`}>
          <Database size={18} />
          <span>{apiState.message}</span>
        </div>

        <form
          className="api-config-panel"
          onSubmit={(event) => {
            event.preventDefault();
            const savedUrl = saveApiBaseUrl(apiEndpointInput);
            setApiEndpointInput(savedUrl);
            reloadDashboard();
          }}
        >
          <label>
            <span>API 주소</span>
            <input
              type="url"
              value={apiEndpointInput}
              onChange={(event) => setApiEndpointInput(event.target.value)}
              placeholder="http://127.0.0.1:8787"
            />
          </label>
          <button className="secondary-action" type="submit">저장 후 연결</button>
          <button
            className="secondary-action"
            type="button"
            onClick={() => {
              const defaultUrl = saveApiBaseUrl('');
              setApiEndpointInput(defaultUrl);
              reloadDashboard();
            }}
          >
            기본값
          </button>
        </form>

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

          <article className="panel wide-panel" id="inventory">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">domain_inventory / domain_audits</p>
                <h2>도메인 재고 및 검수</h2>
              </div>
              <span className="status-pill planned">내부 검수 전용</span>
            </div>
            <div className="inventory-summary">
              <div>
                <strong>{dashboard.domainInventory.length}</strong>
                <span>검수 재고</span>
              </div>
              <div>
                <strong>{recommendedDomains.length}</strong>
                <span>추천/중개 후보</span>
              </div>
              <div>
                <strong>{heldDomains.length}</strong>
                <span>보류/제외</span>
              </div>
              <p>
                도메인 검수 결과는 보장이 아니라 참고자료입니다. 수익, 애드센스 승인, IP/VPN 안전성은
                보장 표현 없이 내부 리스크 판단용으로만 관리합니다.
              </p>
            </div>
            <div className="inventory-controls" aria-label="도메인 검수 필터">
              <label className="inventory-search">
                <Search size={18} />
                <input
                  type="search"
                  value={inventoryQuery}
                  onChange={(event) => setInventoryQuery(event.target.value)}
                  placeholder="도메인, 상태, 메모 검색"
                />
              </label>
              <label>
                <span>등급</span>
                <select
                  value={inventoryGradeFilter}
                  onChange={(event) => setInventoryGradeFilter(event.target.value)}
                >
                  {inventoryGradeOptions.map((grade) => (
                    <option key={grade} value={grade}>{grade === 'all' ? '전체' : grade}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>상태</span>
                <select
                  value={inventoryStatusFilter}
                  onChange={(event) => setInventoryStatusFilter(event.target.value)}
                >
                  {inventoryStatusOptions.map((status) => (
                    <option key={status} value={status}>{status === 'all' ? '전체' : status}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>정렬</span>
                <select value={inventorySort} onChange={(event) => setInventorySort(event.target.value)}>
                  <option value="score_desc">점수 높은순</option>
                  <option value="score_asc">점수 낮은순</option>
                  <option value="risk_first">위험 우선</option>
                  <option value="domain_asc">도메인 가나다순</option>
                </select>
              </label>
              <button
                className="secondary-action"
                type="button"
                onClick={() => {
                  setInventoryQuery('');
                  setInventoryGradeFilter('all');
                  setInventoryStatusFilter('all');
                  setInventorySort('score_desc');
                }}
              >
                초기화
              </button>
            </div>
            <div className="inventory-result-line">
              <strong>{filteredInventory.length}</strong>
              <span>개 도메인 표시 중</span>
            </div>
            <div className="inventory-grid">
              {filteredInventory.map((row) => (
                <article className={`inventory-card grade-${row.finalGrade}`} key={row.domain}>
                  <div className="inventory-card-head">
                    <div>
                      <strong>{row.domain}</strong>
                      <small>{row.ownershipType} · {row.acquisitionType} · {row.languagePriority}</small>
                    </div>
                    <StatusPill value={row.finalGrade} />
                  </div>
                  <div className="score-line">
                    <strong>{row.overallScore ?? '-'}</strong>
                    <span>검수 점수</span>
                  </div>
                  <div className="audit-score-grid">
                    <span>History {row.historyScore ?? '-'}</span>
                    <span>Spam {row.spamScore ?? '-'}</span>
                    <span>Backlink {row.backlinkScore ?? '-'}</span>
                    <span>Index {row.indexScore ?? '-'}</span>
                  </div>
                  <div className="setup-meta">
                    <span>{row.inventoryStatus}</span>
                    <span>{row.offerStatus}</span>
                    <span>TM {row.trademarkRisk}</span>
                    <span>YMYL {row.ymylRiskLevel}</span>
                  </div>
                  <p>{row.memo || '검수 메모 없음'}</p>
                  <small>
                    공개 가능: {row.publicListingAllowed ? '예' : '아니오'} ·
                    수동 검수: {row.manualReviewRequired ? '필수' : '완료'} ·
                    증빙: {row.evidenceAttached ? '첨부' : '대기'}
                  </small>
                </article>
              ))}
            </div>
            {filteredInventory.length === 0 ? (
              <div className="empty-state">
                조건에 맞는 도메인이 없습니다. 필터를 초기화하거나 검색어를 줄여보세요.
              </div>
            ) : null}
          </article>

          <article className="panel wide-panel" id="sitemaps">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">sitemap_submissions</p>
                <h2>사이트맵 등록 관리</h2>
              </div>
              <span className="status-pill planned">자동화 준비</span>
            </div>
            <div className="sitemap-summary">
              <div>
                <strong>{dashboard.sitemapSubmissions.length}</strong>
                <span>등록 관리 항목</span>
              </div>
              <div>
                <strong>{googleSitemaps.length}</strong>
                <span>Google API 후보</span>
              </div>
              <div>
                <strong>{manualSitemaps.length}</strong>
                <span>수동 확인 필요</span>
              </div>
              <p>
                Google은 Search Console API 연결 후 자동 제출 대상으로 관리합니다. 네이버는 공개 제출 API가 확인되기
                전까지 수동 등록과 검수 기록 중심으로 운영합니다.
              </p>
            </div>
            <div className="ops-table sitemap-table" role="table">
              <div className="ops-row ops-head" role="row">
                <span>도메인</span>
                <span>검색엔진</span>
                <span>사이트맵</span>
                <span>등록 방식</span>
                <span>상태</span>
                <span>메모</span>
              </div>
              {dashboard.sitemapSubmissions.map((row) => (
                <div className="ops-row" role="row" key={`${row.domain}-${row.searchEngine}`}>
                  <div>
                    <strong>{row.domain}</strong>
                    <small>{row.siteKey || 'site_key 미지정'}</small>
                  </div>
                  <StatusPill value={row.searchEngine} />
                  <a href={row.sitemapUrl} target="_blank" rel="noreferrer">{row.sitemapUrl}</a>
                  <span>{row.submissionMode}</span>
                  <StatusPill value={row.status} />
                  <small>{row.notes || row.responseMessage || '등록 기록 없음'}</small>
                </div>
              ))}
            </div>
            {dashboard.sitemapSubmissions.length === 0 ? (
              <div className="empty-state">
                아직 사이트맵 등록 큐가 없습니다. 서버에서 `npm run sync:sitemaps`를 실행하면 운영 후보 사이트 기준으로
                Google/Naver 관리 항목이 생성됩니다.
              </div>
            ) : null}
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
            <form className="notification-compose" onSubmit={submitNotificationDraft}>
              <div className="compose-row">
                <label>
                  <span>대상</span>
                  <select
                    value={notificationForm.audienceType}
                    onChange={(event) => updateNotificationForm('audienceType', event.target.value)}
                  >
                    <option value="customer">고객</option>
                    <option value="admin">관리자</option>
                    <option value="staff">직원</option>
                  </select>
                </label>
                <label>
                  <span>분류</span>
                  <select
                    value={notificationForm.category}
                    onChange={(event) => updateNotificationForm('category', event.target.value)}
                  >
                    <option value="notice">공지사항</option>
                    <option value="settlement">정산</option>
                    <option value="payment">입금</option>
                    <option value="account_action">계정 확인</option>
                    <option value="contract">계약</option>
                    <option value="domain">도메인</option>
                    <option value="security">보안</option>
                    <option value="general">일반</option>
                  </select>
                </label>
                <label>
                  <span>채널</span>
                  <select
                    value={notificationForm.channel}
                    onChange={(event) => updateNotificationForm('channel', event.target.value)}
                  >
                    <option value="portal">홈페이지</option>
                    <option value="telegram">텔레그램</option>
                    <option value="portal_telegram">홈페이지+텔레그램</option>
                    <option value="sms">문자</option>
                    <option value="kakao">카카오</option>
                  </select>
                </label>
                <label>
                  <span>중요도</span>
                  <select
                    value={notificationForm.severity}
                    onChange={(event) => updateNotificationForm('severity', event.target.value)}
                  >
                    <option value="info">안내</option>
                    <option value="action_required">확인 필요</option>
                    <option value="warning">주의</option>
                    <option value="critical">긴급</option>
                  </select>
                </label>
              </div>
              <label>
                <span>제목</span>
                <input
                  type="text"
                  value={notificationForm.title}
                  onChange={(event) => updateNotificationForm('title', event.target.value)}
                  placeholder="예: 5월 정산 안내"
                  maxLength={120}
                  required
                />
              </label>
              <label>
                <span>내용</span>
                <textarea
                  value={notificationForm.message}
                  onChange={(event) => updateNotificationForm('message', event.target.value)}
                  placeholder="고객에게 보여도 되는 사실 중심의 안내만 작성합니다."
                  rows={4}
                  required
                />
              </label>
              <div className="compose-footer">
                <label className="inline-check">
                  <input
                    type="checkbox"
                    checked={notificationForm.marketingMessage}
                    onChange={(event) => updateNotificationForm('marketingMessage', event.target.checked)}
                  />
                  광고성 문구 포함
                </label>
                <button className="primary-action" type="submit" disabled={notificationSaveState.status === 'saving'}>
                  <Bell size={16} />
                  초안 저장
                </button>
              </div>
              {notificationSaveState.message ? (
                <p className={`form-status ${notificationSaveState.status}`}>{notificationSaveState.message}</p>
              ) : null}
            </form>
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
