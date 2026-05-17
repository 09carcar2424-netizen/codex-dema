# Wordfriends SiteOps Tracker

Wordfriends customer portal events are sent to BOSS SiteOps through a small WordPress plugin.

## Purpose

- Track realtime page visits, signup progress, login, contract progress, and inquiry questions.
- Keep `SITEOPS_EVENT_TOKEN` on the WordPress server side.
- Avoid exposing internal SiteOps credentials, risk notes, or admin data to customers.

## Server Setup

Add the same event token to the SiteOps server and the Wordfriends WordPress server.

SiteOps `.env`:

```bash
SITEOPS_EVENT_TOKEN=replace_with_long_random_secret
CORS_ALLOW_ORIGINS=https://siteops.09car.co.kr,https://wordfriends.co.kr
```

Restart SiteOps:

```bash
sudo systemctl restart boss-siteops-api
```

## WordPress Plugin Install

Upload this directory to Wordfriends:

```text
wp-content/plugins/wordfriends-siteops-tracker/
```

Required file:

```text
wp-content/plugins/wordfriends-siteops-tracker/wordfriends-siteops-tracker.php
```

Then activate **Wordfriends SiteOps Tracker** in WordPress Admin > Plugins.

## WordPress Configuration

Preferred: add constants to `wp-config.php` above the "stop editing" line.

```php
define('WORDFRIENDS_SITEOPS_ENDPOINT', 'https://siteops.09car.co.kr');
define('WORDFRIENDS_SITEOPS_EVENT_TOKEN', 'replace_with_long_random_secret');
```

Alternative: save WordPress options manually if needed.

```bash
wp option update wordfriends_siteops_endpoint 'https://siteops.09car.co.kr'
wp option update wordfriends_siteops_token 'replace_with_long_random_secret'
```

## Automatic Events

The plugin sends:

- `page_view` on public page load
- `login` on WordPress login
- `signup_started` when the Wordfriends signup shortcode form is submitted
- `signup_completed` after the Wordfriends signup shortcode creates a WordPress user
- `question_submitted` when a form has `data-siteops-question-form`

## Customer Question History

The SiteOps API exposes a token-protected customer question lookup endpoint for the WordPress plugin:

```text
GET /api/wordfriends/questions?customerCode=WF-000123&email=customer@example.com
```

The endpoint is for server-to-server calls from WordPress and requires `X-SiteOps-Event-Token`.
It returns only customer-safe fields such as category, status, question text, public response message, and timestamps.
It does not return internal notes, send errors, backend status details, or admin-only metadata.

## Customer Site Status

The WordPress plugin can also show customer-safe site status through:

```text
GET /api/wordfriends/sites?customerCode=WF-000123&email=customer@example.com
```

This endpoint is token-protected and intended only for server-to-server calls from WordPress.
It returns domain, public operation status, content queue counts, sitemap status, AdSense reference status, and settlement reference status.
It does not return risk scores, internal memos, credentials, proxy details, revenue guarantees, traffic promises, or AdSense approval guarantees.

## Customer Settlement And Referrals

The WordPress plugin can show customer-safe settlement and referral information through:

```text
GET /api/wordfriends/settlement-referrals?customerCode=WF-000123&email=customer@example.com
```

This endpoint is token-protected and intended only for server-to-server calls from WordPress.
It returns recent settlement reference states, one-step referral reward states, the active referral code, and tax reference labels.
It does not return internal revenue-share notes, legal/tax review notes, multi-level referral structures, or guarantee language.

## Customer Contract Requests

The WordPress plugin can submit and show customer-safe electronic contract requests through:

```text
POST /api/wordfriends/contracts
GET /api/wordfriends/contracts?customerCode=WF-000123&email=customer@example.com
```

The endpoint is token-protected and intended only for server-to-server calls from WordPress.
It stores the requester's contact details, desired domain count, public contract status, public message, and optional contract document URL.
Customer responses never include internal notes.

Admin status values:

```text
requested
document_sent
signed
setup_ready
closed
canceled
```

## Customer Timeline

