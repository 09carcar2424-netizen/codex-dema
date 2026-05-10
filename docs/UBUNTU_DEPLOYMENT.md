# Ubuntu Deployment

이 프로젝트는 Node.js API 서버가 Vite 빌드 결과물(`dist`)까지 함께 서빙합니다.

## 1. 패키지 설치

Ubuntu 22.04 이상에서 Node.js 20 이상과 PostgreSQL을 준비합니다.

```bash
sudo apt-get update
sudo apt-get install -y git curl postgresql postgresql-contrib
```

Node.js 20이 없다면 NodeSource 또는 nvm으로 설치한 뒤 확인합니다.

```bash
node --version
npm --version
```

## 2. 프로젝트 준비

```bash
git clone https://github.com/09carcar2424-netizen/codex-dema.git
cd codex-dema
npm ci
```

## 3. PostgreSQL 초기화

강한 비밀번호를 지정해 DB와 스키마를 생성합니다.

```bash
APP_DB_PASSWORD='replace-with-strong-password' bash scripts/ubuntu-postgres-setup.sh
```

## 4. 환경변수 설정

```bash
cp .env.example .env
nano .env
chmod 600 .env
```

서버 외부에서 접속할 때는 다음 값을 사용합니다.

```text
DATABASE_URL=postgresql://wpauto:<DB_PASSWORD>@127.0.0.1:5432/wp_automation
API_HOST=0.0.0.0
API_PORT=8787
VITE_API_BASE_URL=
```

`VITE_API_BASE_URL`을 비워두면 프로덕션 빌드에서 같은 도메인의 `/api`를 호출합니다.
실제 DB 비밀번호와 전체 연결 문자열은 `.env`에만 저장하고 커밋하지 않습니다.

## 5. 빌드와 실행

```bash
npm run build
npm start
```

정상 실행 후 확인합니다.

```bash
curl http://127.0.0.1:8787/api/health
```

브라우저에서는 `http://SERVER_IP:8787`로 접속합니다.

## 6. systemd 서비스 등록

운영 경로를 `/opt/codex-dema`로 사용할 경우:

```bash
sudo mkdir -p /opt
sudo cp -a . /opt/codex-dema
sudo chown -R www-data:www-data /opt/codex-dema
sudo cp /opt/codex-dema/deploy/codex-dema.service.example /etc/systemd/system/codex-dema.service
sudo systemctl daemon-reload
sudo systemctl enable --now codex-dema
sudo systemctl status codex-dema
```

로그 확인:

```bash
journalctl -u codex-dema -f
```
