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
import {
  createNotificationDraft,
  fetchDashboardData,
  getApiBaseUrl,
  saveApiBaseUrl,
  saveDomainCandidates,
  saveWordfriendsQuestionReply,
} from './api.js';
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
  domainCandidates: [],
  proxyAssignments: [],
  runtimeProfiles: [],
  healthAlerts: [],
  trustPlans: [],
  renewalDecisions: [],
  portalRealtime: {
    activeVisitors5m: 0,
    signupStartedToday: 0,
    signupCompletedToday: 0,
    contractStartedToday: 0,
    contractCompletedToday: 0,
    questionsToday: 0,
    handoffsToday: 0,
    openQuestions: 0,
    humanReviewQuestions: 0,
    blockedQuestions: 0,
    questions: [],
  },
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

const emptyQuestionReplyForm = {
  responseChannel: 'manual',
  responseStatus: 'draft',
  status: 'human_review',
  responseMessage: '',
  responseNote: '',
};

const siteStatusFilters = [
  { key: 'all', label: '전체' },
  { key: 'review_required', label: '검수 필요' },
  { key: 'operating_ready', label: '운영 가능' },
  { key: 'setup_pipeline', label: '세팅 진행' },
  { key: 'recovery_review', label: '복구 검토' },
  { key: 'high_risk_hold', label: '고위험 보류' },
  { key: 'infra_internal', label: '내부용' },
  { key: 'customer_portal', label: '고객포털' },
  { key: 'unclassified', label: '미분류' },
];

const SITE_PAGE_SIZE = 20;
const INVENTORY_PAGE_SIZE = 20;
const SITEMAP_PAGE_SIZE = 20;
const REALTIME_REFRESH_MS = 30000;

function formatSeoulDateTime(value) {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

const defaultDiscoveryForm = {
  category: 'health',
  keywords: 'bio, care, journal, korea',
  language: 'mixed',
  tlds: '.kr, .co.kr, .com',
  budgetPolicy: 'general_only',
};

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
  const label = normalized === 'not_set' ? '미정' : value || '미정';
  return <span className={`status-pill ${normalized}`}>{label}</span>;
}

function summarizeSitemapMessage(row) {
  if (row.status === 'submitted' && row.lastSubmittedAt) {
    return `Google 제출 완료: ${row.lastSubmittedAt}`;
  }

  const rawMessage = row.responseMessage || row.notes || '';
  const normalized = rawMessage.toLowerCase();

  if (normalized.includes('sufficient permission') || normalized.includes('forbidden')) {
    return '권한 없음: Search Console URL 속성 확인 필요';
  }

  if (normalized.includes('search console api has not been used') || normalized.includes('disabled')) {
    return 'API 비활성: Google Search Console API 사용 설정 필요';
  }

  if (normalized.includes('invalid_grant')) {
    return 'Google 인증 만료: refresh token 재발급 필요';
  }

  if (normalized.includes('not found') || normalized.includes('404')) {
    return '사이트맵 접근 실패: sitemap.xml 확인 필요';
  }

  if (row.status === 'ready') {
    return `제출 대기: npm run submit:sitemaps:google -- 1 ${row.domain}`;
  }

  if (row.status === 'manual_required') {
    return '수동 등록 필요: Naver 웹마스터 도구에서 확인';
  }

  return row.notes || row.responseMessage || '등록 기록 없음';
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

function matchesSiteStatusFilter(site, filterKey) {
  if (filterKey === 'all') return true;
  if (filterKey === 'review_required') return Boolean(site.reviewRequired);
  return site.portfolioStatus === filterKey;
}

function normalizeDisplayValue(value, fallback = '미정') {
  if (!value || String(value).toLowerCase() === 'not_set') return fallback;
  return value;
}

function normalizeDomainToken(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '')
    .replace(/^-+|-+$/g, '');
}

