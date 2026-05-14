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

## Customer Shortcodes

Create WordPress pages and place these shortcodes in the page body.

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

The signup shortcode creates a WordPress `subscriber` user, stores a `customer_code` user meta value like `WF-000123`, and sends signup progress events to SiteOps from the server side.

Customer-facing copy must not promise revenue, AdSense approval, search ranking, or traffic.

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
