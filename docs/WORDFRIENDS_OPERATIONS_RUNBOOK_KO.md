# Wordfriends 운영 런북

이 문서는 Wordfriends 사이트와 BOSS SiteOps를 안정적으로 운영하기 위한 한글 인수인계용 체크리스트입니다.

## 기본 정보

```text
로컬 프로젝트: C:\Users\pi\Desktop\BOSS\codex dema
서버 프로젝트: /home/boss/codex-dema
Wordfriends 사이트: https://wordfriends.co.kr
SiteOps 관리자: https://siteops.09car.co.kr
핵심 플러그인: integrations/wordfriends-siteops-tracker/wordfriends-siteops-tracker.php
현재 확인된 플러그인 버전: 0.6.2
```

## 배포 루틴

### 문서만 변경된 경우

서버에서 아래만 실행합니다.

```bash
cd /home/boss/codex-dema
git pull
```

FileZilla 업로드, `php -l`, `npm run build`, API 재시작은 필요 없습니다.

### Wordfriends 플러그인이 변경된 경우

서버에서 먼저 최신 코드를 받습니다.

```bash
cd /home/boss/codex-dema
git pull
php -l /home/boss/codex-dema/integrations/wordfriends-siteops-tracker/wordfriends-siteops-tracker.php
```

문법검사가 정상이어야 합니다.

```text
No syntax errors detected
```

그 다음 FileZilla로 아래 파일만 업로드합니다.

```text
로컬:
integrations/wordfriends-siteops-tracker/wordfriends-siteops-tracker.php

원격:
/wp-content/plugins/wordfriends-siteops-tracker/wordfriends-siteops-tracker.php
```

업로드 후 WordPress 관리자에서 확인합니다.

```text
WordPress 관리자 > 플러그인 > Wordfriends SiteOps Tracker
```

표시 버전이 기대 버전과 같아야 합니다.

### API 또는 프론트엔드가 변경된 경우

서버에서 실행합니다.

```bash
cd /home/boss/codex-dema
git pull
npm run build
sudo systemctl restart boss-siteops-api
```

가능하면 헬스 체크도 확인합니다.

```bash
curl http://127.0.0.1:8787/api/health
curl https://siteops.09car.co.kr/api/health
```

## FileZilla 주의사항

플러그인 업로드 위치:

```text
/wp-content/plugins/wordfriends-siteops-tracker/
```

업로드해야 하는 파일:

```text
wordfriends-siteops-tracker.php
```

업로드하면 안 되는 파일:

```text
wp-config.php
.env
SMTP 키
DB 비밀번호
관리자 비밀번호
인증 토큰
```

Search Console HTML 인증 파일은 WordPress 루트에 둡니다.

```text
https://wordfriends.co.kr/google1e99994f43630f74.html
```

이 파일은 삭제하지 않습니다.

## Search Console 상태

완료된 항목:

- `https://wordfriends.co.kr/` 속성 소유권 확인 완료
- HTML 파일 방식으로 인증
- 인증 파일 위치: `https://wordfriends.co.kr/google1e99994f43630f74.html`
- WordPress 기본 사이트맵 확인 완료
- 제출한 사이트맵: `wp-sitemap.xml`

사이트맵 확인 주소:

```text
https://wordfriends.co.kr/wp-sitemap.xml
```

Search Console 데이터는 바로 쌓이지 않을 수 있습니다. 색인, 검색 노출, 방문자, 수익은 별도 문제이며 보장하지 않습니다.

## 공개 페이지 점검

아래 페이지는 SiteOps 다크톤으로 보여야 합니다.

- HOME
- 서비스
- 구축절차
- 사례
- 가이드/FAQ
- 문의
- 로그인
- 회원가입
- 고객 포털
- 내 사이트
- 내 문의
- 전자계약 안내
- 정산/추천
- 알림센터

점검 기준:

- 모바일 메뉴가 다크 배경과 2열 버튼 구조로 열리는가?
- 푸터가 중앙 정렬되고 overflow가 없는가?
- `talk@wordfriends.co.kr` 이메일 링크가 정상인가?
- 버튼/카드 hover와 focus가 과하지 않고 깨지지 않는가?
- 긴 한글 제목이 모바일에서 깨지지 않는가?

## 고객 포털 점검

로그아웃 상태:

- 고객 포털, 내 사이트, 내 문의, 전자계약, 정산/추천, 알림센터는 로그인 안내만 보여야 합니다.
- 고객 도메인, 정산, 문의, 알림 데이터가 보이면 안 됩니다.
- shortcode 원문이 보이면 안 됩니다.

로그인 상태:

