import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity,
  AlertTriangle,
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
import {
  contentQueueRows,
  customerRows,
  portalSummary,
  referralRows,
  runLogRows,
  settlementRows,
  siteRows,
  workflowRows,
  wpSetupRows,
} from './sampleData.js';
import './styles.css';

function StatusPill({ value }) {
  return <span className={`status-pill ${String(value).toLowerCase()}`}>{value}</span>;
}

function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem('wp-auto-theme') || 'light');
  const isDark = theme === 'dark';

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('wp-auto-theme', theme);
  }, [theme]);

  const metrics = [
    { label: '운영 사이트', value: siteRows.length, icon: Globe2 },
    { label: '검수 필요', value: siteRows.filter((site) => site.reviewRequired).length, icon: ClipboardCheck },
    { label: '콘텐츠 큐', value: contentQueueRows.length, icon: FileText },
    { label: 'N8N 워크플로우', value: workflowRows.length, icon: Activity },
    { label: '포털 고객', value: customerRows.length, icon: Users },
  ];

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
              {siteRows.map((site) => (
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
              {customerRows.map((customer) => (
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
              {contentQueueRows.map((item) => (
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
              {workflowRows.map((workflow) => (
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
            </div>
            <div className="setup-grid">
              {wpSetupRows.map((row) => (
                <article className="setup-card" key={row.domain}>
                  <div>
                    <strong>{row.domain}</strong>
                    <small>{row.siteName} · {row.language} · {row.theme}</small>
                  </div>
                  <p>{row.concept}</p>
                  <div className="card-footer">
                    <span>{row.monetize}</span>
                    <StatusPill value={row.status} />
                  </div>
                </article>
              ))}
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
                {settlementRows.map((row) => (
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
                {referralRows.map((row) => (
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

          <article className="panel" id="logs">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">run_logs</p>
                <h2>최근 작업 로그</h2>
              </div>
            </div>
            <div className="stack-list">
              {runLogRows.map((log) => (
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
