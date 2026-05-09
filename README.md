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

## 실행 준비

Node.js는 설치되어 있습니다. PowerShell에서 `npm`이 막히면 `npm.cmd`를 사용하세요.

```cmd
cd /d "C:\Users\pi\Desktop\BOSS\codex dema"
npm.cmd install
npm.cmd run dev
```

브라우저에서 표시되는 주소를 열면 관리자 화면을 볼 수 있습니다.

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