- 내 사이트에는 고객용 공개 상태만 보여야 합니다.
- 내부 위험 점수, site key, credential, proxy, 내부 메모는 보이면 안 됩니다.
- 내 문의에는 고객 질문과 공개 답변만 보여야 합니다.
- 전자계약에는 공개 계약 요청 상태와 안내만 보여야 합니다.
- 정산/추천에는 1단계 추천 기준만 보여야 합니다.
- 알림센터에는 고객에게 보여도 되는 진행 안내만 표시합니다.

## 가이드 글 운영 상태

현재 발행 완료된 글:

- `adsense-basic-guide`
- `domain-before-buy-checklist`
- `nameserver-dns-setup-guide`
- `wordpress-required-pages`
- `adsense-readiness-checklist`
- `adsense-policy-violations`
- `search-console-basic`
- `sitemap-submission-basic`
- `ads-txt-basic`
- `customer-portal-guide`

현재 임시글:

- `content-operation-routine`

가이드 글 점검 기준:

- 글 상세가 다크톤으로 보여야 합니다.
- 댓글이 보이면 안 됩니다.
- pingback이 열려 있으면 안 됩니다.
- 불필요한 “더 많은 게시물” 블록이 보이면 안 됩니다.
- 하단 이전/다음 링크는 다크톤에서 읽기 쉬워야 합니다.

## 글 발행 원칙

앞으로는 글을 많이 몰아서 발행하지 않습니다.

권장 운영:

- 초안 작성은 계속 가능
- 공개 발행은 하루 1개 이하
- 가능하면 2~3일 간격으로 발행
- 발행 전 PC/모바일 미리보기 확인
- 발행 전 댓글/하단 블록 여부 확인
- 가이드/FAQ 허브 연결 확인

금지 표현:

- 수익 보장
- AdSense 승인 보장
- 트래픽 보장
- 검색 순위 보장
- 아무것도 하지 않아도 된다는 표현
- 월세보다 안정적이라는 표현
- 숨만 쉬어도 수익이라는 표현
- 고객 계정 비밀번호 수집/보관 표현

유지할 원칙:

- Google 계정, 도메인, 호스팅, AdSense는 고객 소유
- Wordfriends는 운영대행, 콘텐츠 운영, 기술지원, 진행 상태 정리 역할
- 결과는 플랫폼 정책, 콘텐츠 품질, 시장 상황, 고객 계정 상태에 따라 달라질 수 있음
- 운영 이력 도메인/샌드박스 경과 도메인은 참고 후보 유형으로만 설명

## DB와 Docker 정보

PostgreSQL:

```text
컨테이너: wp-automation-postgres
DB: wp_automation
User: wpauto
Docker volume: codex-dema_postgres_data
실제 volume path: /var/lib/docker/volumes/codex-dema_postgres_data/_data
```

DB 스키마 반영이 필요할 때:

```bash
cd /home/boss/codex-dema
cat database/schema.sql | docker exec -i wp-automation-postgres psql -U wpauto -d wp_automation
```

일반 플러그인/문서 변경에는 DB 반영이 필요 없습니다.

## 백업 체크리스트

큰 변경 전:

- 최신 git commit이 push되었는지 확인
- WordPress DB 백업
- 라이브 WordPress 플러그인 파일 백업
- `.env`는 안전한 곳에 백업하되 채팅/문서/git에 값 출력 금지
- Docker volume 이름 확인

PostgreSQL 백업 예시:

```bash
docker exec wp-automation-postgres pg_dump -U wpauto -d wp_automation > boss-siteops-$(date +%Y%m%d-%H%M%S).sql
```

백업 파일은 repository 밖에 보관합니다.

## 장애 시 복구 순서

1. SiteOps API 상태 확인

```bash
curl http://127.0.0.1:8787/api/health
sudo systemctl status boss-siteops-api
```

2. API 재시작

```bash
sudo systemctl restart boss-siteops-api
```

3. WordPress 플러그인 문제 확인

```bash
php -l /home/boss/codex-dema/integrations/wordfriends-siteops-tracker/wordfriends-siteops-tracker.php
```

4. FileZilla 업로드 파일 확인

```text
/wp-content/plugins/wordfriends-siteops-tracker/wordfriends-siteops-tracker.php
```

5. 브라우저에서 핵심 화면 확인

- HOME
- 가이드/FAQ
- 고객 포털
- 내 사이트
- 내 문의
- 전자계약
- 알림센터

6. DB 문제가 의심되면 Docker/PostgreSQL 상태 확인

```bash
docker ps
docker logs wp-automation-postgres --tail=100
```

## 다음 작업 후보

우선순위:

1. `content-operation-routine`은 며칠 뒤 공개 발행
2. Search Console 상태를 며칠 후 확인
3. 고객 포털 내부 모바일 화면 재점검
4. 콘텐츠 운영 루틴 이후 새 글은 천천히 초안부터 준비
5. 영상 가이드는 추후 짧은 화면 녹화형으로 진행
