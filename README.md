# WordPress Automation Hub

여러 도메인의 WordPress 홈페이지를 한곳에서 관리하고, 기본 세팅/랜딩페이지/글 발행을 자동화하기 위한 첫 버전 프로젝트입니다.

## 현재 포함된 기능

- 도메인별 언어 자동 판정 규칙
- WordPress 사이트 세팅 작업 계획
- 테마/플러그인 설치 후보 관리
- 개인정보 처리방침, 이용약관, 문의하기 페이지 생성 계획
- 랜딩페이지 템플릿 구조
- 글 발행 관리를 위한 PostgreSQL 스키마
- 관리자 대시보드 UI

## BOSS SiteOps Platform v1

현재 프로젝트 방향은 고객 소유 도메인/고객 소유 AdSense 계정을 전제로 한 운영대행 플랫폼입니다.

- 정식 설계 문서: [docs/BOSS_SiteOps_Platform_v1_Design.md](docs/BOSS_SiteOps_Platform_v1_Design.md)
- 구글시트 이전 매핑: [database/GOOGLE_SHEETS_IMPORT_MAPPING.md](database/GOOGLE_SHEETS_IMPORT_MAPPING.md)
- PostgreSQL 스키마: [database/schema.sql](database/schema.sql)
- 도메인 포트폴리오 기준: [docs/Domain_Portfolio_v1.md](docs/Domain_Portfolio_v1.md)
- 고객 포털/추천 보상 설계: [docs/Customer_Portal_v1.md](docs/Customer_Portal_v1.md)
- 보안 운영 기준: [docs/Security_Operations_v1.md](docs/Security_Operations_v1.md)
- 세액/원천징수 예상 안내: [docs/Tax_Withholding_v1.md](docs/Tax_Withholding_v1.md)

민감정보는 DB에 평문 저장하지 않습니다. WordPress App Password, API 키, OAuth secret은 N8N Credentials, 서버 환경변수, 또는 별도 Secret Manager에 보관하고 DB에는 `credential_ref` 또는 `secret_ref`만 저장합니다.

## 실행 준비

Node.js는 설치되어 있습니다. PowerShell에서 `npm`이 막히면 `npm.cmd`를 사용하세요.

```cmd
cd /d "C:\Users\pi\Desktop\BOSS\codex dema"
npm.cmd install
npm.cmd run dev
```

`npm.cmd run dev`는 API 서버(`http://127.0.0.1:8787`)와 Vite 화면(`http://127.0.0.1:5173`)을 함께 실행합니다.

브라우저에서 표시되는 주소를 열면 관리자 화면을 볼 수 있습니다.

## Ubuntu PostgreSQL 준비

Ubuntu 서버에서 실행할 때는 실제 비밀번호를 환경변수로 지정한 뒤 스크립트를 실행합니다.

```bash
APP_DB_PASSWORD='강력한-새-비밀번호' bash scripts/ubuntu-postgres-setup.sh
```

실제 운영 `.env`에는 `DATABASE_URL`을 저장하고, 파일 권한은 `chmod 600 .env`로 제한하세요.

전체 Ubuntu 배포 절차는 [docs/UBUNTU_DEPLOYMENT.md](docs/UBUNTU_DEPLOYMENT.md)를 참고하세요.

프로덕션 실행은 다음 순서입니다.

```bash
npm ci
npm run build
npm start
```

`npm start`는 API 서버와 빌드된 관리자 화면을 같은 포트에서 제공합니다. 외부 접속 서버에서는 `.env`의 `API_HOST`를 `0.0.0.0`으로 설정하세요.

## PostgreSQL 실행

Docker Desktop이 설치되어 있다면:

```cmd
docker compose up -d
```

DB 접속 주소:

```text
postgresql://wpauto:wpauto@localhost:5432/wp_automation
```

## 중요한 운영 원칙

이 프로젝트는 대량 랜덤 사이트 생성보다, 도메인 주제에 맞는 정상적인 사이트 세팅과 품질 있는 콘텐츠 관리를 목표로 합니다.

AdSense 승인은 자동으로 보장되지 않습니다. 개인정보 처리방침, 이용약관, 문의하기 페이지 외에도 실제 방문자에게 도움이 되는 콘텐츠와 명확한 사이트 주제가 필요합니다.

## 다음 개발 단계

1. WordPress REST API 연결 설정
2. WP-CLI 실행 모듈 추가
3. 실제 테마/플러그인 설치 자동화
4. 랜딩페이지 HTML을 WordPress 페이지로 발행
5. 글 예약 발행 큐 구현
6. 작업 로그와 실패 재시도 기능 추가
