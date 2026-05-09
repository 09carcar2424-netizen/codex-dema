export const sampleDomains = [
  {
    domain: 'premiumbuilder.com',
    topic: 'construction lead landing',
    status: 'success',
    statusLabel: '설계 완료',
  },
  {
    domain: 'smartclinic.net',
    topic: 'local clinic content',
    status: 'queued',
    statusLabel: '대기',
  },
  {
    domain: '좋은상담.kr',
    topic: 'Korean consultation site',
    status: 'running',
    statusLabel: '진행중',
  },
  {
    domain: 'cleanliving.org',
    topic: 'information blog',
    status: 'success',
    statusLabel: '설계 완료',
  },
];

export const sampleJobs = [
  {
    title: '기본 정책 페이지 생성',
    domain: '좋은상담.kr',
    schedule: '즉시 실행',
    status: 'running',
    statusLabel: '진행중',
  },
  {
    title: '서비스 소개 랜딩페이지 발행',
    domain: 'premiumbuilder.com',
    schedule: '오늘 18:00',
    status: 'queued',
    statusLabel: '예약',
  },
  {
    title: '블로그 글 5개 예약 발행',
    domain: 'cleanliving.org',
    schedule: '매일 09:00',
    status: 'success',
    statusLabel: '준비됨',
  },
];

export const templateCatalog = [
  {
    key: 'service-lead',
    name: '서비스 문의형',
    useCase: '상담, 견적, 방문 예약',
    color: '#1f8a70',
  },
  {
    key: 'product-detail',
    name: '상품 상세형',
    useCase: '제품 장점, 후기, 구매 유도',
    color: '#d66b2d',
  },
  {
    key: 'local-business',
    name: '지역 비즈니스형',
    useCase: '지역 키워드, 지도, 문의',
    color: '#4169e1',
  },
  {
    key: 'info-blog',
    name: '정보 블로그형',
    useCase: '애드센스 친화 정보 콘텐츠',
    color: '#7b5cbd',
  },
];
