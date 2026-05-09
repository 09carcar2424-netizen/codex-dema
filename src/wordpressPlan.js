import punycode from 'punycode/';

const englishTlds = new Set(['com', 'net', 'org']);
const koreanTlds = new Set(['kr', 'co.kr', 'or.kr', 'ne.kr']);

export function detectDomainProfile(domainName) {
  const normalized = domainName.trim().toLowerCase();
  const asciiDomain = punycode.toASCII(normalized);
  const labels = normalized.split('.');
  const lastTwo = labels.slice(-2).join('.');
  const tld = koreanTlds.has(lastTwo) ? lastTwo : labels.at(-1);
  const hasKorean = /[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(normalized);
  const language = hasKorean || koreanTlds.has(tld) ? 'ko' : 'en';

  return {
    originalDomain: domainName,
    asciiDomain,
    tld,
    language,
    languageLabel: language === 'ko' ? '한글 사이트' : 'English site',
    recommendedMarket: englishTlds.has(tld) ? 'global' : 'korea',
  };
}

export function buildAutomationPlan(domainRecord) {
  const profile = detectDomainProfile(domainRecord.domain);
  const isKorean = profile.language === 'ko';
  const policyPages = isKorean
    ? ['개인정보 처리방침', '이용약관', '문의하기']
    : ['Privacy Policy', 'Terms of Use', 'Contact'];

  return {
    domain: domainRecord.domain,
    profile,
    steps: [
      {
        title: 'WordPress 연결 확인',
        detail: `${profile.asciiDomain} 관리자 API와 WP-CLI 연결 상태를 확인합니다.`,
      },
      {
        title: '테마 후보 선택',
        detail: '도메인 주제에 맞는 가벼운 테마를 후보 목록에서 선택합니다.',
      },
      {
        title: '플러그인 설치',
        detail: 'SEO, 보안, 캐시, 문의 폼 플러그인을 목적에 맞게 설치합니다.',
      },
      {
        title: '브랜드 색상 적용',
        detail: '업종과 언어에 맞춰 기본 색상, 버튼, 링크 색을 설정합니다.',
      },
      {
        title: '필수 푸터 페이지 생성',
        detail: policyPages.join(', '),
      },
      {
        title: '랜딩페이지 배치',
        detail: '서비스형, 상품형, 지역형, 정보형 템플릿 중 하나를 연결합니다.',
      },
    ],
  };
}