function parseCsv(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildDomainCandidates(form) {
  const keywords = parseCsv(form.keywords)
    .map(normalizeDomainToken)
    .filter(Boolean)
    .slice(0, 8);
  const tlds = parseCsv(form.tlds)
    .map((tld) => (tld.startsWith('.') ? tld : `.${tld}`))
    .slice(0, 5);
  const category = normalizeDomainToken(form.category) || 'site';
  const baseKeywords = keywords.length ? keywords : [category];
  const suffixes = ['hub', 'guide', 'journal', 'lab', 'news', 'wise'];
  const names = new Map();

  baseKeywords.forEach((keyword) => {
    names.set(keyword, { name: keyword, style: '브랜드형' });
    names.set(`${keyword}${category}`, { name: `${keyword}${category}`, style: '카테고리형' });
    suffixes.forEach((suffix) => {
      names.set(`${keyword}${suffix}`, { name: `${keyword}${suffix}`, style: suffix === 'news' ? '정보형' : '브랜드형' });
    });
  });

  return [...names.values()].flatMap((item) =>
    tlds.map((tld) => ({
      domain: `${item.name}${tld}`,
      style: item.style,
      tld,
      channel: tld.includes('kr') ? '호스팅KR 수동/CSV' : 'Namecheap API 우선',
      status: form.budgetPolicy === 'premium_allowed' ? '등록 가능 확인 대기' : '일반 등록가 우선',
    })),
  );
}

function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem('wp-auto-theme') || 'light');
  const [siteFilter, setSiteFilter] = useState('all');
  const [siteQuery, setSiteQuery] = useState('');
  const [siteLanguageFilter, setSiteLanguageFilter] = useState('all');
  const [siteMonetizeFilter, setSiteMonetizeFilter] = useState('all');
  const [sitePage, setSitePage] = useState(1);
  const [selectedSiteKey, setSelectedSiteKey] = useState(null);
  const [setupFilter, setSetupFilter] = useState('all');
  const [inventoryQuery, setInventoryQuery] = useState('');
  const [inventoryGradeFilter, setInventoryGradeFilter] = useState('all');
  const [inventoryStatusFilter, setInventoryStatusFilter] = useState('all');
  const [inventorySort, setInventorySort] = useState('score_desc');
  const [inventoryPage, setInventoryPage] = useState(1);
  const [sitemapQuery, setSitemapQuery] = useState('');
  const [sitemapEngineFilter, setSitemapEngineFilter] = useState('all');
  const [sitemapStatusFilter, setSitemapStatusFilter] = useState('all');
  const [sitemapPage, setSitemapPage] = useState(1);
  const [renewalDecisionFilter, setRenewalDecisionFilter] = useState('all');
  const [renewalSort, setRenewalSort] = useState('risk_first');
  const [apiEndpointInput, setApiEndpointInput] = useState(() => getApiBaseUrl());
  const [apiReloadToken, setApiReloadToken] = useState(0);
  const [dashboard, setDashboard] = useState(fallbackDashboard);
  const [apiState, setApiState] = useState({ status: 'sample', message: '샘플 데이터 사용 중' });
  const [notificationForm, setNotificationForm] = useState(emptyNotificationForm);
  const [notificationSaveState, setNotificationSaveState] = useState({ status: 'idle', message: '' });
  const [discoveryForm, setDiscoveryForm] = useState(defaultDiscoveryForm);
  const [candidateSaveState, setCandidateSaveState] = useState({ status: 'idle', message: '' });
  const [expandedQuestionId, setExpandedQuestionId] = useState(null);
  const [questionReplyDrafts, setQuestionReplyDrafts] = useState({});
  const [questionReplySaveState, setQuestionReplySaveState] = useState({});
  const isDark = theme === 'dark';

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('wp-auto-theme', theme);
  }, [theme]);

  useEffect(() => {
    setSitePage(1);
  }, [siteFilter, siteQuery, siteLanguageFilter, siteMonetizeFilter]);

  useEffect(() => {
    setInventoryPage(1);
  }, [inventoryQuery, inventoryGradeFilter, inventoryStatusFilter, inventorySort]);

  useEffect(() => {
    setSitemapPage(1);
  }, [sitemapQuery, sitemapEngineFilter, sitemapStatusFilter]);

  const reloadDashboard = useCallback(() => {
    setApiReloadToken((value) => value + 1);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setApiReloadToken((value) => value + 1);
    }, REALTIME_REFRESH_MS);

    return () => window.clearInterval(timer);
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

  const getQuestionReplyDraft = (question) => (
    questionReplyDrafts[question.id] || {
      responseChannel: question.responseChannel || emptyQuestionReplyForm.responseChannel,
      responseStatus: question.responseStatus === 'sent' ? 'sent' : emptyQuestionReplyForm.responseStatus,
      status: question.status === 'answered' ? 'answered' : emptyQuestionReplyForm.status,
      responseMessage: question.responseMessage || '',
      responseNote: question.responseNote || question.answerSummary || '',
    }
  );

  const getQuestionQuickAction = (question) => {
    if (question.status === 'answered' || question.responseStatus === 'sent') {
      return { label: '완료됨', tone: 'done' };
    }

    if (question.responseMessage || question.responseStatus === 'draft') {
      return { label: '초안 확인', tone: 'draft' };
    }

    return { label: '처리하기', tone: 'open' };
  };

  const normalizeSavedQuestionReply = (question, savedQuestion, draft, responseStatus) => ({
    ...question,
    status: savedQuestion?.status || (responseStatus === 'sent' ? 'answered' : draft.status),
    responseChannel: savedQuestion?.responseChannel || savedQuestion?.response_channel || draft.responseChannel,
    responseStatus: savedQuestion?.responseStatus || savedQuestion?.response_status || responseStatus || draft.responseStatus,
    responseMessage: savedQuestion?.responseMessage || savedQuestion?.response_message || draft.responseMessage,
    responseNote: savedQuestion?.responseNote || savedQuestion?.response_note || draft.responseNote,
    responseError: savedQuestion?.responseError || savedQuestion?.response_error || '',
    answerSummary: savedQuestion?.answerSummary || savedQuestion?.answer_summary || draft.responseNote || question.answerSummary,
    respondedAt: savedQuestion?.respondedAt || savedQuestion?.responded_at || question.respondedAt,
    updatedAt: savedQuestion?.updatedAt || savedQuestion?.updated_at || new Date().toISOString(),
  });

  const updateQuestionReplyDraft = (question, field, value) => {
    setQuestionReplyDrafts((current) => ({
      ...current,
      [question.id]: {
        ...getQuestionReplyDraft(question),
        ...current[question.id],
        [field]: value,
      },
    }));
  };

  const submitQuestionReply = async (question, responseStatus) => {
    const draft = getQuestionReplyDraft(question);
    setQuestionReplySaveState((current) => ({
      ...current,
      [question.id]: { status: 'saving', message: '답변 상태를 저장하는 중입니다.' },
    }));

    try {
      const result = await saveWordfriendsQuestionReply(question.id, {
        ...draft,
        responseStatus,
        status: responseStatus === 'sent' ? 'answered' : draft.status,
      });
      const resultError = result.ok === false ? result.error : '';
      const savedQuestion = normalizeSavedQuestionReply(question, result.question, draft, responseStatus);
      setQuestionReplyDrafts((current) => ({
        ...current,
        [question.id]: {
          responseChannel: savedQuestion.responseChannel || emptyQuestionReplyForm.responseChannel,
          responseStatus: savedQuestion.responseStatus || emptyQuestionReplyForm.responseStatus,
          status: savedQuestion.status || emptyQuestionReplyForm.status,
          responseMessage: savedQuestion.responseMessage || '',
          responseNote: savedQuestion.responseNote || savedQuestion.answerSummary || '',
        },
      }));
      setDashboard((current) => ({
        ...current,
        portalRealtime: {
          ...current.portalRealtime,
          questions: (current.portalRealtime.questions || []).map((row) => (
            row.id === question.id ? savedQuestion : row
          )),
        },
      }));
      setQuestionReplySaveState((current) => ({
        ...current,
        [question.id]: {
          status: 'saved',
          message: responseStatus === 'sent'
            ? '처리 완료로 저장했습니다. 실제 외부 발송 연동은 다음 단계에서 붙입니다.'
            : '답변 초안을 저장했습니다.',
        },
      }));
      if (resultError) {
        setQuestionReplySaveState((current) => ({
          ...current,
          [question.id]: {
            status: 'saved',
            message: `기록은 저장했습니다. 외부 발송만 실패했습니다: ${resultError}`,
          },
        }));
      }
      if (responseStatus === 'sent') {
        reloadDashboard();
      }
    } catch (error) {
      setQuestionReplySaveState((current) => ({
        ...current,
        [question.id]: { status: 'error', message: `저장 실패: ${error.message}` },
      }));
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
          domainCandidates: data.domainCandidates || [],
          proxyAssignments: data.proxyAssignments || [],
          runtimeProfiles: data.runtimeProfiles || [],
          healthAlerts: data.healthAlerts || [],
          trustPlans: data.trustPlans || [],
          renewalDecisions: data.renewalDecisions || [],
          portalRealtime: data.portalRealtime || fallbackDashboard.portalRealtime,
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
  const portalRealtime = dashboard.portalRealtime || fallbackDashboard.portalRealtime;
  const realtimeCards = [
    { label: '실시간 접속', value: portalRealtime.activeVisitors5m, detail: '최근 5분 활성 세션' },
    { label: '가입 시작', value: portalRealtime.signupStartedToday, detail: '오늘 시작한 회원가입' },
    { label: '가입 완료', value: portalRealtime.signupCompletedToday, detail: '오늘 완료한 회원가입' },
    { label: '계약 진행', value: portalRealtime.contractStartedToday, detail: '오늘 전자계약 시작' },
    { label: '파생 질문', value: portalRealtime.questionsToday, detail: '오늘 접수된 문의/AI 질문' },
    { label: '사람 검토', value: portalRealtime.humanReviewQuestions, detail: 'AI 자동답변 차단/검토' },
  ];
  const realtimeProgressRows = [
    {
      stage: '회원가입',
      current: `${portalRealtime.signupCompletedToday}/${portalRealtime.signupStartedToday}`,
      status: portalRealtime.signupStartedToday ? 'tracking' : '수집 대기',
      note: 'Wordfriends 가입 이벤트 연결 후 실시간 전환율 표시',
    },
    {
      stage: '전자계약',
      current: `${portalRealtime.contractCompletedToday}/${portalRealtime.contractStartedToday}`,
      status: portalRealtime.contractStartedToday ? 'tracking' : '수집 대기',
      note: '계약 시작/완료 이벤트를 분리해 이탈 지점 확인',
    },
    {
      stage: '문의/AI',
      current: `${portalRealtime.handoffsToday}건 handoff`,
      status: portalRealtime.handoffsToday ? 'human_review' : '수집 대기',
      note: '정산, 세금, AdSense, 정책성 질문은 사람 검토로 전환',
    },
  ];
  const portalCustomers = dashboard.customers.filter((customer) =>
    ['ACTIVE', 'LEAD', 'PENDING', 'SUBMITTED'].includes(String(customer.contractStatus || '').toUpperCase()),
  );
  const portalReportableSites = dashboard.sites.filter((site) =>
    ['Customer owned', 'Customer portal'].includes(site.owner) &&
    site.portfolioStatus !== 'high_risk_hold' &&
    !['high', 'critical'].includes(site.riskLevel),
  );
  const portalSettlementRows = dashboard.settlements.filter((row) =>
    ['CONFIRMED', 'DRAFT', 'PENDING'].includes(String(row.status || '').toUpperCase()),
  );
  const portalReferralRows = dashboard.referrals.filter((row) =>
    Number(row.depth || 1) === 1 && String(row.status || '').toUpperCase() !== 'DISABLED',
  );
  const portalSubmittedSitemaps = dashboard.sitemapSubmissions.filter((row) =>
    row.searchEngine === 'google' && ['submitted', 'verified'].includes(row.status),
  );
  const portalPrograms = [
    {
      name: '회원가입 / 로그인',
      status: 'MVP 1',
      metric: `${portalCustomers.length}명`,
      wordfriends: '고객 계정 생성, 로그인, 비밀번호 재설정, 내 정보 확인',
      siteops: '고객 상태, 접근 권한, 계약 상태, 마지막 활동 기록',
    },
    {
      name: '전자계약 / 정책 동의',
      status: 'MVP 1',
      metric: `${dashboard.customers.filter((customer) => customer.contractStatus === 'ACTIVE').length}건`,
      wordfriends: '전자계약서, 이용약관, 개인정보처리방침, 정책 버전 동의',
      siteops: '계약 버전, 동의 일시, 정책 변경 이력, 재동의 필요 여부',
    },
    {
      name: '내 사이트 운영 리포트',
      status: 'MVP 1',
      metric: `${portalReportableSites.length}개`,
      wordfriends: '사이트 상태, 발행 현황, 사이트맵 제출 여부, 고객용 공지',
      siteops: '검수, 리스크, N8N 실행, Search Console 오류, 내부 메모',
    },
    {
      name: '정산 / 추천 보상',
      status: 'MVP 1',
      metric: `${portalSettlementRows.length + portalReferralRows.length}건`,
      wordfriends: '예상 정산 안내, 입금 예정, 1단계 추천 보상 상태',
      siteops: '정산 근거, 지급 보류 사유, 세액 참고값, 법무/세무 검토 상태',
    },
    {
      name: '문의 / AI 상담',
      status: 'MVP 2',
      metric: `${customerNotifications.length}건`,
      wordfriends: '문의 접수, AI 초안, 담당자 답변, 공지 확인',
      siteops: '정책/세무/수익 관련 질문 자동 차단, 사람 검토 큐, 내부 알림',
    },
    {
      name: 'SEO / 색인 요약',
      status: 'MVP 2',
      metric: `${portalSubmittedSitemaps.length}건`,
      wordfriends: '고객에게 보여도 되는 제출 완료/대기 상태만 표시',
      siteops: '권한 없음, API 오류, 토큰 만료, 사이트맵 실패 원인 추적',
    },
  ];
  const portalGuardrails = [
    '수익, 애드센스 승인, 트래픽, 순위 상승은 고객 화면에서 보장 표현 금지',
    '도메인 검수 점수, 스팸 이력, 내부 리스크, 서버/IP 정보는 SiteOps 내부 전용',
    '앱 비밀번호, 애드센스 로그인, API 키, 토큰은 Wordfriends와 DB에 평문 저장 금지',
    '세금, 정책 회피, 의료/금융/법률성 문의는 AI 자동 답변 없이 사람 검토로 전환',
  ];
  const productPolicyRows = [
    {
      label: '정가 기준',
      value: '5,000,000원',
      status: 'internal_list_price',
      note: '실제 판매 이력/고지 기준이 정리되기 전에는 내부 기준가로만 관리',
    },
    {
      label: '추천 이벤트 세팅비',
      value: '3,000,000원',
      status: 'event_price',
      note: '숙성 도메인, 기본 페이지, WP 세팅, 초기 발행 준비 포함',
    },
    {
      label: 'BOSS 수익 쉐어',
      value: '40%',
      status: 'agency_share',
      note: '추천 월 인센티브가 붙은 도메인은 BOSS 실수령 기준 35%로 별도 계산',
    },
  ];
  const referralPolicyRows = [
    {
      label: '직접 추천 세팅 인센티브',
      value: '500,000원',
      status: 'active',
      note: '계약/입금/철회 기간 확인 후 당일 또는 매월 5일 전 지급',
    },
    {
      label: '직접 추천 월 인센티브',
      value: 'AdSense 총수입 5%',
      status: 'active',
      note: '고객 제공 정산자료 기준, 해당 도메인 유지 기간에만 지급',
    },
    {
      label: '2단계 추천',
      value: '비활성',
      status: 'legal_review',
      note: '방문판매/후원방문판매 리스크 검토 전까지 관리자 계산만 보류',
    },
  ];
  const threeYearValidationRows = [
    {
      year: '1년차',
      domains: '120개',
      setupNet: '3.0억',
      shareNet: '0.25억',
      total: '3.25억',
      assumption: '월 10개, 평균 활성 60개, 도메인 월 총수입 10만원',
    },
    {
      year: '2년차',
      domains: '240개',
      setupNet: '3.0억',
      shareNet: '1.89억',
      total: '4.89억',
      assumption: '평균 활성 180개, 도메인 월 총수입 25만원',
    },
    {
      year: '3년차',
      domains: '360개',
      setupNet: '3.0억',
      shareNet: '5.04억',
      total: '8.04억',
      assumption: '평균 활성 300개, 도메인 월 총수입 40만원',
    },
  ];
  const proxyAssignments = dashboard.proxyAssignments || [];
  const proxyPlanningRows = proxyAssignments.length
    ? proxyAssignments
    : dashboard.sites
        .filter((site) => !site.isInternalInfra && site.portfolioStatus !== 'infra_internal')
        .slice(0, 8)
        .map((site) => ({
          siteKey: site.siteKey,
          domain: site.domain,
          customerCode: site.owner === 'Customer owned' ? 'CUSTOMER' : 'BOSS',
          profileKey: `PXY_${String(site.siteKey || site.domain).toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`,
          provider: 'manual',
          proxyType: site.language === 'ko' ? 'datacenter' : 'datacenter',
          region: site.language === 'ko' ? 'KR' : 'US',
          egressPolicy: 'wp_publish_only',
          credentialRef: 'N8N_CREDENTIAL_REQUIRED',
          status: 'planned',
          lastVerifiedAt: '',
          notes: 'N8N HTTP Request 노드에서 이 프로필 키를 기준으로 운영 접속 경로를 선택',
        }));
  const proxyActiveCount = proxyAssignments.filter((row) => row.status === 'active').length;
  const proxyNeedsCheckCount = proxyPlanningRows.filter((row) =>
    ['planned', 'verify_required', 'failed'].includes(row.status),
  ).length;
  const runtimeProfileRows = dashboard.runtimeProfiles?.length
    ? dashboard.runtimeProfiles
    : proxyPlanningRows.slice(0, 8).map((row) => ({
        siteKey: row.siteKey,
        domain: row.domain,
        requestProfileKey: `REQ_${String(row.siteKey || row.domain).toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`,
        userAgentLabel: 'siteops-editorial-default',
        publishWindowStart: 9,
        publishWindowEnd: 21,
        maxPostsPerDay: 1,
        styleProfile: 'balanced_editorial',
        qualityGate: 'review_first',
        status: 'planned',
        notes: 'N8N은 이 프로필을 읽고 발행 시간, 스타일, 검수 기준을 적용',
      }));
  const healthAlertRows = dashboard.healthAlerts?.length
    ? dashboard.healthAlerts
    : [
        {
          id: 'alert-template-ctr',
          siteKey: 'template',
          domain: 'Search Console 연결 후',
          alertType: 'ctr_drop',
          severity: 'warning',
          status: 'planned',
          metricName: 'CTR',
          currentValue: null,
          baselineValue: null,
          thresholdValue: -30,
          title: 'CTR 급락 감지',
          message: '최근 7일 CTR이 기준 대비 30% 이상 하락하면 Red Alert로 표시',
          source: 'search_console',
          detectedAt: '연동 대기',
        },
        {
          id: 'alert-template-ads',
          siteKey: 'template',
          domain: 'AdSense 연결 후',
          alertType: 'ads_serving_issue',
          severity: 'critical',
          status: 'planned',
          metricName: 'ads_serving',
          currentValue: null,
          baselineValue: null,
          thresholdValue: null,
          title: '광고 송출 이상',
          message: '고객 제공 자료 또는 API 연동값 기준으로 광고 송출 중단 의심 시 내부 알림',
          source: 'adsense',
          detectedAt: '연동 대기',
        },
      ];
  const trustPlanRows = dashboard.trustPlans?.length
    ? dashboard.trustPlans
    : dashboard.domainInventory
        .filter((row) => ['watch', 'safe_candidate', 'unrated'].includes(row.finalGrade || 'unrated'))
        .slice(0, 8)
        .map((row) => ({
          id: `trust-${row.domain}`,
          siteKey: row.domain,
          domain: row.domain,
          planStage: row.finalGrade === 'safe_candidate' ? 'content_build' : 'incubating',
          trustScore: row.overallScore || 0,
          contentTarget: 30,
          indexedTarget: 10,
          authorityOutboundTarget: 5,
          outboundPolicy: 'editorial_reference_only',
          nextAction: row.ymylRiskLevel === 'high' ? 'YMYL 검수 기준 강화 후 콘텐츠 발행' : '기초 콘텐츠와 공신력 출처 인용 계획 수립',
          status: 'active',
          lastReviewedAt: '',
          notes: row.memo,
        }));
  const renewalDecisionRows = dashboard.renewalDecisions || [];
  const renewalDoNotRenewCount = renewalDecisionRows.filter((row) => row.renewalDecision === 'do_not_renew').length;
  const renewalReviewCount = renewalDecisionRows.filter((row) => ['manual_review', 'hold'].includes(row.renewalDecision)).length;
  const renewalReadyCount = renewalDecisionRows.filter((row) => row.renewalDecision === 'renew').length;
  const renewalDecisionOptions = ['all', 'renew', 'manual_review', 'hold', 'do_not_renew'];
  const renewalDecisionOrder = {
    do_not_renew: 1,
    hold: 2,
    manual_review: 3,
    renew: 4,
  };
  const visibleRenewalRows = renewalDecisionRows
    .filter((row) => renewalDecisionFilter === 'all' || row.renewalDecision === renewalDecisionFilter)
    .sort((a, b) => {
      if (renewalSort === 'domain_asc') return a.domain.localeCompare(b.domain);
      if (renewalSort === 'decision_asc') {
        const decisionDiff = (renewalDecisionOrder[a.renewalDecision] || 9) - (renewalDecisionOrder[b.renewalDecision] || 9);
        if (decisionDiff !== 0) return decisionDiff;
        return a.domain.localeCompare(b.domain);
      }
      if (renewalSort === 'automation_blocked') {
        const automationDiff = Number(a.automationAllowed) - Number(b.automationAllowed);
        if (automationDiff !== 0) return automationDiff;
      }
      const riskDiff = (renewalDecisionOrder[a.renewalDecision] || 9) - (renewalDecisionOrder[b.renewalDecision] || 9);
      if (riskDiff !== 0) return riskDiff;
      return a.domain.localeCompare(b.domain);
    });
  const criticalHealthAlerts = healthAlertRows.filter((row) => row.severity === 'critical' && row.status !== 'resolved');
  const openHealthAlerts = healthAlertRows.filter((row) => ['open', 'planned', 'acknowledged'].includes(row.status));
  const googleSitemaps = dashboard.sitemapSubmissions.filter((row) => row.searchEngine === 'google');
  const googleSubmittedSitemaps = googleSitemaps.filter((row) => ['submitted', 'verified'].includes(row.status));
  const googleReadySitemaps = googleSitemaps.filter((row) => ['ready', 'failed'].includes(row.status));
  const manualSitemaps = dashboard.sitemapSubmissions.filter((row) =>
    ['manual_required', 'failed'].includes(row.status),
  );
  const sitemapStatusOrder = {
    submitted: 1,
    verified: 2,
    failed: 3,
    ready: 4,
    draft: 5,
    manual_required: 6,
  };
  const sitemapEngineOrder = { google: 1, naver: 2 };
  const sortedSitemapSubmissions = [...dashboard.sitemapSubmissions].sort((a, b) => {
    const engineDiff = (sitemapEngineOrder[a.searchEngine] || 9) - (sitemapEngineOrder[b.searchEngine] || 9);
    if (engineDiff !== 0) return engineDiff;

    const statusDiff = (sitemapStatusOrder[a.status] || 9) - (sitemapStatusOrder[b.status] || 9);
    if (statusDiff !== 0) return statusDiff;

    return a.domain.localeCompare(b.domain);
  });
  const sitemapEngineOptions = [
    'all',
    ...new Set(dashboard.sitemapSubmissions.map((row) => row.searchEngine || 'unknown')),
  ];
  const sitemapStatusOptions = [
    'all',
    ...new Set(dashboard.sitemapSubmissions.map((row) => row.status || 'unknown')),
  ];
  const normalizedSitemapQuery = sitemapQuery.trim().toLowerCase();
  const filteredSitemapSubmissions = sortedSitemapSubmissions.filter((row) => {
    const haystack = [
      row.domain,
      row.propertyUrl,
      row.siteKey,
      row.searchEngine,
      row.sitemapUrl,
      row.submissionMode,
      row.status,
      row.notes,
      row.responseMessage,
      summarizeSitemapMessage(row),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    const queryMatch = !normalizedSitemapQuery || haystack.includes(normalizedSitemapQuery);
    const engineMatch = sitemapEngineFilter === 'all' || (row.searchEngine || 'unknown') === sitemapEngineFilter;
    const statusMatch = sitemapStatusFilter === 'all' || (row.status || 'unknown') === sitemapStatusFilter;
    return queryMatch && engineMatch && statusMatch;
  });
  const sitemapPageCount = Math.max(1, Math.ceil(filteredSitemapSubmissions.length / SITEMAP_PAGE_SIZE));
  const normalizedSitemapPage = Math.min(sitemapPage, sitemapPageCount);
  const pagedSitemapSubmissions = filteredSitemapSubmissions.slice(
    (normalizedSitemapPage - 1) * SITEMAP_PAGE_SIZE,
    normalizedSitemapPage * SITEMAP_PAGE_SIZE,
  );
  const siteCounts = siteStatusFilters.map((filter) => ({
    ...filter,
    count: dashboard.sites.filter((site) => matchesSiteStatusFilter(site, filter.key)).length,
  }));
  const siteLanguageOptions = [
    'all',
    ...new Set(dashboard.sites.map((site) => site.language || 'unknown')),
  ];
  const siteMonetizeOptions = [
    'all',
    ...new Set(dashboard.sites.map((site) => site.monetizeMode || 'not_set')),
  ];
  const normalizedSiteQuery = siteQuery.trim().toLowerCase();
  const filteredSites = dashboard.sites.filter((site) => {
    const haystack = [
      site.domain,
      site.siteKey,
      site.owner,
      site.language,
      site.topic,
      site.portfolioStatus,
      site.approvalStatus,
      site.riskLevel,
      site.monetizeMode,
      site.setupStatus,
      site.memo,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    const queryMatch = !normalizedSiteQuery || haystack.includes(normalizedSiteQuery);
    const statusMatch = matchesSiteStatusFilter(site, siteFilter);
    const languageMatch = siteLanguageFilter === 'all' || (site.language || 'unknown') === siteLanguageFilter;
    const monetizeMatch = siteMonetizeFilter === 'all' || (site.monetizeMode || 'not_set') === siteMonetizeFilter;
    return queryMatch && statusMatch && languageMatch && monetizeMatch;
  });
  const sitePageCount = Math.max(1, Math.ceil(filteredSites.length / SITE_PAGE_SIZE));
  const normalizedSitePage = Math.min(sitePage, sitePageCount);
  const pagedSites = filteredSites.slice(
    (normalizedSitePage - 1) * SITE_PAGE_SIZE,
    normalizedSitePage * SITE_PAGE_SIZE,
  );
  const selectedSite = dashboard.sites.find((site) => site.siteKey === selectedSiteKey) || pagedSites[0] || null;
  const selectedSiteQueue = selectedSite
    ? dashboard.contentQueue.filter((item) => item.siteKey === selectedSite.siteKey)
    : [];
  const selectedSiteSitemaps = selectedSite
    ? dashboard.sitemapSubmissions.filter((row) => row.domain === selectedSite.domain || row.siteKey === selectedSite.siteKey)
    : [];
  const selectedSiteSetup = selectedSite
    ? dashboard.wpSetup.find((row) => row.domain === selectedSite.domain)
    : null;
  const selectedSiteErrors = [
    ...dashboard.runLogs.filter((log) => log.siteKey === selectedSite?.siteKey && String(log.status || '').toLowerCase().includes('fail')),
    ...selectedSiteSitemaps.filter((row) => row.status === 'failed'),
  ];
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
  const reusableDomains = dashboard.domainInventory.filter((row) =>
    !['reject', 'hold'].includes(row.finalGrade) &&
    !['rejected', 'withdrawn'].includes(row.inventoryStatus) &&
    (row.overallScore ?? 0) >= 65,
  );
  const instantReuseDomains = reusableDomains.filter((row) =>
    row.finalGrade === 'safe_candidate' &&
    row.manualReviewRequired === false &&
    (row.spamScore ?? 0) >= 70,
  );
  const recoveryReuseDomains = reusableDomains.filter((row) =>
    row.finalGrade === 'watch' || row.manualReviewRequired || (row.indexScore ?? 0) < 70,
  );
  const quarantineDomains = dashboard.domainInventory.filter((row) =>
    ['reject', 'hold'].includes(row.finalGrade) ||
    ['rejected', 'withdrawn'].includes(row.inventoryStatus) ||
    (row.spamScore ?? 100) < 30,
  );
  const longTermRecoveryDomains = dashboard.domainInventory.filter((row) =>
    !reusableDomains.includes(row) &&
    !quarantineDomains.includes(row) &&
    (row.overallScore ?? 0) >= 45,
  );
  const finalDiscardDomains = dashboard.domainInventory.filter((row) =>
    quarantineDomains.includes(row) &&
    (row.overallScore ?? 0) < 25 &&
    (row.spamScore ?? 100) < 10,
  );
  const nicheLockedDomains = reusableDomains.filter((row) =>
    ['medium', 'high'].includes(row.ymylRiskLevel) ||
    String(row.memo || '').includes('리다이렉션') ||
    String(row.memo || '').includes('본진'),
  );
  const recyclableUniverse = dashboard.domainInventory.filter((row) => !finalDiscardDomains.includes(row));
  const reuseCandidates = [
    ...instantReuseDomains.map((row) => ({
      ...row,
      reuseStage: '즉시 재활용',
      action: '콘텐츠/소유권 확인 후 운영 큐 배치',
    })),
    ...recoveryReuseDomains.map((row) => ({
      ...row,
      reuseStage: '복구 후 재활용',
      action: 'GSC 등록, 백링크 검토, 니치 유지 콘텐츠 발행',
    })),
    ...longTermRecoveryDomains.map((row) => ({
      ...row,
      reuseStage: '장기 회생 관찰',
      action: '저강도 발행, 색인 변화 관찰, 60일 후 재평가',
    })),
    ...quarantineDomains
      .filter((row) => !finalDiscardDomains.includes(row))
      .map((row) => ({
        ...row,
        reuseStage: '격리 후 재판정',
        action: '자동화 잠금, 증빙 수집 후 회생 가능성 재검토',
      })),
    ...finalDiscardDomains.map((row) => ({
      ...row,
      reuseStage: '폐기 후보',
      action: '갱신 중단 또는 폐기 전 최종 수동 확인',
    })),
  ]
    .sort((a, b) => (b.overallScore ?? -1) - (a.overallScore ?? -1))
    .slice(0, 12);
  const reusePlaybook = [
    {
      title: '1차 선별',
      metric: `${recyclableUniverse.length}개`,
      body: '폐기 확정 전까지는 회생 후보로 남기고, 점수와 이력에 따라 강도를 나눕니다.',
    },
    {
      title: '복구 큐',
      metric: `${recoveryReuseDomains.length + longTermRecoveryDomains.length}개`,
      body: 'Search Console 등록, 사이트맵 제출, 백링크 오염 검토, 저강도 발행으로 회복 신호를 봅니다.',
    },
    {
      title: '최종 폐기',
      metric: `${finalDiscardDomains.length}개`,
      body: '정말 못 살리는 도메인만 갱신 중단 후보로 두고, 그 전까지는 고객 노출 없이 격리합니다.',
    },
  ];
  const highRiskSites = dashboard.sites.filter((site) =>
    site.portfolioStatus === 'high_risk_hold' || ['high', 'critical'].includes(site.riskLevel),
  );
  const unclassifiedSites = dashboard.sites.filter((site) => site.portfolioStatus === 'unclassified');
  const validationFailedContent = dashboard.contentQueue.filter((item) =>
    String(item.status || '').includes('FAILED'),
  );
  const adsenseReadySites = dashboard.sites.filter((site) =>
    ['approved', 'ready'].includes(String(site.adsense || '').toLowerCase()),
  );
  const failedSitemapRows = dashboard.sitemapSubmissions.filter((row) => row.status === 'failed');
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
  const inventoryPageCount = Math.max(1, Math.ceil(filteredInventory.length / INVENTORY_PAGE_SIZE));
  const normalizedInventoryPage = Math.min(inventoryPage, inventoryPageCount);
  const pagedInventory = filteredInventory.slice(
    (normalizedInventoryPage - 1) * INVENTORY_PAGE_SIZE,
    normalizedInventoryPage * INVENTORY_PAGE_SIZE,
  );
  const auditAutomationSources = [
    {
      label: '기존 보유 도메인',
      count: dashboard.sites.length,
      command: 'npm run sync:domain-inventory',
      note: 'sites 기준으로 domain_inventory와 domain_audits를 다시 산정합니다.',
    },
    {
      label: '신규 구매 후보',
      count: dashboard.domainInventory.filter((row) => row.inventoryStatus === 'internal_review').length,
      command: '후보 입력 → 검수 큐 등록',
      note: '구매 전 도메인을 먼저 큐에 올리고 점수/위험/니치 적합도를 확인합니다.',
    },
    {
      label: '회생/재활용 대상',
      count: recyclableUniverse.length,
      command: '도메인 재활용 큐 연동',
      note: '못 살리는 도메인만 최종 폐기 후보로 두고 나머지는 관찰 큐로 보냅니다.',
    },
  ];
  const auditAutomationSteps = [
    {
      step: '1. 수집',
      owner: 'SiteOps',
      output: '도메인, 언어, 니치, 메모, 구매 출처',
      automation: 'sites / 후보 입력 / Google Sheets 읽기 뷰어',
    },
    {
      step: '2. 1차 점수',
      owner: 'Rules',
      output: 'History, Spam, Backlink, Index, Overall',
      automation: '현재 sync-domain-inventory 규칙 확장',
    },
    {
      step: '3. 외부 증빙',
      owner: 'Operator',
      output: 'Ahrefs, Search Console, Archive, 상표/YMYL 확인',
      automation: 'API 가능 항목은 자동, 애매한 항목은 수동 증빙',
    },
    {
      step: '4. 판정',
      owner: 'BOSS',
      output: '즉시 운영, 복구, 장기 관찰, 격리, 폐기 후보',
      automation: '도메인 재활용 섹션과 연결',
    },
    {
      step: '5. 실행',
      owner: 'N8N/API',
      output: 'WP 세팅, 사이트맵, 저강도 발행, 60일 재평가',
      automation: '고객 노출 전 내부 승인 필수',
    },
  ];
  const externalAuditChannels = [
    {
      name: '호스팅KR',
      role: 'KR 도메인 보유/갱신',
      costPolicy: '보유 계정',
      useCase: 'KR 도메인 만료일, 등록기관, 네임서버, 갱신 여부 확인',
    },
    {
      name: 'Namecheap',
      role: '해외 도메인 보유/구매',
      costPolicy: '보유 계정',
      useCase: '해외 도메인 갱신, 신규 구매, DNS/이전 상태 확인',
    },
    {
      name: 'GoDaddy',
      role: '경매/만료 후보',
      costPolicy: '무료 우선',
      useCase: '경매 후보와 만료 도메인 가격, 경쟁 상태 확인',
    },
    {
      name: 'ExpiredDomains.net',
      role: '후보 발굴',
      costPolicy: '무료 우선',
      useCase: '키워드, TLD, 나이, 기본 백링크 조건으로 1차 후보 수집',
    },
    {
      name: 'SpamZilla',
      role: '스팸/히스토리 필터',
      costPolicy: '구독 활용',
      useCase: '만료 도메인 스팸 이력, 앵커, 리다이렉션, 위험 신호 확인',
    },
    {
      name: 'web.archive.org',
      role: '과거 사이트 이력',
      costPolicy: '무료',
      useCase: '도박, 성인, 해킹, 언어 변경, 니치 변경 이력 확인',
    },
    {
      name: 'WebsiteSEOChecker',
      role: '보조 SEO 지표',
      costPolicy: '무료 우선',
      useCase: 'DA/PA, 스팸, 백링크, 인덱스 보조 지표 확인',
    },
    {
      name: 'Ahrefs',
      role: '최종 백링크 검수',
      costPolicy: '무료 우선, 병목 시 유료',
      useCase: 'Ref domains, 앵커 텍스트, 깨진 링크, 회생 가능성 최종 확인',
    },
  ];
  const discoveryInputs = [
    { label: '카테고리', value: 'health, real estate, news, finance, pet, local' },
    { label: '키워드', value: 'bio, care, city, housing, journal, guide, korea' },
    { label: '언어/TLD', value: 'ko: .kr/.co.kr · en: .com/.net/.org' },
    { label: '가격 정책', value: '일반 등록가 우선, 프리미엄은 수동 승인' },
  ];
  const discoveryStrategies = [
    {
      name: '브랜드형',
      pattern: 'keyword + short suffix',
      examples: ['biocarelab.com', 'citypulse.kr', 'petwise.co.kr'],
      note: '장기 운영이나 매각에 유리한 짧고 기억 쉬운 이름',
    },
    {
      name: '정보형',
      pattern: 'topic + news/guide/journal',
      examples: ['housingnews.co.kr', 'financeguide.kr', 'carejournal.com'],
      note: '콘텐츠 발행과 SEO 구조를 잡기 쉬운 이름',
    },
    {
      name: '지역형',
      pattern: 'city/region + topic',
      examples: ['seoulcare.kr', 'busanhome.co.kr', 'koreabiohub.com'],
      note: '지역/기관/생활 키워드와 연결하기 좋은 이름',
    },
    {
      name: '니치 유지형',
      pattern: 'old niche + clean brand',
      examples: ['catcarejournal.com', 'medrescuehub.org', 'greenlivingguide.net'],
      note: '기존 백링크 니치를 살려 회생 운영할 때 사용',
    },
  ];
  const discoveryPipeline = [
    {
      step: '1. 후보 생성',
      automation: '키워드, 카테고리, TLD, 접두/접미어 조합',
      output: '등록 후보 100~500개',
    },
    {
      step: '2. 등록 가능 확인',
      automation: 'Namecheap API 우선, GoDaddy API 보조, KR은 수동/CSV 시작',
      output: 'available / premium / taken',
    },
    {
      step: '3. 신규 도메인 점수화',
      automation: '길이, 발음, 브랜드성, 상표 위험, 수익화 카테고리, 가격',
      output: '구매 후보 / 보류 / 제외',
    },
    {
      step: '4. 운영 성장',
      automation: 'WP 세팅, 사이트맵, Search Console, 저강도 발행',
      output: '60/90일 관찰 리포트',
    },
    {
      step: '5. 자산화',
      automation: 'BOSS 운영, 고객 배정, 매각 후보, 장기 보유 판단',
      output: '운영/매각/보류 결정',
    },
  ];
  const generatedDomainCandidates = buildDomainCandidates(discoveryForm).slice(0, 12);
  const savedDomainCandidates = dashboard.domainCandidates || [];
  const queuedDomainCandidates = savedDomainCandidates.filter((candidate) =>
    ['queued', 'checking', 'needs_review'].includes(candidate.auditStatus),
  );
  const saveGeneratedCandidates = async () => {
    setCandidateSaveState({ status: 'saving', message: '후보 큐 저장 중...' });
    try {
      const result = await saveDomainCandidates({
        category: discoveryForm.category,
        keywords: parseCsv(discoveryForm.keywords),
        languagePriority: discoveryForm.language,
        pricePolicy: discoveryForm.budgetPolicy,
        candidates: generatedDomainCandidates,
      });
      setCandidateSaveState({
        status: 'saved',
        message: `${result.savedCount}개 후보를 구매 전 검수 큐에 저장했습니다.`,
      });
      reloadDashboard();
    } catch (error) {
      setCandidateSaveState({
        status: 'error',
        message: `후보 저장 실패: ${error.message}`,
      });
    }
  };

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
          <a href="#keywords"><Search size={18} />키워드 관리</a>
          <a href="#setup"><ServerCog size={18} />WP 세팅</a>
          <a href="#inventory"><ShieldCheck size={18} />도메인 검수</a>
          <a href="#domain-discovery"><Search size={18} />도메인 발굴</a>
          <a href="#domain-audit-auto"><Activity size={18} />검수 자동화</a>
          <a href="#domain-reuse"><RefreshCw size={18} />도메인 재활용</a>
          <a href="#domain-expiry"><Globe2 size={18} />도메인 만료</a>
          <a href="#sitemaps"><Search size={18} />사이트맵</a>
          <a href="#seo"><Activity size={18} />SEO 현황</a>
          <a href="#monetization"><WalletCards size={18} />수익화 현황</a>
          <a href="#portal"><UserPlus size={18} />고객 포털</a>
          <a href="#portal-admin"><ClipboardCheck size={18} />포털 관리</a>
          <a href="#realtime"><Activity size={18} />실시간 관제</a>
          <a href="#settlements"><WalletCards size={18} />정산/추천</a>
          <a href="#proxy"><ServerCog size={18} />프록시 격리</a>
          <a href="#red-alert"><AlertTriangle size={18} />Red Alert</a>
          <a href="#trust-score"><ShieldCheck size={18} />Trust Score</a>
          <a href="#tax"><ClipboardCheck size={18} />세액 안내</a>
          <a href="#notifications"><Bell size={18} />알림센터</a>
          <a href="#n8n"><Play size={18} />N8N 실행</a>
          <a href="#errors"><AlertTriangle size={18} />에러 센터</a>
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

        <section className="panel wide-panel delivery-panel" id="delivery">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Delivery map</p>
              <h2>SiteOps와 Wordfriends 역할 분리</h2>
            </div>
            <span className="status-pill active">설계 확정</span>
          </div>
          <div className="delivery-grid">
            <article className="delivery-card">
              <strong>siteops.09car.co.kr</strong>
              <span>내부 관리자 전용</span>
              <p>도메인, 사이트, WP 세팅, 사이트맵, 리스크, 정산, 알림, N8N, 에러, 보안 상태를 관리합니다.</p>
            </article>
            <article className="delivery-card">
              <strong>wordfriends.co.kr</strong>
              <span>고객 포털 및 고객용 홈페이지</span>
              <p>회원가입, 로그인, 전자계약서, 약관, 개인정보처리방침, 문의, AI 상담, 내 사이트, 공지를 제공합니다.</p>
            </article>
            <article className="delivery-card">
              <strong>MVP 원칙</strong>
              <span>빠르게 만들되 과장 금지</span>
              <p>수익, 애드센스 승인, 트래픽, 서버/IP/VPN 안전성은 보장하지 않고 내부 리스크 판단만 기록합니다.</p>
            </article>
          </div>
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

            <div className="site-toolbar" aria-label="도메인 검색과 추가 필터">
              <label className="site-search">
                <Search size={18} />
                <input
                  type="search"
                  value={siteQuery}
                  onChange={(event) => setSiteQuery(event.target.value)}
                  placeholder="도메인, site_key, 메모, 상태 검색"
                />
              </label>
              <label>
                <span>언어</span>
                <select value={siteLanguageFilter} onChange={(event) => setSiteLanguageFilter(event.target.value)}>
                  {siteLanguageOptions.map((language) => (
                    <option value={language} key={language}>
                      {language === 'all' ? '전체' : language}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>수익화</span>
                <select value={siteMonetizeFilter} onChange={(event) => setSiteMonetizeFilter(event.target.value)}>
                  {siteMonetizeOptions.map((mode) => (
                    <option value={mode} key={mode}>
                      {mode === 'all' ? '전체' : normalizeDisplayValue(mode, '미정')}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="secondary-action"
                type="button"
                onClick={() => {
                  setSiteFilter('all');
                  setSiteQuery('');
                  setSiteLanguageFilter('all');
                  setSiteMonetizeFilter('all');
                }}
              >
                초기화
              </button>
            </div>

            <div className="site-workbench">
              <div>
                <div className="table-meta">
                  <strong>{filteredSites.length}개 도메인 표시</strong>
                  <span>
                    {filteredSites.length === 0
                      ? '조건에 맞는 도메인이 없습니다'
                      : `${(normalizedSitePage - 1) * SITE_PAGE_SIZE + 1}-${Math.min(
                          normalizedSitePage * SITE_PAGE_SIZE,
                          filteredSites.length,
                        )} / ${filteredSites.length}`}
                  </span>
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
                  {pagedSites.map((site) => (
                    <button
                      className={`ops-row site-click-row risk-${site.riskLevel || 'unknown'} ${
                        selectedSite?.siteKey === site.siteKey ? 'selected' : ''
                      }`}
                      role="row"
                      key={site.siteKey}
                      type="button"
                      onClick={() => setSelectedSiteKey(site.siteKey)}
                    >
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
                        <small>{normalizeDisplayValue(site.monetizeMode, '수익화 미정')}</small>
                      </div>
                      <strong>{getSiteNextAction(site)}</strong>
                      <small>{site.memo || '운영 메모 없음'}</small>
                    </button>
                  ))}
                </div>
                <div className="pagination-bar" aria-label="사이트 목록 페이지">
                  <button
                    className="secondary-action"
                    type="button"
                    disabled={normalizedSitePage === 1}
                    onClick={() => setSitePage((current) => Math.max(1, current - 1))}
                  >
                    이전
                  </button>
                  {Array.from({ length: sitePageCount }, (_, index) => index + 1)
                    .filter((page) => page === 1 || page === sitePageCount || Math.abs(page - normalizedSitePage) <= 2)
                    .map((page, index, pages) => (
                      <React.Fragment key={page}>
                        {index > 0 && page - pages[index - 1] > 1 ? <span className="page-ellipsis">…</span> : null}
                        <button
                          className={`page-button ${normalizedSitePage === page ? 'active' : ''}`}
                          type="button"
                          onClick={() => setSitePage(page)}
                        >
                          {page}
                        </button>
                      </React.Fragment>
                    ))}
                  <button
                    className="secondary-action"
                    type="button"
                    disabled={normalizedSitePage === sitePageCount}
                    onClick={() => setSitePage((current) => Math.min(sitePageCount, current + 1))}
                  >
                    다음
                  </button>
                </div>
              </div>

              {selectedSite ? (
                <aside className="site-detail-panel" aria-label="선택 도메인 상세">
                  <div>
                    <p className="eyebrow">Domain detail</p>
                    <h3>{selectedSite.domain}</h3>
                    <small>{selectedSite.siteKey} · {selectedSite.language || '-'} · {selectedSite.topic || '-'}</small>
                  </div>
                  <div className="detail-pill-row">
                    <StatusPill value={selectedSite.portfolioStatus} />
                    <StatusPill value={selectedSite.approvalStatus} />
                    <StatusPill value={selectedSite.riskLevel} />
                  </div>
                  <dl className="detail-list">
                    <div>
                      <dt>WP Base</dt>
                      <dd>{selectedSite.wpBaseUrl || '미등록'}</dd>
                    </div>
                    <div>
                      <dt>WP 세팅</dt>
                      <dd>{selectedSiteSetup?.status || selectedSite.setupStatus || '큐 없음'}</dd>
                    </div>
                    <div>
                      <dt>콘텐츠 큐</dt>
                      <dd>{selectedSiteQueue.length}건</dd>
                    </div>
                    <div>
                      <dt>사이트맵</dt>
                      <dd>{selectedSiteSitemaps.length}건</dd>
                    </div>
                    <div>
                      <dt>수익화</dt>
                      <dd>{normalizeDisplayValue(selectedSite.monetizeMode, '미정')} / {selectedSite.adsense || '미확인'}</dd>
                    </div>
                    <div>
                      <dt>에러</dt>
                      <dd>{selectedSiteErrors.length}건</dd>
                    </div>
                  </dl>
                  <div className="detail-next-action">
                    <span>다음 액션</span>
                    <strong>{getSiteNextAction(selectedSite)}</strong>
                    <p>{selectedSite.memo || '운영 메모 없음'}</p>
                  </div>
                  <div className="detail-actions">
                    <a href="#errors">에러 센터</a>
                    <a href="#seo">SEO 현황</a>
                    <a href="#sitemaps">사이트맵</a>
                  </div>
                </aside>
              ) : null}
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

          <article className="panel wide-panel" id="portal-admin">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">wordfriends customer portal</p>
                <h2>Wordfriends 공유 프로그램 산정</h2>
              </div>
              <span className="status-pill planned">MVP 2단계</span>
            </div>
            <div className="ops-table portal-program-table" role="table">
              <div className="ops-row ops-head" role="row">
                <span>프로그램</span>
                <span>Wordfriends 공개 범위</span>
                <span>SiteOps 내부 관리</span>
                <span>상태/수치</span>
              </div>
              {portalPrograms.map((program) => (
                <div className="ops-row" role="row" key={program.name}>
                  <div>
                    <strong>{program.name}</strong>
                    <small>{program.status}</small>
                  </div>
                  <span>{program.wordfriends}</span>
                  <span>{program.siteops}</span>
                  <strong>{program.metric}</strong>
                </div>
              ))}
            </div>
            <div className="portal-rule-grid">
              <article className="policy-box">
                <CheckCircle2 size={18} />
                <div>
                  <strong>고객 화면 위치</strong>
                  <p>회원가입, 로그인, 전자계약, 약관, 개인정보처리방침, 문의, AI 상담은 wordfriends.co.kr에 둡니다.</p>
                </div>
              </article>
              <article className="policy-box">
                <CheckCircle2 size={18} />
                <div>
                  <strong>관리 화면 위치</strong>
                  <p>SiteOps에는 고객 상태, 계약 상태, 문의 검토, 공지, 정산, 운영 리스크 판단만 남깁니다.</p>
                </div>
              </article>
              {portalGuardrails.map((rule) => (
                <article className="policy-box warning-policy" key={rule}>
                  <AlertTriangle size={18} />
                  <div>
                    <strong>공개 차단 기준</strong>
                    <p>{rule}</p>
                  </div>
                </article>
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

          <article className="panel wide-panel" id="realtime">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">wordfriends realtime</p>
                <h2>실시간 접속·가입·질문 관제</h2>
              </div>
              <span className="status-pill planned">30초 자동 갱신</span>
            </div>
            <div className="realtime-card-grid">
              {realtimeCards.map((card) => (
                <article className="realtime-card" key={card.label}>
                  <span>{card.label}</span>
                  <strong>{card.value}</strong>
                  <small>{card.detail}</small>
                </article>
              ))}
            </div>
            <div className="ops-table realtime-progress-table" role="table">
              <div className="ops-row ops-head" role="row">
                <span>진행 구간</span>
                <span>오늘 상태</span>
                <span>상태</span>
                <span>관리 메모</span>
              </div>
              {realtimeProgressRows.map((row) => (
                <div className="ops-row" role="row" key={row.stage}>
                  <strong>{row.stage}</strong>
                  <span>{row.current}</span>
                  <StatusPill value={row.status} />
                  <span>{row.note}</span>
                </div>
              ))}
            </div>
            <div className="realtime-ingest-guide">
              <article>
                <strong>Wordfriends 이벤트 수집 API</strong>
                <p>wordfriends.co.kr에서 접속, 가입, 계약, 질문 이벤트를 SiteOps로 전송하면 이 화면에 30초 단위로 반영됩니다.</p>
              </article>
              <code>POST /api/wordfriends/events</code>
              <code>POST /api/wordfriends/questions</code>
              <span>헤더: X-SiteOps-Event-Token · 서버 환경변수: SITEOPS_EVENT_TOKEN</span>
            </div>
            <div className="ops-table derived-question-table" role="table">
              <div className="ops-row ops-head" role="row">
                <span>고객</span>
                <span>분류</span>
                <span>질문</span>
                <span>상태</span>
                <span>갱신</span>
                <span>처리</span>
              </div>
              {portalRealtime.questions.slice(0, 8).map((question) => {
                const expanded = expandedQuestionId === question.id;
                const replyDraft = getQuestionReplyDraft(question);
                const replyState = questionReplySaveState[question.id] || { status: 'idle', message: '' };
                const quickAction = getQuestionQuickAction(question);

                return (
                  <div className="derived-question-item" key={question.id}>
                    <div
                      className="ops-row derived-question-row"
                      role="row"
                      tabIndex={0}
                      aria-expanded={expanded}
                      onClick={() => setExpandedQuestionId(expanded ? null : question.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setExpandedQuestionId(expanded ? null : question.id);
                        }
                      }}
                    >
                      <strong>{question.customerCode}</strong>
                      <span>{question.category}</span>
                      <span>
                        {question.question}
                        {(question.responseMessage || question.responseStatus === 'draft') ? (
                          <em className="reply-draft-chip">초안 있음</em>
                        ) : null}
                        {question.responseStatus === 'sent' ? (
                          <em className="reply-sent-chip">답변 기록됨</em>
                        ) : null}
                      </span>
                      <StatusPill value={question.status} />
                      <span>{formatSeoulDateTime(question.updatedAt)}</span>
                      <span className="derived-question-action-cell">
                        <button
                          className={`question-quick-action ${quickAction.tone}`}
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setExpandedQuestionId(question.id);
                          }}
                        >
                          {quickAction.label}
                        </button>
                      </span>
                    </div>
                    {expanded ? (
                      <div className="derived-question-detail">
                        <div>
                          <strong>문의 원문</strong>
                          <p>{question.question}</p>
                        </div>
                        <div>
                          <strong>처리 메모</strong>
                          <p>{question.answerSummary || '담당자 검토 대기'}</p>
                        </div>
                        {(question.responseMessage || question.responseNote || question.responseError) ? (
                          <div className="saved-reply-preview">
                            <strong>저장된 답변</strong>
                            {question.responseMessage ? <p>{question.responseMessage}</p> : null}
                            {question.responseNote ? <p>내부 메모: {question.responseNote}</p> : null}
                            {question.responseError ? <p>발송 오류: {question.responseError}</p> : null}
                          </div>
                        ) : null}
                        <form
                          className="question-reply-box"
                          onSubmit={(event) => {
                            event.preventDefault();
                            submitQuestionReply(question, replyDraft.responseStatus || 'draft');
                          }}
                        >
                          <div className="reply-grid">
                            <label>
                              연락 채널
                              <select
                                value={replyDraft.responseChannel}
                                onChange={(event) => updateQuestionReplyDraft(question, 'responseChannel', event.target.value)}
                              >
                                <option value="manual">수동 연락</option>
                                <option value="email">이메일</option>
                                <option value="sms">문자</option>
                                <option value="kakao">카카오 알림톡</option>
                                <option value="telegram">텔레그램</option>
                              </select>
                            </label>
                            <label>
                              처리 상태
                              <select
                                value={replyDraft.status}
                                onChange={(event) => updateQuestionReplyDraft(question, 'status', event.target.value)}
                              >
                                <option value="human_review">사람 검토</option>
                                <option value="open">접수</option>
                                <option value="answered">답변 완료</option>
                                <option value="closed">종료</option>
                                <option value="blocked">차단</option>
                              </select>
                            </label>
                          </div>
                          <label>
                            답변 내용
                            <textarea
                              rows={4}
                              value={replyDraft.responseMessage}
                              onChange={(event) => updateQuestionReplyDraft(question, 'responseMessage', event.target.value)}
                              placeholder="고객에게 안내할 답변을 작성하세요. 실제 외부 발송은 다음 단계에서 채널 API와 연결합니다."
                            />
                          </label>
                          <label>
                            내부 메모
                            <input
                              type="text"
                              value={replyDraft.responseNote}
                              onChange={(event) => updateQuestionReplyDraft(question, 'responseNote', event.target.value)}
                              placeholder="예: 정산 자료 확인 후 이메일 안내 예정"
                            />
                          </label>
                          <div className="reply-actions">
                            <button className="secondary-action" type="submit">
                              답변 초안 저장
                            </button>
                            <button
                              className="primary-action"
                              type="button"
                              onClick={() => submitQuestionReply(question, 'sent')}
                            >
                              처리 완료 기록
                            </button>
                            <small>외부 발송 전까지는 기록만 저장됩니다.</small>
                          </div>
                          {replyState.message ? (
                            <p className={`save-state ${replyState.status}`}>{replyState.message}</p>
                          ) : null}
                        </form>
                        <div className="derived-question-meta">
                          <span>상태: {question.status}</span>
                          <span>분류: {question.category}</span>
                          <span>응답: {question.responseChannel || 'manual'} / {question.responseStatus || 'not_started'}</span>
                          <span>갱신: {formatSeoulDateTime(question.updatedAt)}</span>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
            {portalRealtime.questions.length === 0 ? (
              <div className="empty-state">
                아직 수집된 파생 질문이 없습니다. Wordfriends 문의/AI 상담 이벤트가 연결되면 이곳에 실시간으로 표시됩니다.
              </div>
            ) : null}
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

          <article className="panel wide-panel" id="keywords">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">keyword_map</p>
                <h2>키워드 관리 설계</h2>
              </div>
              <span className="status-pill planned">다음 구현</span>
            </div>
            <div className="delivery-grid">
              <article className="delivery-card">
                <strong>{dashboard.contentQueue.length}</strong>
                <span>콘텐츠 큐 키워드</span>
                <p>중복 키워드, 사이트별 배정, 카테고리 매핑, 발행 상태를 한 화면에서 관리합니다.</p>
              </article>
              <article className="delivery-card">
                <strong>{validationFailedContent.length}</strong>
                <span>검증 실패 콘텐츠</span>
                <p>FAILED_VALIDATION, 금지 키워드, YMYL 경고를 에러 센터와 연결합니다.</p>
              </article>
              <article className="delivery-card">
                <strong>금지어</strong>
                <span>수익/승인 보장 표현 차단</span>
                <p>수익 보장, 애드센스 승인 보장, 과도한 서버/IP/VPN 안전 표현을 기본 차단합니다.</p>
              </article>
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
              <div>
                <strong>{filteredInventory.length}</strong>
                <span>개 도메인 표시 중</span>
              </div>
              <span>
                {filteredInventory.length === 0
                  ? '조건에 맞는 도메인이 없습니다'
                  : `${(normalizedInventoryPage - 1) * INVENTORY_PAGE_SIZE + 1}-${Math.min(
                      normalizedInventoryPage * INVENTORY_PAGE_SIZE,
                      filteredInventory.length,
                    )} / ${filteredInventory.length}`}
              </span>
            </div>
            <div className="inventory-grid">
              {pagedInventory.map((row) => (
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
            <div className="pagination-bar" aria-label="도메인 검수 페이지">
              <button
                className="secondary-action"
                type="button"
                disabled={normalizedInventoryPage === 1}
                onClick={() => setInventoryPage((current) => Math.max(1, current - 1))}
              >
                이전
              </button>
              {Array.from({ length: inventoryPageCount }, (_, index) => index + 1)
                .filter(
                  (page) =>
                    page === 1 || page === inventoryPageCount || Math.abs(page - normalizedInventoryPage) <= 2,
                )
                .map((page, index, pages) => (
                  <React.Fragment key={page}>
                    {index > 0 && page - pages[index - 1] > 1 ? <span className="page-ellipsis">…</span> : null}
                    <button
                      className={`page-button ${normalizedInventoryPage === page ? 'active' : ''}`}
                      type="button"
                      onClick={() => setInventoryPage(page)}
                    >
                      {page}
                    </button>
                  </React.Fragment>
                ))}
              <button
                className="secondary-action"
                type="button"
                disabled={normalizedInventoryPage === inventoryPageCount}
                onClick={() => setInventoryPage((current) => Math.min(inventoryPageCount, current + 1))}
              >
                다음
              </button>
            </div>
            {filteredInventory.length === 0 ? (
              <div className="empty-state">
                조건에 맞는 도메인이 없습니다. 필터를 초기화하거나 검색어를 줄여보세요.
              </div>
            ) : null}
          </article>

          <article className="panel wide-panel" id="domain-discovery">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">domain discovery engine</p>
                <h2>신규 도메인 발굴 프로그램</h2>
              </div>
              <span className="status-pill planned">키워드 기반</span>
            </div>
            <div className="discovery-input-grid">
              {discoveryInputs.map((item) => (
                <article className="discovery-input-card" key={item.label}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </article>
              ))}
            </div>
            <form className="candidate-form-grid" aria-label="도메인 후보 입력">
              <label>
                <span>카테고리</span>
                <input
                  type="text"
                  value={discoveryForm.category}
                  onChange={(event) => setDiscoveryForm((current) => ({ ...current, category: event.target.value }))}
                  placeholder="health, finance, pet"
                />
              </label>
              <label>
                <span>키워드</span>
                <input
                  type="text"
                  value={discoveryForm.keywords}
                  onChange={(event) => setDiscoveryForm((current) => ({ ...current, keywords: event.target.value }))}
                  placeholder="bio, care, journal"
                />
              </label>
              <label>
                <span>TLD</span>
                <input
                  type="text"
                  value={discoveryForm.tlds}
                  onChange={(event) => setDiscoveryForm((current) => ({ ...current, tlds: event.target.value }))}
                  placeholder=".kr, .co.kr, .com"
                />
              </label>
              <label>
                <span>가격 정책</span>
                <select
                  value={discoveryForm.budgetPolicy}
                  onChange={(event) => setDiscoveryForm((current) => ({ ...current, budgetPolicy: event.target.value }))}
                >
                  <option value="general_only">일반 등록가만</option>
                  <option value="premium_review">프리미엄 수동 검토</option>
                  <option value="premium_allowed">프리미엄 허용</option>
                </select>
              </label>
              <button
                className="secondary-action"
                type="button"
                onClick={() => setDiscoveryForm(defaultDiscoveryForm)}
              >
                기본값
              </button>
              <button
                className="primary-action"
                type="button"
                onClick={saveGeneratedCandidates}
                disabled={candidateSaveState.status === 'saving'}
              >
                {candidateSaveState.status === 'saving' ? '저장 중' : '후보 큐 저장'}
              </button>
            </form>
            {candidateSaveState.message ? (
              <div className={`form-status ${candidateSaveState.status}`}>
                {candidateSaveState.message}
              </div>
            ) : null}
            <div className="table-meta candidate-result-line">
              <strong>{generatedDomainCandidates.length}개 후보 도메인 생성</strong>
              <span>등록 가능 확인 전 검수 대기</span>
            </div>
            <div className="ops-table candidate-queue-table" role="table">
              <div className="ops-row ops-head" role="row">
                <span>후보 도메인</span>
                <span>유형</span>
                <span>TLD</span>
                <span>확인 채널</span>
                <span>상태</span>
              </div>
              {generatedDomainCandidates.map((candidate) => (
                <div className="ops-row" role="row" key={candidate.domain}>
                  <strong>{candidate.domain}</strong>
                  <span>{candidate.style}</span>
                  <span>{candidate.tld}</span>
                  <span>{candidate.channel}</span>
                  <StatusPill value={candidate.status} />
                </div>
              ))}
            </div>
            <div className="table-meta candidate-result-line">
              <strong>{savedDomainCandidates.length}개 저장된 후보</strong>
              <span>{queuedDomainCandidates.length}개 구매 전 검수 대기</span>
            </div>
            <div className="ops-table saved-candidate-table" role="table">
              <div className="ops-row ops-head" role="row">
                <span>저장 후보</span>
                <span>카테고리</span>
                <span>등록 확인</span>
                <span>검수</span>
                <span>구매</span>
                <span>갱신</span>
              </div>
              {savedDomainCandidates.slice(0, 12).map((candidate) => (
                <div className="ops-row" role="row" key={candidate.id || candidate.domain}>
                  <strong>{candidate.domain}</strong>
                  <span>{candidate.category || '분류 대기'}</span>
                  <StatusPill value={candidate.availabilityStatus} />
                  <StatusPill value={candidate.auditStatus} />
                  <StatusPill value={candidate.purchaseStatus} />
                  <span>{candidate.updatedAt || '방금 전'}</span>
                </div>
              ))}
            </div>
            {savedDomainCandidates.length === 0 ? (
              <div className="empty-state">
                저장된 도메인 후보가 없습니다. 후보를 생성한 뒤 구매 전 검수 큐에 저장하세요.
              </div>
            ) : null}
            <div className="discovery-strategy-grid">
              {discoveryStrategies.map((strategy) => (
                <article className="discovery-strategy-card" key={strategy.name}>
                  <div>
                    <strong>{strategy.name}</strong>
                    <span>{strategy.pattern}</span>
                  </div>
                  <div className="domain-chip-list">
                    {strategy.examples.map((example) => (
                      <code key={example}>{example}</code>
                    ))}
                  </div>
                  <p>{strategy.note}</p>
                </article>
              ))}
            </div>
            <div className="ops-table discovery-pipeline-table" role="table">
              <div className="ops-row ops-head" role="row">
                <span>단계</span>
                <span>자동화 방식</span>
                <span>결과</span>
              </div>
              {discoveryPipeline.map((row) => (
                <div className="ops-row" role="row" key={row.step}>
                  <strong>{row.step}</strong>
                  <span>{row.automation}</span>
                  <span>{row.output}</span>
                </div>
              ))}
            </div>
            <div className="portal-rule-grid discovery-rules">
              <article className="policy-box">
                <CheckCircle2 size={18} />
                <div>
                  <strong>경매는 보조</strong>
                  <p>경매/만료 도메인은 가격 경쟁과 리스크가 크므로 보조 채널로 두고, 신규 도메인 발굴을 기본 전략으로 둡니다.</p>
                </div>
              </article>
              <article className="policy-box">
                <CheckCircle2 size={18} />
                <div>
                  <strong>우리 무기 활용</strong>
                  <p>서버, WP 세팅, 사이트맵, Search Console, 발행 파이프라인으로 신규 도메인을 60/90일 단위로 키웁니다.</p>
                </div>
              </article>
              <article className="policy-box warning-policy">
                <AlertTriangle size={18} />
                <div>
                  <strong>자동 구매 금지</strong>
                  <p>발굴 엔진은 후보와 점수만 만들고, 실제 구매는 가격/상표/니치 검수 후 수동 승인합니다.</p>
                </div>
              </article>
              <article className="policy-box warning-policy">
                <AlertTriangle size={18} />
                <div>
                  <strong>프리미엄 주의</strong>
                  <p>프리미엄 도메인, 상표 유사 이름, 과도하게 비싼 이름은 자동 제외 또는 별도 승인 대상으로 둡니다.</p>
                </div>
              </article>
            </div>
          </article>

          <article className="panel wide-panel" id="domain-audit-auto">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">domain audit automation</p>
                <h2>도메인 검수 자동화 프로그램</h2>
              </div>
              <span className="status-pill planned">구매 전/보유 도메인 공통</span>
            </div>
            <div className="audit-source-grid">
              {auditAutomationSources.map((source) => (
                <article className="audit-source-card" key={source.label}>
                  <div>
                    <strong>{source.count}</strong>
                    <span>{source.label}</span>
                  </div>
                  <code>{source.command}</code>
                  <p>{source.note}</p>
                </article>
              ))}
            </div>
            <div className="ops-table audit-automation-table" role="table">
              <div className="ops-row ops-head" role="row">
                <span>단계</span>
                <span>담당</span>
                <span>결과물</span>
                <span>자동화 방식</span>
              </div>
              {auditAutomationSteps.map((row) => (
                <div className="ops-row" role="row" key={row.step}>
                  <strong>{row.step}</strong>
                  <StatusPill value={row.owner} />
                  <span>{row.output}</span>
                  <span>{row.automation}</span>
                </div>
              ))}
            </div>
            <div className="ops-table external-channel-table" role="table">
              <div className="ops-row ops-head" role="row">
                <span>채널</span>
                <span>역할</span>
                <span>비용 원칙</span>
                <span>검수 용도</span>
              </div>
              {externalAuditChannels.map((channel) => (
                <div className="ops-row" role="row" key={channel.name}>
                  <strong>{channel.name}</strong>
                  <span>{channel.role}</span>
                  <StatusPill value={channel.costPolicy} />
                  <span>{channel.useCase}</span>
                </div>
              ))}
            </div>
            <div className="portal-rule-grid audit-automation-rules">
              <article className="policy-box">
                <CheckCircle2 size={18} />
                <div>
                  <strong>구매 전 검수</strong>
                  <p>앞으로 사는 도메인은 먼저 후보 큐에 넣고, 점수/스팸/상표/YMYL/니치 적합도를 본 뒤 구매 여부를 정합니다.</p>
                </div>
              </article>
              <article className="policy-box">
                <CheckCircle2 size={18} />
                <div>
                  <strong>기존 도메인 재검수</strong>
                  <p>이미 산 도메인도 같은 규칙으로 다시 돌려서 회생, 장기 관찰, 격리, 최종 폐기 후보로 나눕니다.</p>
                </div>
              </article>
              <article className="policy-box warning-policy">
                <AlertTriangle size={18} />
                <div>
                  <strong>자동 구매 금지</strong>
                  <p>자동화는 점수와 위험 신호를 만들 뿐, 구매와 폐기 결정은 BOSS 수동 승인 후 진행합니다.</p>
                </div>
              </article>
              <article className="policy-box warning-policy">
                <AlertTriangle size={18} />
                <div>
                  <strong>고객 노출 금지</strong>
                  <p>검수 점수, 오염도, 백링크 판단, 회생 계획은 내부 운영 정보이며 Wordfriends 고객 화면에 공유하지 않습니다.</p>
                </div>
              </article>
            </div>
          </article>

          <article className="panel wide-panel" id="domain-reuse">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">domain recycle program</p>
                <h2>도메인 재활용 운영 큐</h2>
              </div>
              <span className="status-pill planned">내부 전용</span>
            </div>
            <div className="reuse-summary">
              <div>
                <strong>{reusableDomains.length}</strong>
                <span>재활용 후보</span>
              </div>
              <div>
                <strong>{instantReuseDomains.length}</strong>
                <span>즉시 운영 가능</span>
              </div>
              <div>
                <strong>{recoveryReuseDomains.length}</strong>
                <span>복구 후 사용</span>
              </div>
              <div>
                <strong>{longTermRecoveryDomains.length}</strong>
                <span>장기 회생 관찰</span>
              </div>
              <div>
                <strong>{nicheLockedDomains.length}</strong>
                <span>니치 유지 필요</span>
              </div>
              <div>
                <strong>{finalDiscardDomains.length}</strong>
                <span>최종 폐기 후보</span>
              </div>
            </div>
            <div className="delivery-grid reuse-playbook-grid">
              {reusePlaybook.map((item) => (
                <article className="delivery-card" key={item.title}>
                  <strong>{item.metric}</strong>
                  <span>{item.title}</span>
                  <p>{item.body}</p>
                </article>
              ))}
            </div>
            <div className="ops-table reuse-table" role="table">
              <div className="ops-row ops-head" role="row">
                <span>도메인</span>
                <span>재활용 단계</span>
                <span>점수</span>
                <span>다음 액션</span>
                <span>주의</span>
              </div>
              {reuseCandidates.map((row) => (
                <div className="ops-row" role="row" key={`${row.domain}-${row.reuseStage}`}>
                  <div>
                    <strong>{row.domain}</strong>
                    <small>{row.acquisitionType} · {row.languagePriority} · {row.categoryFit || '분류 대기'}</small>
                  </div>
                  <StatusPill value={row.reuseStage} />
                  <div className="score-stack">
                    <strong>{row.overallScore ?? '-'}</strong>
                    <small>Spam {row.spamScore ?? '-'} · Index {row.indexScore ?? '-'}</small>
                  </div>
                  <span>{row.action}</span>
                  <span>
                    {row.reuseStage === '폐기 후보'
                      ? '갱신 중단 전 최종 확인'
                      : row.reuseStage === '격리 후 재판정'
                        ? '고객 노출 금지, 내부 관찰'
                      : row.ymylRiskLevel === 'high'
                        ? 'YMYL 검수 후 발행'
                        : '수익/승인 보장 표현 금지'}
                  </span>
                </div>
              ))}
            </div>
            <div className="portal-rule-grid reuse-rules">
              <article className="policy-box">
                <CheckCircle2 size={18} />
                <div>
                  <strong>회생 우선 원칙</strong>
                  <p>서버와 발행 파이프라인이 있으므로 폐기는 최후로 미루고, 낮은 강도라도 살릴 수 있는 도메인은 관찰 큐에 둡니다.</p>
                </div>
              </article>
              <article className="policy-box">
                <CheckCircle2 size={18} />
                <div>
                  <strong>복구 작업 순서</strong>
                  <p>Search Console 확인, 사이트맵 제출, Ahrefs/백링크 검토, 필요 시 disavow, 니치 일치 콘텐츠를 저강도부터 발행합니다.</p>
                </div>
              </article>
              <article className="policy-box warning-policy">
                <AlertTriangle size={18} />
                <div>
                  <strong>고객 공개 금지</strong>
                  <p>재활용 판단, 오염도, 백링크 메모, 격리 사유는 Wordfriends 고객 화면에 노출하지 않습니다.</p>
                </div>
              </article>
              <article className="policy-box warning-policy">
                <AlertTriangle size={18} />
                <div>
                  <strong>자동화 잠금</strong>
                  <p>격리 후 재판정과 폐기 후보는 수익화 연결과 고객 배정을 막고, 내부 관찰/복구 작업만 허용합니다.</p>
                </div>
              </article>
            </div>
          </article>

          <article className="panel wide-panel" id="domain-expiry">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">registrar / dns</p>
                <h2>도메인 만료와 DNS 관리</h2>
              </div>
              <span className="status-pill planned">DB 필드 추가 예정</span>
            </div>
            <div className="delivery-grid">
              <article className="delivery-card">
                <strong>만료일</strong>
                <span>Namecheap 등 등록기관 기준</span>
                <p>도메인 갱신 누락은 운영 중단으로 이어지므로 만료 60/30/7일 알림을 기본값으로 둡니다.</p>
              </article>
              <article className="delivery-card">
                <strong>Cloudflare</strong>
                <span>Active / Pending / DNS 오류</span>
                <p>네임서버 전파, 주황 구름 상태, SSL 상태를 도메인별로 기록합니다.</p>
              </article>
              <article className="delivery-card">
                <strong>갱신 판단</strong>
                <span>A/B/C/D/Reject 등급 연동</span>
                <p>고위험 또는 회생 가치 낮은 도메인은 자동 갱신하지 않고 수동 확인 대상으로 둡니다.</p>
              </article>
            </div>
            <div className="renewal-summary-grid">
              <div>
                <strong>{renewalDecisionRows.length}</strong>
                <span>renewal decisions</span>
              </div>
              <div>
                <strong>{renewalReadyCount}</strong>
                <span>renew unless issue</span>
              </div>
              <div>
                <strong>{renewalReviewCount}</strong>
                <span>manual review / hold</span>
              </div>
              <div>
                <strong>{renewalDoNotRenewCount}</strong>
                <span>do not renew candidates</span>
              </div>
            </div>
            <div className="renewal-controls" aria-label="Domain renewal filters">
              <label>
                <span>Decision</span>
                <select value={renewalDecisionFilter} onChange={(event) => setRenewalDecisionFilter(event.target.value)}>
                  {renewalDecisionOptions.map((decision) => (
                    <option value={decision} key={decision}>
                      {decision === 'all' ? 'all decisions' : decision}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Sort</span>
                <select value={renewalSort} onChange={(event) => setRenewalSort(event.target.value)}>
                  <option value="risk_first">risk first</option>
                  <option value="decision_asc">decision order</option>
                  <option value="automation_blocked">automation blocked first</option>
                  <option value="domain_asc">domain A-Z</option>
                </select>
              </label>
              <button
                className="secondary-action"
                type="button"
                onClick={() => {
                  setRenewalDecisionFilter('all');
                  setRenewalSort('risk_first');
                }}
              >
                Reset
              </button>
              <span>{visibleRenewalRows.length} / {renewalDecisionRows.length} domains</span>
            </div>
            <div className="ops-table renewal-table" role="table">
              <div className="ops-row ops-head" role="row">
                <span>Domain</span>
                <span>Decision</span>
                <span>Reason</span>
                <span>Automation</span>
                <span>Next action</span>
              </div>
              {visibleRenewalRows.slice(0, 30).map((row) => (
                <div className="ops-row" role="row" key={row.domain}>
                  <strong>{row.domain}</strong>
                  <StatusPill value={row.renewalDecision} />
                  <span>{row.decisionReason}</span>
                  <span>{row.automationAllowed ? 'allowed' : 'blocked'}</span>
                  <span>{row.nextAction}</span>
                </div>
              ))}
            </div>
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
                <strong>{googleSubmittedSitemaps.length}</strong>
                <span>Google 제출 완료</span>
              </div>
              <div>
                <strong>{googleReadySitemaps.length}</strong>
                <span>Google 제출 대기</span>
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
            <div className="sitemap-controls" aria-label="사이트맵 등록 필터">
              <label className="sitemap-search">
                <Search size={18} />
                <input
                  type="search"
                  value={sitemapQuery}
                  onChange={(event) => setSitemapQuery(event.target.value)}
                  placeholder="도메인, 사이트맵, 상태, 메모 검색"
                />
              </label>
              <label>
                <span>검색엔진</span>
                <select value={sitemapEngineFilter} onChange={(event) => setSitemapEngineFilter(event.target.value)}>
                  {sitemapEngineOptions.map((engine) => (
                    <option value={engine} key={engine}>
                      {engine === 'all' ? '전체' : engine}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>상태</span>
                <select value={sitemapStatusFilter} onChange={(event) => setSitemapStatusFilter(event.target.value)}>
                  {sitemapStatusOptions.map((status) => (
                    <option value={status} key={status}>
                      {status === 'all' ? '전체' : status}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="secondary-action"
                type="button"
                onClick={() => {
                  setSitemapQuery('');
                  setSitemapEngineFilter('all');
                  setSitemapStatusFilter('all');
                }}
              >
                초기화
              </button>
            </div>
            <div className="table-meta sitemap-result-line">
              <strong>{filteredSitemapSubmissions.length}개 사이트맵 표시</strong>
              <span>
                {filteredSitemapSubmissions.length === 0
                  ? '조건에 맞는 사이트맵 항목이 없습니다'
                  : `${(normalizedSitemapPage - 1) * SITEMAP_PAGE_SIZE + 1}-${Math.min(
                      normalizedSitemapPage * SITEMAP_PAGE_SIZE,
                      filteredSitemapSubmissions.length,
                    )} / ${filteredSitemapSubmissions.length}`}
              </span>
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
              {pagedSitemapSubmissions.map((row) => (
                <div className="ops-row" role="row" key={`${row.domain}-${row.searchEngine}`}>
                  <div>
                    <strong>{row.domain}</strong>
                    <small>{row.propertyUrl || row.siteKey || 'site_key 미지정'}</small>
                  </div>
                  <StatusPill value={row.searchEngine} />
                  <a href={row.sitemapUrl} target="_blank" rel="noreferrer">{row.sitemapUrl}</a>
                  <span>{row.submissionMode}</span>
                  <StatusPill value={row.status} />
                  <small>{summarizeSitemapMessage(row)}</small>
                </div>
              ))}
            </div>
            <div className="pagination-bar" aria-label="사이트맵 등록 페이지">
              <button
                className="secondary-action"
                type="button"
                disabled={normalizedSitemapPage === 1}
                onClick={() => setSitemapPage((current) => Math.max(1, current - 1))}
              >
                이전
              </button>
              {Array.from({ length: sitemapPageCount }, (_, index) => index + 1)
                .filter(
                  (page) => page === 1 || page === sitemapPageCount || Math.abs(page - normalizedSitemapPage) <= 2,
                )
                .map((page, index, pages) => (
                  <React.Fragment key={page}>
                    {index > 0 && page - pages[index - 1] > 1 ? <span className="page-ellipsis">…</span> : null}
                    <button
                      className={`page-button ${normalizedSitemapPage === page ? 'active' : ''}`}
                      type="button"
                      onClick={() => setSitemapPage(page)}
                    >
                      {page}
                    </button>
                  </React.Fragment>
                ))}
              <button
                className="secondary-action"
                type="button"
                disabled={normalizedSitemapPage === sitemapPageCount}
                onClick={() => setSitemapPage((current) => Math.min(sitemapPageCount, current + 1))}
              >
                다음
              </button>
            </div>
            {dashboard.sitemapSubmissions.length === 0 ? (
              <div className="empty-state">
                아직 사이트맵 등록 큐가 없습니다. 서버에서 `npm run sync:sitemaps`를 실행하면 운영 후보 사이트 기준으로
                Google/Naver 관리 항목이 생성됩니다.
              </div>
            ) : null}
            {dashboard.sitemapSubmissions.length > 0 && filteredSitemapSubmissions.length === 0 ? (
              <div className="empty-state">
                조건에 맞는 사이트맵 항목이 없습니다. 필터를 초기화하거나 검색어를 줄여보세요.
              </div>
            ) : null}
          </article>

          <article className="panel wide-panel" id="seo">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">seo / indexing</p>
                <h2>SEO와 색인 현황</h2>
              </div>
              <span className="status-pill planned">Search Console 확장 예정</span>
            </div>
            <div className="delivery-grid">
              <article className="delivery-card">
                <strong>{googleSubmittedSitemaps.length}</strong>
                <span>Google 사이트맵 제출 완료</span>
                <p>Search Console URL 속성 확인이 끝난 도메인부터 안전하게 제출합니다.</p>
              </article>
              <article className="delivery-card">
                <strong>{failedSitemapRows.length}</strong>
                <span>색인/권한 확인 필요</span>
                <p>권한 없음, API 비활성, 토큰 만료, 사이트맵 접근 실패를 짧은 운영 문구로 표시합니다.</p>
              </article>
              <article className="delivery-card">
                <strong>Rank Math</strong>
                <span>기본 SEO 플러그인</span>
                <p>인증 메타, 사이트맵, robots, 제목/메타 상태를 나중에 사이트별 스냅샷으로 저장합니다.</p>
              </article>
            </div>
          </article>

          <article className="panel wide-panel" id="monetization">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">adsense / monetization</p>
                <h2>수익화 현황</h2>
              </div>
              <span className="status-pill planned">보장 표현 금지</span>
            </div>
            <div className="delivery-grid">
              <article className="delivery-card">
                <strong>{adsenseReadySites.length}</strong>
                <span>AdSense 승인/준비 사이트</span>
                <p>승인 상태는 운영 참고용입니다. 고객 화면에는 수익이나 승인 보장 문구를 표시하지 않습니다.</p>
              </article>
              <article className="delivery-card">
                <strong>{dashboard.sites.filter((site) => site.monetizeMode).length}</strong>
                <span>수익화 방식 지정</span>
                <p>adsense, agency, affiliate, CPA, business 등 방식을 구분해 운영 리스크를 관리합니다.</p>
              </article>
              <article className="delivery-card">
                <strong>정산 연결</strong>
                <span>고객 계정 기준</span>
                <p>고객 애드센스 수익은 고객 계정 보고서 또는 고객 제공 자료를 기준으로 정산합니다.</p>
              </article>
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
            <div className="revenue-policy-grid">
              <article className="policy-ledger-card">
                <div className="panel-heading compact-heading">
                  <div>
                    <p className="eyebrow">pricing policy</p>
                    <h3>상품/세팅비 기준</h3>
                  </div>
                  <span className="status-pill planned">내부 기준</span>
                </div>
                {productPolicyRows.map((row) => (
                  <div className="policy-ledger-row" key={row.label}>
                    <div>
                      <strong>{row.label}</strong>
                      <small>{row.note}</small>
                    </div>
                    <span>{row.value}</span>
                    <StatusPill value={row.status} />
                  </div>
                ))}
              </article>
              <article className="policy-ledger-card">
                <div className="panel-heading compact-heading">
                  <div>
                    <p className="eyebrow">referral policy</p>
                    <h3>추천 인센티브</h3>
                  </div>
                  <span className="status-pill active">1단계 확정</span>
                </div>
                {referralPolicyRows.map((row) => (
                  <div className="policy-ledger-row" key={row.label}>
                    <div>
                      <strong>{row.label}</strong>
                      <small>{row.note}</small>
                    </div>
                    <span>{row.value}</span>
                    <StatusPill value={row.status} />
                  </div>
                ))}
              </article>
            </div>
            <div className="ops-table validation-table" role="table">
              <div className="ops-row ops-head" role="row">
                <span>기간</span>
                <span>누적 도메인</span>
                <span>세팅 순매출</span>
                <span>쉐어 순매출</span>
                <span>합계</span>
                <span>검증 가정</span>
              </div>
              {threeYearValidationRows.map((row) => (
                <div className="ops-row" role="row" key={row.year}>
                  <strong>{row.year}</strong>
                  <span>{row.domains}</span>
                  <span>{row.setupNet}</span>
                  <span>{row.shareNet}</span>
                  <strong>{row.total}</strong>
                  <span>{row.assumption}</span>
                </div>
              ))}
            </div>
            <div className="tax-notice">
              <AlertTriangle size={20} />
              <p>
                정가 500만원 및 이벤트 300만원은 내부 정책 기준입니다. 실제 고객 고지에는 수익, 애드센스 승인,
                트래픽, 순위를 보장하지 않으며, 2단계 추천 수당은 법무 검토 전까지 비활성으로 유지합니다.
              </p>
            </div>
          </article>

          <article className="panel wide-panel" id="proxy">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">proxy isolation</p>
                <h2>도메인별 운영 접속 경로</h2>
              </div>
              <span className="status-pill planned">N8N 연동 준비</span>
            </div>
            <div className="proxy-readiness-grid">
              <article className="delivery-card">
                <strong>{proxyPlanningRows.length}</strong>
                <span>관리 대상 프로필</span>
                <p>사이트별 발행/점검 접속 경로를 프로필 키로 분리합니다. 비밀번호와 토큰은 DB에 저장하지 않습니다.</p>
              </article>
              <article className="delivery-card">
                <strong>{proxyActiveCount}</strong>
                <span>활성 확인 완료</span>
                <p>실제 프록시 연결 확인이 끝난 프로필만 N8N 발행 워크플로우에서 사용하도록 둡니다.</p>
              </article>
              <article className="delivery-card">
                <strong>{proxyNeedsCheckCount}</strong>
                <span>배정/검증 필요</span>
                <p>planned, verify_required, failed 상태는 자동 발행 전에 운영자가 확인해야 합니다.</p>
              </article>
            </div>
            <div className="ops-table proxy-table" role="table">
              <div className="ops-row ops-head" role="row">
                <span>도메인</span>
                <span>프로필</span>
                <span>유형/지역</span>
                <span>N8N Credential</span>
                <span>정책</span>
                <span>상태</span>
              </div>
              {proxyPlanningRows.map((row) => (
                <div className="ops-row" role="row" key={`${row.domain}-${row.profileKey}`}>
                  <div>
                    <strong>{row.domain}</strong>
                    <small>{row.siteKey} · {row.customerCode}</small>
                  </div>
                  <span>{row.profileKey}</span>
                  <span>{row.proxyType} · {row.region}</span>
                  <span>{row.credentialRef}</span>
                  <span>{row.egressPolicy}</span>
                  <StatusPill value={row.status} />
                </div>
              ))}
            </div>
            <div className="proxy-rule-grid">
              <article className="policy-box">
                <CheckCircle2 size={18} />
                <div>
                  <strong>저장 기준</strong>
                  <p>SiteOps DB에는 프로필 키와 상태만 저장합니다. proxy_user, proxy_pass, 토큰은 N8N Credential 또는 서버 환경변수에 둡니다.</p>
                </div>
              </article>
              <article className="policy-box">
                <CheckCircle2 size={18} />
                <div>
                  <strong>발행 기준</strong>
                  <p>N8N은 글 발행 전 site_key로 프록시 프로필을 조회하고, active가 아니면 자동 발행을 보류합니다.</p>
                </div>
              </article>
              <article className="policy-box warning-policy">
                <AlertTriangle size={18} />
                <div>
                  <strong>고객 공개 금지</strong>
                  <p>프록시, 서버, IP, 접속 경로 정보는 내부 보안/운영 기록입니다. Wordfriends 고객 화면에는 노출하지 않습니다.</p>
                </div>
              </article>
              <article className="policy-box warning-policy">
                <AlertTriangle size={18} />
                <div>
                  <strong>표현 기준</strong>
                  <p>프록시는 운영 격리와 감사 추적 목적입니다. 정책 회피, 승인 보장, 안전 보장 표현으로 설명하지 않습니다.</p>
                </div>
              </article>
            </div>
          </article>

          <article className="panel wide-panel" id="red-alert">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">site health alerts</p>
                <h2>Red Alert 이상 감지</h2>
              </div>
              <span className={`status-pill ${criticalHealthAlerts.length ? 'critical' : 'planned'}`}>
                {criticalHealthAlerts.length ? '즉시 확인' : '연동 준비'}
              </span>
            </div>
            <div className="alert-summary-grid">
              <article className="delivery-card">
                <strong>{openHealthAlerts.length}</strong>
                <span>열린 알림</span>
                <p>CTR, 노출, 광고 송출, WordPress 발행 실패를 내부 운영자가 먼저 확인하도록 모읍니다.</p>
              </article>
              <article className="delivery-card">
                <strong>{criticalHealthAlerts.length}</strong>
                <span>긴급 알림</span>
                <p>고객에게 노출하기 전에 BOSS 내부에서 원인 확인과 조치 메모를 남기는 기준입니다.</p>
              </article>
              <article className="delivery-card">
                <strong>API</strong>
                <span>Search Console / AdSense</span>
                <p>Search Console은 자동 연동 우선, AdSense는 고객 제공 자료 또는 공식 연동 가능 범위에서 처리합니다.</p>
              </article>
            </div>
            <div className="ops-table alert-table" role="table">
              <div className="ops-row ops-head" role="row">
                <span>도메인</span>
                <span>알림</span>
                <span>지표</span>
                <span>출처</span>
                <span>상태</span>
                <span>감지</span>
              </div>
              {healthAlertRows.map((row) => (
                <div className="ops-row" role="row" key={row.id}>
                  <div>
                    <strong>{row.domain || row.siteKey}</strong>
                    <small>{row.siteKey}</small>
                  </div>
                  <div>
                    <strong>{row.title}</strong>
                    <small>{row.message}</small>
                  </div>
                  <span>{row.metricName || row.alertType}</span>
                  <span>{row.source}</span>
                  <StatusPill value={row.status} />
                  <small>{row.detectedAt}</small>
                </div>
              ))}
            </div>
            <div className="tax-notice">
              <AlertTriangle size={20} />
              <p>
                Red Alert는 수익을 보장하기 위한 장치가 아니라 운영 이상을 빨리 발견하기 위한 내부 관제입니다.
                고객 화면에는 확정된 조치 결과만 필요한 범위로 공유합니다.
              </p>
            </div>
          </article>

          <article className="panel wide-panel" id="trust-score">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">incubation trust plan</p>
                <h2>도메인 Trust Score 빌드업</h2>
              </div>
              <span className="status-pill active">재활용/신규 공통</span>
            </div>
            <div className="trust-summary-grid">
              <article className="delivery-card">
                <strong>{trustPlanRows.length}</strong>
                <span>인큐베이션 대상</span>
                <p>살릴 수 있는 도메인은 천천히 콘텐츠, 색인, 출처 인용, 검수 기록을 쌓아 재평가합니다.</p>
              </article>
              <article className="delivery-card">
                <strong>30</strong>
                <span>기초 콘텐츠 목표</span>
                <p>도메인별 주제 일관성을 먼저 만들고, 자동 발행은 검수 기준을 통과한 뒤 확대합니다.</p>
              </article>
              <article className="delivery-card">
                <strong>5</strong>
                <span>권위 출처 인용 목표</span>
                <p>위키백과, 공공기관, 학회, 공식 문서 등 자연스러운 참고 링크만 편집 기준으로 사용합니다.</p>
              </article>
            </div>
            <div className="ops-table trust-table" role="table">
              <div className="ops-row ops-head" role="row">
                <span>도메인</span>
                <span>단계</span>
                <span>Trust</span>
                <span>목표</span>
                <span>다음 액션</span>
                <span>상태</span>
              </div>
              {trustPlanRows.map((row) => (
                <div className="ops-row" role="row" key={row.id || row.domain}>
                  <div>
                    <strong>{row.domain}</strong>
                    <small>{row.siteKey}</small>
                  </div>
                  <StatusPill value={row.planStage} />
                  <strong>{row.trustScore}</strong>
                  <span>
                    글 {row.contentTarget} · 색인 {row.indexedTarget} · 권위출처 {row.authorityOutboundTarget}
                  </span>
                  <span>{row.nextAction || row.notes || '다음 검수 기준 수립'}</span>
                  <StatusPill value={row.status} />
                </div>
              ))}
            </div>
            <div className="proxy-rule-grid">
              <article className="policy-box">
                <CheckCircle2 size={18} />
                <div>
                  <strong>출처 링크 기준</strong>
                  <p>아웃바운드 링크는 신뢰 보강을 위한 편집 참고자료입니다. 기계적 링크 삽입이나 상호 링크 자동화로 쓰지 않습니다.</p>
                </div>
              </article>
              <article className="policy-box warning-policy">
                <AlertTriangle size={18} />
                <div>
                  <strong>자동 발행 제한</strong>
                  <p>YMYL, 상표권, 스팸 이력, 고객 공개 가능 여부가 정리되지 않은 도메인은 자동 발행과 고객 매각을 보류합니다.</p>
                </div>
              </article>
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

          <article className="panel wide-panel" id="errors">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">error center</p>
                <h2>에러 센터</h2>
              </div>
              <span className="status-pill warning">내부 전용</span>
            </div>
            <div className="delivery-grid">
              <article className="delivery-card">
                <strong>{failedSitemapRows.length}</strong>
                <span>사이트맵/Search Console 실패</span>
                <p>대부분 URL 속성 권한 확인 문제입니다. 고객에게 노출하지 않고 내부 조치로 관리합니다.</p>
              </article>
              <article className="delivery-card">
                <strong>{validationFailedContent.length}</strong>
                <span>콘텐츠 검증 실패</span>
                <p>검증 실패 콘텐츠는 재시도보다 원인 확인, 금지어, YMYL, 길이/H2 기준을 먼저 확인합니다.</p>
              </article>
              <article className="delivery-card">
                <strong>{highRiskSites.length}</strong>
                <span>고위험 도메인/사이트</span>
                <p>도박, 스팸, 악성 이력 도메인은 고객용 애드센스 운영에서 기본 잠금 처리합니다.</p>
              </article>
              <article className="delivery-card">
                <strong>{unclassifiedSites.length}</strong>
                <span>미분류 도메인/사이트</span>
                <p>카테고리, 리스크, 수익화 방식이 정해지기 전에는 자동 발행이나 고객 노출을 보류합니다.</p>
              </article>
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
