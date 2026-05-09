import React from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity,
  Brush,
  CheckCircle2,
  Database,
  FileText,
  Globe2,
  LayoutTemplate,
  Play,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { sampleDomains, sampleJobs, templateCatalog } from './sampleData.js';
import { buildAutomationPlan, detectDomainProfile } from './wordpressPlan.js';
import './styles.css';

function App() {
  const selectedDomain = sampleDomains[0];
  const profile = detectDomainProfile(selectedDomain.domain);
  const plan = buildAutomationPlan(selectedDomain);

  const metrics = [
    { label: '등록 도메인', value: sampleDomains.length, icon: Globe2 },
    { label: '자동화 작업', value: sampleJobs.length, icon: Activity },
    { label: '랜딩 템플릿', value: templateCatalog.length, icon: LayoutTemplate },
    { label: '필수 정책 페이지', value: '3종', icon: ShieldCheck },
  ];

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">W</div>
          <div>
            <strong>WP Auto Hub</strong>
            <span>Multi-site operations</span>
          </div>
        </div>
        <nav className="nav-list" aria-label="Primary">
          <a className="active" href="#dashboard"><Globe2 size={18} />대시보드</a>
          <a href="#automation"><Play size={18} />자동 세팅</a>
          <a href="#landing"><Brush size={18} />랜딩페이지</a>
          <a href="#publishing"><FileText size={18} />글 발행</a>
          <a href="#database"><Database size={18} />PostgreSQL</a>
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">WordPress Automation Hub</p>
            <h1>도메인별 워드프레스 자동 세팅 관리자</h1>
          </div>
          <button className="primary-action" type="button">
            <Sparkles size={18} />
            새 작업 만들기
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
          <article className="panel wide" id="dashboard">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Domain Intelligence</p>
                <h2>도메인 자동 판정</h2>
              </div>
              <span className="status-pill success">Ready</span>
            </div>
            <div className="domain-table" role="table">
              <div className="table-row table-head" role="row">
                <span>도메인</span>
                <span>언어</span>
                <span>목적</span>
                <span>상태</span>
              </div>
              {sampleDomains.map((domain) => (
                <div className="table-row" role="row" key={domain.domain}>
                  <strong>{domain.domain}</strong>
                  <span>{detectDomainProfile(domain.domain).languageLabel}</span>
                  <span>{domain.topic}</span>
                  <span className={`status-pill ${domain.status}`}>{domain.statusLabel}</span>
                </div>
              ))}
            </div>
          </article>

          <article className="panel" id="automation">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Automation Plan</p>
                <h2>{selectedDomain.domain}</h2>
              </div>
              <span className="language-badge">{profile.languageLabel}</span>
            </div>
            <ol className="step-list">
              {plan.steps.map((step) => (
                <li key={step.title}>
                  <CheckCircle2 size={18} />
                  <div>
                    <strong>{step.title}</strong>
                    <span>{step.detail}</span>
                  </div>
                </li>
              ))}
            </ol>
          </article>

          <article className="panel" id="landing">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Landing Templates</p>
                <h2>상세 페이지 디자인</h2>
              </div>
            </div>
            <div className="template-list">
              {templateCatalog.map((template) => (
                <div className="template-item" key={template.key}>
                  <span style={{ background: template.color }} />
                  <div>
                    <strong>{template.name}</strong>
                    <small>{template.useCase}</small>
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="panel wide" id="publishing">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Publishing Queue</p>
                <h2>글 발행 작업</h2>
              </div>
            </div>
            <div className="job-list">
              {sampleJobs.map((job) => (
                <div className="job-item" key={job.title}>
                  <div>
                    <strong>{job.title}</strong>
                    <span>{job.domain} · {job.schedule}</span>
                  </div>
                  <span className={`status-pill ${job.status}`}>{job.statusLabel}</span>
                </div>
              ))}
            </div>
          </article>

          <article className="panel database-panel" id="database">
            <div>
              <p className="eyebrow">PostgreSQL</p>
              <h2>관리 DB 구조</h2>
              <p>
                도메인, 사이트 설정, 랜딩페이지, 글 발행 큐, 자동화 로그를 PostgreSQL에 저장하도록 설계했습니다.
              </p>
            </div>
            <code>database/schema.sql</code>
          </article>
        </section>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