The WordPress plugin can show customer-safe activity and notification timeline through:

```text
GET /api/wordfriends/timeline?customerCode=WF-000123&email=customer@example.com
```

The endpoint is token-protected and intended only for server-to-server calls from WordPress.
It combines public customer notifications, contract request updates, question status updates, and site status updates.
It does not expose internal notes, credentials, SMTP errors, admin-only alerts, or hidden risk details.

## Customer Shortcodes

Create WordPress pages and place these shortcodes in the page body.

Home landing page:

```text
[wordfriends_home]
```

Services page:

```text
[wordfriends_services]
```

Guide / FAQ page:

```text
[wordfriends_guide]
```

Use this page for AdSense, domain, WordPress, customer portal, and security education content. Keep all public wording clear that revenue, traffic, ranking, search indexing, and AdSense approval are not guaranteed.

Recommended public menu:

```text
HOME / 서비스 / 구축절차 / 사례 / 가이드/FAQ / 문의
```

Recommended utility menu:

```text
고객 포털 / 회원가입 / 로그인 / 로그아웃
```

Customer portal menu after login:

```text
내 사이트 / 내 문의 / 전자계약 / 정산/추천 / 알림센터
```

Signup page:

```text
[wordfriends_signup]
```

Login page:

```text
[wordfriends_login]
```

Optional redirect after login:

```text
[wordfriends_login redirect="https://wordfriends.co.kr/my-site/"]
```

My questions page:

```text
[wordfriends_my_questions]
```

Recommended page:

```text
내 문의
```

My sites page:

```text
[wordfriends_my_sites]
```

Recommended page:

```text
내 사이트
```

Settlement/referrals page:

```text
[wordfriends_settlement_referrals]
```

Recommended page:

```text
정산/추천
```

Timeline page:

```text
[wordfriends_timeline]
```

Recommended page:

```text
알림센터
```

Policy pages:

```text
전자계약 안내
이용약관
개인정보처리방침
```

Contract request form:

```text
[wordfriends_contract_request]
```

Recommended placement:

```text
전자계약 안내
```

Recommended slugs:

```text
contract-guide
terms
privacy-policy
notifications
```

The signup checkbox links to the terms and privacy pages automatically when these pages exist. The plugin also attempts to add policy links to the public footer when a footer element is present.

The signup shortcode creates a WordPress `subscriber` user, stores a `customer_code` user meta value like `WF-000123`, and sends signup progress events to SiteOps from the server side.

Customer-facing copy must not promise revenue, AdSense approval, search ranking, or traffic.

## Database Change

Apply `database/schema.sql` on the SiteOps server after deploying this version. The customer question history screen relies on these public lookup columns on `portal_question_threads`:

- `requester_customer_code`
- `requester_email`
- `requester_name`
- `requester_phone`

The electronic contract request screen relies on `portal_contract_requests`.

## Mark Signup and Contract Forms

Add data attributes to Wordfriends forms.

Signup start:

```html
<form data-siteops-event="signup_started">
```

Signup complete:

```html
<form data-siteops-event="signup_completed">
```

Contract start:

```html
<form data-siteops-event="contract_started">
```

Contract complete:

```html
<form data-siteops-event="contract_completed">
```

Inquiry form:

```html
<form data-siteops-question-form data-siteops-question-category="general">
  <textarea name="question"></textarea>
</form>
```

Allowed question categories:

- `general`
- `settlement`
- `contract`
- `adsense`
- `tax`
- `policy`
- `technical`

## Manual JavaScript Events

After the plugin loads:

```js
window.WordfriendsTrack.event('signup_started');
window.WordfriendsTrack.event('contract_completed');
window.WordfriendsTrack.question('When is the next settlement date?', 'settlement');
```

## Guardrails

Questions mentioning revenue guarantees, AdSense approval guarantees, policy bypass, invalid traffic, tax, settlement, contracts, or AdSense are sent to human review or blocked in SiteOps.

Do not show internal SiteOps domain risk scores, spam notes, backend credentials, or server details in Wordfriends.
