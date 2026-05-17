<?php
/**
 * Plugin Name: Wordfriends SiteOps Tracker
 * Description: Sends Wordfriends portal activity and support questions to BOSS SiteOps without exposing the event token in the browser.
 * Version: 0.4.6
 * Author: BOSS SiteOps
 */

if (!defined('ABSPATH')) {
    exit;
}

const WORDFRIENDS_SITEOPS_OPTION_ENDPOINT = 'wordfriends_siteops_endpoint';
const WORDFRIENDS_SITEOPS_OPTION_TOKEN = 'wordfriends_siteops_token';
const WORDFRIENDS_SITEOPS_VERSION = '0.4.6';

function wordfriends_siteops_default_endpoint() {
    if (defined('WORDFRIENDS_SITEOPS_ENDPOINT') && WORDFRIENDS_SITEOPS_ENDPOINT) {
        return rtrim(WORDFRIENDS_SITEOPS_ENDPOINT, '/');
    }

    return rtrim(get_option(WORDFRIENDS_SITEOPS_OPTION_ENDPOINT, 'https://siteops.09car.co.kr'), '/');
}

function wordfriends_siteops_event_token() {
    if (defined('WORDFRIENDS_SITEOPS_EVENT_TOKEN') && WORDFRIENDS_SITEOPS_EVENT_TOKEN) {
        return WORDFRIENDS_SITEOPS_EVENT_TOKEN;
    }

    return get_option(WORDFRIENDS_SITEOPS_OPTION_TOKEN, '');
}

function wordfriends_siteops_customer_code() {
    $user_id = get_current_user_id();

    if (!$user_id) {
        return '';
    }

    $customer_code = get_user_meta($user_id, 'customer_code', true);

    if ($customer_code) {
        return sanitize_text_field($customer_code);
    }

    return 'WP-' . $user_id;
}

function wordfriends_siteops_customer_code_for_user($user_id) {
    $customer_code = get_user_meta($user_id, 'customer_code', true);

    if ($customer_code) {
        return sanitize_text_field($customer_code);
    }

    return 'WP-' . absint($user_id);
}

function wordfriends_siteops_send($path, $payload) {
    $token = wordfriends_siteops_event_token();
    $endpoint = wordfriends_siteops_default_endpoint();

    if (!$token || !$endpoint) {
        return new WP_Error('wordfriends_siteops_not_configured', 'SiteOps endpoint or token is not configured.');
    }

    return wp_remote_post($endpoint . $path, [
        'timeout' => 6,
        'headers' => [
            'Content-Type' => 'application/json',
            'X-SiteOps-Event-Token' => $token,
        ],
        'body' => wp_json_encode($payload),
    ]);
}

function wordfriends_siteops_get($path, $query = []) {
    $token = wordfriends_siteops_event_token();
    $endpoint = wordfriends_siteops_default_endpoint();

    if (!$token || !$endpoint) {
        return new WP_Error('wordfriends_siteops_not_configured', 'SiteOps endpoint or token is not configured.');
    }

    $url = add_query_arg(array_filter($query, function ($value) {
        return $value !== '' && $value !== null;
    }), $endpoint . $path);

    return wp_remote_get($url, [
        'timeout' => 8,
        'headers' => [
            'X-SiteOps-Event-Token' => $token,
        ],
    ]);
}

function wordfriends_siteops_track_event($event_type, $extra = []) {
    $payload = array_merge([
        'eventType' => $event_type,
        'customerCode' => wordfriends_siteops_customer_code(),
        'sessionId' => isset($_COOKIE['wordfriends_session_id']) ? sanitize_text_field(wp_unslash($_COOKIE['wordfriends_session_id'])) : '',
        'pagePath' => isset($_SERVER['REQUEST_URI']) ? esc_url_raw(wp_unslash($_SERVER['REQUEST_URI'])) : '',
        'payload' => [
            'wpUserId' => get_current_user_id(),
        ],
    ], $extra);

    wordfriends_siteops_send('/api/wordfriends/events', $payload);
}

function wordfriends_siteops_enqueue_tracker() {
    if (is_admin()) {
        return;
    }

    if (!isset($_COOKIE['wordfriends_session_id'])) {
        $session_id = wp_generate_uuid4();
        setcookie('wordfriends_session_id', $session_id, time() + DAY_IN_SECONDS, COOKIEPATH ?: '/', COOKIE_DOMAIN, is_ssl(), true);
        $_COOKIE['wordfriends_session_id'] = $session_id;
    }

    wp_register_script('wordfriends-siteops-tracker', false, [], WORDFRIENDS_SITEOPS_VERSION, true);
    wp_enqueue_script('wordfriends-siteops-tracker');
    wp_localize_script('wordfriends-siteops-tracker', 'WordfriendsSiteOps', [
        'ajaxUrl' => admin_url('admin-ajax.php'),
        'nonce' => wp_create_nonce('wordfriends_siteops_event'),
        'sessionId' => sanitize_text_field(wp_unslash($_COOKIE['wordfriends_session_id'])),
        'customerCode' => wordfriends_siteops_customer_code(),
        'dashboardUrl' => wordfriends_siteops_dashboard_page_url(),
        'loginUrl' => wordfriends_siteops_login_page_url(),
        'logoutUrl' => wordfriends_siteops_logout_page_url(),
        'inquiryUrl' => wordfriends_siteops_question_page_url(),
        'myQuestionsUrl' => wordfriends_siteops_my_questions_page_url(),
        'mySitesUrl' => wordfriends_siteops_my_sites_page_url(),
        'settlementReferralsUrl' => wordfriends_siteops_settlement_referrals_page_url(),
        'timelineUrl' => wordfriends_siteops_timeline_page_url(),
        'contractGuideUrl' => wordfriends_siteops_contract_guide_page_url(),
        'termsUrl' => wordfriends_siteops_terms_page_url(),
        'privacyUrl' => wordfriends_siteops_privacy_page_url(),
    ]);

    wp_add_inline_script('wordfriends-siteops-tracker', <<<'JS'
(function () {
  if (!window.WordfriendsSiteOps) return;

  function post(action, payload) {
    var body = new URLSearchParams();
    body.set('action', action);
    body.set('nonce', WordfriendsSiteOps.nonce);
    body.set('payload', JSON.stringify(payload || {}));

    fetch(WordfriendsSiteOps.ajaxUrl, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body: body.toString()
    }).catch(function () {});
  }

  function basePayload(extra) {
    return Object.assign({
      customerCode: WordfriendsSiteOps.customerCode || '',
      sessionId: WordfriendsSiteOps.sessionId || '',
      pagePath: window.location.pathname + window.location.search
    }, extra || {});
  }

  window.WordfriendsTrack = {
    event: function (eventType, payload) {
      post('wordfriends_siteops_event', basePayload(Object.assign({ eventType: eventType }, payload || {})));
    },
    question: function (question, category, payload) {
      post('wordfriends_siteops_question', basePayload(Object.assign({
        question: question,
        category: category || 'general'
      }, payload || {})));
    }
  };

  window.WordfriendsTrack.event('page_view');

  function normalizePortalLinks() {
    document.querySelectorAll('a').forEach(function (link) {
      var label = (link.textContent || '').replace(/\s+/g, '').trim();
      if (label === '로그인' && WordfriendsSiteOps.loginUrl) {
        link.href = WordfriendsSiteOps.loginUrl;
      }
      if (label === '로그아웃' && WordfriendsSiteOps.logoutUrl) {
        link.href = WordfriendsSiteOps.logoutUrl;
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', normalizePortalLinks);
  } else {
    normalizePortalLinks();
  }

  document.addEventListener('submit', function (event) {
    var form = event.target;
    if (!form || !form.matches) return;

    if (form.matches('[data-siteops-event]')) {
      window.WordfriendsTrack.event(form.getAttribute('data-siteops-event') || 'page_view');
    }

    if (form.matches('[data-siteops-question-form]') && !form.querySelector('[name="wordfriends_question_action"]')) {
      var field = form.querySelector('[name="question"], textarea, input[type="text"]');
      var category = form.getAttribute('data-siteops-question-category') || 'general';
      if (field && field.value) {
        window.WordfriendsTrack.question(field.value, category);
      }
    }
  }, true);
})();
JS);
    wp_add_inline_script('wordfriends-siteops-tracker', <<<'JS'
(function () {
  if (!window.WordfriendsSiteOps) return;

  function ensurePortalLink(text, href) {
    if (!href) return;
    var nav = document.querySelector('header nav, .wp-block-navigation, nav');
    if (!nav) return;

    var hasLink = Array.prototype.some.call(nav.querySelectorAll('a'), function (link) {
      return (link.textContent || '').replace(/\s+/g, '').trim() === text.replace(/\s+/g, '');
    });
    if (hasLink) return;

    var lastLink = nav.querySelector('a:last-of-type');
    if (!lastLink || !lastLink.parentNode) return;

    var link = lastLink.cloneNode(false);
    link.href = href;
    link.textContent = text;
    link.removeAttribute('aria-current');

    if (lastLink.parentElement && lastLink.parentElement.tagName && lastLink.parentElement.tagName.toLowerCase() === 'li') {
      var item = lastLink.parentElement.cloneNode(false);
      item.appendChild(link);
      lastLink.parentElement.parentNode.appendChild(item);
      return;
    }

    lastLink.parentNode.appendChild(document.createTextNode(' '));
    lastLink.parentNode.appendChild(link);
  }

  function ensurePortalLinks() {
    ensurePortalLink('\uace0\uac1d \ud3ec\ud138', WordfriendsSiteOps.dashboardUrl);
    ensurePortalLink('\ub0b4 \uc0ac\uc774\ud2b8', WordfriendsSiteOps.mySitesUrl);
    ensurePortalLink('\ub0b4 \ubb38\uc758', WordfriendsSiteOps.myQuestionsUrl);
    ensurePortalLink('\uc815\uc0b0/\ucd94\ucc9c', WordfriendsSiteOps.settlementReferralsUrl);
    ensurePortalLink('\uc54c\ub9bc\uc13c\ud130', WordfriendsSiteOps.timelineUrl);
    ensurePortalLink('\uc804\uc790\uacc4\uc57d', WordfriendsSiteOps.contractGuideUrl);
    ensurePortalLink('\ubb38\uc758', WordfriendsSiteOps.inquiryUrl);
  }

  function ensurePolicyFooterLinks() {
    var footer = document.querySelector('footer, .wp-block-template-part footer');
    if (!footer) return;

    var links = [
      ['\uc804\uc790\uacc4\uc57d \uc548\ub0b4', WordfriendsSiteOps.contractGuideUrl],
      ['\uc774\uc6a9\uc57d\uad00', WordfriendsSiteOps.termsUrl],
      ['\uac1c\uc778\uc815\ubcf4\ucc98\ub9ac\ubc29\uce68', WordfriendsSiteOps.privacyUrl]
    ].filter(function (item) { return item[1]; });

    if (!links.length || footer.querySelector('[data-wordfriends-policy-links]')) return;

    var wrap = document.createElement('nav');
    wrap.setAttribute('data-wordfriends-policy-links', '1');
    wrap.style.marginTop = '12px';
    wrap.style.display = 'flex';
    wrap.style.flexWrap = 'wrap';
    wrap.style.gap = '10px';

    links.forEach(function (item) {
      var link = document.createElement('a');
      link.href = item[1];
      link.textContent = item[0];
      wrap.appendChild(link);
    });

    footer.appendChild(wrap);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      ensurePortalLinks();
      ensurePolicyFooterLinks();
    });
  } else {
    ensurePortalLinks();
    ensurePolicyFooterLinks();
  }
})();
JS);
}
add_action('wp_enqueue_scripts', 'wordfriends_siteops_enqueue_tracker');

function wordfriends_siteops_portal_styles() {
    if (is_admin()) {
        return;
    }

    wp_register_style('wordfriends-siteops-portal', false, [], WORDFRIENDS_SITEOPS_VERSION);
    wp_enqueue_style('wordfriends-siteops-portal');
    wp_add_inline_style('wordfriends-siteops-portal', '
      .wordfriends-auth {
        max-width: 520px;
        border: 1px solid #d9e2e7;
        border-radius: 8px;
        padding: 24px;
        background: #fff;
        color: #17212b;
      }
      .wordfriends-auth h2 {
        margin: 0 0 8px;
        font-size: 28px;
        line-height: 1.2;
      }
      .wordfriends-auth p {
        margin: 0 0 16px;
        color: #5b6872;
        line-height: 1.6;
      }
      .wordfriends-auth form,
      .wordfriends-fieldset {
        display: grid;
        gap: 14px;
      }
      .wordfriends-auth label {
        display: grid;
        gap: 6px;
        font-weight: 700;
      }
      .wordfriends-auth input[type="text"],
      .wordfriends-auth input[type="email"],
      .wordfriends-auth input[type="tel"],
      .wordfriends-auth input[type="number"],
      .wordfriends-auth input[type="password"],
      .wordfriends-auth select,
      .wordfriends-auth textarea {
        width: 100%;
        min-height: 44px;
        border: 1px solid #c7d4dc;
        border-radius: 8px;
        padding: 10px 12px;
        font: inherit;
      }
      .wordfriends-auth textarea {
        min-height: 160px;
        resize: vertical;
      }
      .wordfriends-check {
        display: flex;
        align-items: center;
        gap: 12px;
        min-height: 42px;
        border-radius: 8px;
        padding: 6px 2px;
        color: #394955;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
      }
      .wordfriends-check input[type="checkbox"] {
        flex: 0 0 20px;
        width: 20px;
        height: 20px;
        margin: 0;
        accent-color: #1f8a70;
        cursor: pointer;
      }
      .wordfriends-check span {
        line-height: 1.5;
      }
      .wordfriends-button {
        min-height: 46px;
        border: 0;
        border-radius: 8px;
        padding: 0 18px;
        background: #1f8a70;
        color: #fff;
        cursor: pointer;
        font-weight: 800;
      }
      .wordfriends-button.wordfriends-button-secondary {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 160px;
        text-decoration: none;
        background: #17212b;
      }
      .wordfriends-auth-notice {
        margin-bottom: 16px;
        border-radius: 8px;
        padding: 12px;
        background: #eef6ff;
        color: #173a59;
      }
      .wordfriends-auth-error {
        margin-bottom: 16px;
        border-radius: 8px;
        padding: 12px;
        background: #fff1f0;
        color: #8a1f17;
      }
      .wordfriends-auth-success {
        margin-bottom: 16px;
        border-radius: 8px;
        padding: 12px;
        background: #ecfdf5;
        color: #166534;
      }
      .wordfriends-auth-small {
        color: #697985;
        font-size: 13px;
      }
      .wordfriends-question-list {
        display: grid;
        gap: 14px;
        margin-top: 18px;
      }
      .wordfriends-question-card {
        border: 1px solid #d9e2e7;
        border-radius: 8px;
        padding: 16px;
        background: #f8fbfc;
      }
      .wordfriends-question-card header {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 10px;
      }
      .wordfriends-question-card h3 {
        margin: 0;
        font-size: 17px;
        line-height: 1.35;
      }
      .wordfriends-question-status {
        border-radius: 999px;
        padding: 4px 10px;
        background: #e8f5f1;
        color: #126451;
        font-size: 13px;
        font-weight: 800;
      }
      .wordfriends-question-answer {
        margin-top: 12px;
        border-left: 3px solid #1f8a70;
        padding: 10px 12px;
        background: #fff;
      }
      .wordfriends-empty {
        border: 1px dashed #c7d4dc;
        border-radius: 8px;
        padding: 18px;
        background: #fbfdfe;
      }
      .wordfriends-site-grid {
        display: grid;
        gap: 14px;
        margin-top: 18px;
      }
      .wordfriends-site-card {
        border: 1px solid #d9e2e7;
        border-radius: 8px;
        padding: 16px;
        background: #f8fbfc;
      }
      .wordfriends-site-card header {
        display: flex;
        flex-wrap: wrap;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 12px;
      }
      .wordfriends-site-card h3 {
        margin: 0;
        font-size: 18px;
        line-height: 1.35;
      }
      .wordfriends-site-meta {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        gap: 10px;
        margin-top: 12px;
      }
      .wordfriends-site-meta span {
        display: grid;
        gap: 3px;
        border-radius: 8px;
        padding: 10px;
        background: #fff;
        color: #17212b;
      }
      .wordfriends-site-meta small {
        color: #64748b;
        font-size: 12px;
        font-weight: 800;
      }
      .wordfriends-site-progress {
        margin-top: 12px;
      }
      .wordfriends-site-progress-track {
        overflow: hidden;
        height: 9px;
        border-radius: 999px;
        background: #d9e2e7;
      }
      .wordfriends-site-progress-fill {
        display: block;
        height: 100%;
        border-radius: inherit;
        background: #1f8a70;
      }
      .wordfriends-site-note {
        margin-top: 12px;
        border-left: 3px solid #1f8a70;
        padding: 10px 12px;
        background: #fff;
      }
      .wordfriends-site-card a.wordfriends-site-link {
        color: #126451;
        font-weight: 800;
        text-decoration: underline;
        text-underline-offset: 3px;
      }
      .wordfriends-summary-row {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 10px;
        margin: 18px 0;
      }
      .wordfriends-summary-box {
        border-radius: 8px;
        padding: 14px;
        background: #f8fbfc;
        border: 1px solid #d9e2e7;
      }
      .wordfriends-summary-box small {
        display: block;
        margin-bottom: 5px;
        color: #64748b;
        font-size: 12px;
        font-weight: 800;
      }
      .wordfriends-summary-box strong {
        font-size: 18px;
      }
      .wordfriends-dashboard-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 12px;
        margin: 18px 0;
      }
      .wordfriends-dashboard-card {
        display: grid;
        gap: 8px;
        border: 1px solid #d9e2e7;
        border-radius: 8px;
        padding: 16px;
        background: #f8fbfc;
        color: #17212b;
        text-decoration: none;
      }
      .wordfriends-dashboard-card:hover {
        border-color: #1f8a70;
      }
      .wordfriends-dashboard-card small {
        color: #64748b;
        font-size: 12px;
        font-weight: 800;
      }
      .wordfriends-dashboard-card strong {
        font-size: 22px;
      }
      .wordfriends-dashboard-card span {
        color: #5b6872;
        line-height: 1.5;
      }
      .wordfriends-table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 12px;
      }
      .wordfriends-table th,
      .wordfriends-table td {
        border-bottom: 1px solid #d9e2e7;
        padding: 10px 8px;
        text-align: left;
        vertical-align: top;
      }
      .wordfriends-table th {
        color: #64748b;
        font-size: 12px;
      }
      .wordfriends-pagination {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: 16px;
      }
      .wordfriends-pagination a,
      .wordfriends-pagination span {
        min-width: 34px;
        min-height: 34px;
        border-radius: 8px;
        border: 1px solid #d9e2e7;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 6px 10px;
        color: #17212b;
        text-decoration: none;
        font-size: 14px;
        font-weight: 800;
      }
      .wordfriends-pagination .is-active {
        background: #248f73;
        border-color: #248f73;
        color: #fff;
      }
      .wordfriends-pagination .is-muted {
        color: #94a3b8;
        font-weight: 700;
      }
      .wordfriends-optional {
        color: #64748b;
        font-size: 13px;
        font-weight: 700;
      }
    ');
}
add_action('wp_enqueue_scripts', 'wordfriends_siteops_portal_styles');

function wordfriends_siteops_redirect_url($atts) {
    $redirect = isset($atts['redirect']) ? esc_url_raw($atts['redirect']) : '';

    if ($redirect) {
        return $redirect;
    }

    return wordfriends_siteops_dashboard_page_url();
}

function wordfriends_siteops_paginate_items($items, $param, $per_page = 5) {
    $items = is_array($items) ? array_values($items) : [];
    $total = count($items);
    $per_page = max(1, min(20, absint($per_page)));
    $total_pages = max(1, (int) ceil($total / $per_page));
    $current_page = max(1, absint($_GET[$param] ?? 1));
    $current_page = min($current_page, $total_pages);
    $offset = ($current_page - 1) * $per_page;

    return [
        'items' => array_slice($items, $offset, $per_page),
        'page' => $current_page,
        'perPage' => $per_page,
        'total' => $total,
        'totalPages' => $total_pages,
    ];
}

function wordfriends_siteops_render_pagination($pagination, $param) {
    $total_pages = (int) ($pagination['totalPages'] ?? 1);
    $current_page = (int) ($pagination['page'] ?? 1);

    if ($total_pages <= 1) {
        return '';
    }

    $html = '<nav class="wordfriends-pagination" aria-label="페이지 이동">';
    $html .= $current_page > 1
        ? '<a href="' . esc_url(add_query_arg($param, $current_page - 1)) . '">이전</a>'
        : '<span class="is-muted">이전</span>';

    for ($page = 1; $page <= $total_pages; $page += 1) {
        if ($page !== 1 && $page !== $total_pages && abs($page - $current_page) > 2) {
            if ($page === 2 || $page === $total_pages - 1) {
                $html .= '<span class="is-muted">…</span>';
            }
            continue;
        }

        $html .= $page === $current_page
            ? '<span class="is-active">' . esc_html((string) $page) . '</span>'
            : '<a href="' . esc_url(add_query_arg($param, $page)) . '">' . esc_html((string) $page) . '</a>';
    }

    $html .= $current_page < $total_pages
        ? '<a href="' . esc_url(add_query_arg($param, $current_page + 1)) . '">다음</a>'
        : '<span class="is-muted">다음</span>';
    $html .= '</nav>';

    return $html;
}

function wordfriends_siteops_handle_auth_posts() {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        return;
    }

    if (isset($_POST['wordfriends_signup_action'])) {
        $_POST['wordfriends_signup_action_processed'] = '1';
        $GLOBALS['wordfriends_signup_message'] = '';
        $GLOBALS['wordfriends_signup_error'] = '';

        if (!isset($_POST['wordfriends_signup_nonce']) || !wp_verify_nonce(sanitize_text_field(wp_unslash($_POST['wordfriends_signup_nonce'])), 'wordfriends_signup')) {
            $GLOBALS['wordfriends_signup_error'] = '보안 확인에 실패했습니다. 새로고침 후 다시 시도해 주세요.';
            return;
        }

        $name = sanitize_text_field(wp_unslash($_POST['wordfriends_name'] ?? ''));
        $email = sanitize_email(wp_unslash($_POST['wordfriends_email'] ?? ''));
        $password = (string) ($_POST['wordfriends_password'] ?? '');
        $agree = isset($_POST['wordfriends_agree']);

        if (!$name || !$email || !$password) {
            $GLOBALS['wordfriends_signup_error'] = '이름, 이메일, 비밀번호를 모두 입력해 주세요.';
            return;
        }

        if (!$agree) {
            $GLOBALS['wordfriends_signup_error'] = '약관과 개인정보처리방침 동의가 필요합니다.';
            return;
        }

        if (!is_email($email)) {
            $GLOBALS['wordfriends_signup_error'] = '이메일 형식을 확인해 주세요.';
            return;
        }

        if (email_exists($email)) {
            $GLOBALS['wordfriends_signup_error'] = '이미 등록된 이메일입니다. 로그인 화면을 이용해 주세요.';
            return;
        }

        $user_id = wp_create_user($email, $password, $email);

        if (is_wp_error($user_id)) {
            $GLOBALS['wordfriends_signup_error'] = $user_id->get_error_message();
            return;
        }

        wp_update_user([
            'ID' => $user_id,
            'display_name' => $name,
            'first_name' => $name,
        ]);

        $user = new WP_User($user_id);
        $user->set_role('subscriber');

        $customer_code = 'WF-' . str_pad((string) $user_id, 6, '0', STR_PAD_LEFT);
        update_user_meta($user_id, 'customer_code', $customer_code);
        update_user_meta($user_id, 'wordfriends_signup_source', 'shortcode');

        wordfriends_siteops_send('/api/wordfriends/events', [
            'eventType' => 'signup_completed',
            'customerCode' => $customer_code,
            'sessionId' => isset($_COOKIE['wordfriends_session_id']) ? sanitize_text_field(wp_unslash($_COOKIE['wordfriends_session_id'])) : '',
            'pagePath' => isset($_SERVER['REQUEST_URI']) ? esc_url_raw(wp_unslash($_SERVER['REQUEST_URI'])) : '',
            'payload' => [
                'wpUserId' => $user_id,
                'emailHash' => wp_hash($email),
            ],
        ]);

        wp_new_user_notification($user_id, null, 'admin');
        $GLOBALS['wordfriends_signup_message'] = '가입이 완료되었습니다. 이제 로그인해 주세요.';
        return;
    }

    if (isset($_POST['wordfriends_login_action'])) {
        $_POST['wordfriends_login_action_processed'] = '1';
        $GLOBALS['wordfriends_login_error'] = '';

        if (!isset($_POST['wordfriends_login_nonce']) || !wp_verify_nonce(sanitize_text_field(wp_unslash($_POST['wordfriends_login_nonce'])), 'wordfriends_login')) {
            $GLOBALS['wordfriends_login_error'] = '보안 확인에 실패했습니다. 새로고침 후 다시 시도해 주세요.';
            return;
        }

        $credentials = [
            'user_login' => sanitize_user(wp_unslash($_POST['wordfriends_login_email'] ?? '')),
            'user_password' => (string) ($_POST['wordfriends_login_password'] ?? ''),
            'remember' => isset($_POST['wordfriends_remember']),
        ];

        $user = wp_signon($credentials, is_ssl());

        if (is_wp_error($user)) {
            $GLOBALS['wordfriends_login_error'] = '이메일 또는 비밀번호를 확인해 주세요.';
            return;
        }

        $redirect = isset($_POST['wordfriends_redirect']) ? esc_url_raw(wp_unslash($_POST['wordfriends_redirect'])) : home_url('/');
        wp_safe_redirect($redirect ?: home_url('/'));
        exit;
    }

    if (isset($_POST['wordfriends_question_action'])) {
        $_POST['wordfriends_question_action_processed'] = '1';
        $GLOBALS['wordfriends_question_message'] = '';
        $GLOBALS['wordfriends_question_error'] = '';

        if (!isset($_POST['wordfriends_question_nonce']) || !wp_verify_nonce(sanitize_text_field(wp_unslash($_POST['wordfriends_question_nonce'])), 'wordfriends_question')) {
            $GLOBALS['wordfriends_question_error'] = '보안 확인에 실패했습니다. 새로고침 후 다시 시도해 주세요.';
            return;
        }

        $category = sanitize_key(wp_unslash($_POST['wordfriends_question_category'] ?? 'general'));
        $allowed_categories = ['general', 'settlement', 'contract', 'adsense', 'tax', 'policy', 'technical'];

        if (!in_array($category, $allowed_categories, true)) {
            $category = 'general';
        }

        $question = sanitize_textarea_field(wp_unslash($_POST['wordfriends_question_body'] ?? ''));
        $name = sanitize_text_field(wp_unslash($_POST['wordfriends_question_name'] ?? ''));
        $email = sanitize_email(wp_unslash($_POST['wordfriends_question_email'] ?? ''));
        $phone = sanitize_text_field(wp_unslash($_POST['wordfriends_question_phone'] ?? ''));
        $current_user = is_user_logged_in() ? wp_get_current_user() : null;

        if ($current_user && $current_user->ID) {
            $name = sanitize_text_field($current_user->display_name ?: $current_user->user_login);
            $email = sanitize_email($current_user->user_email);
        }

        if (mb_strlen($question) < 3) {
            $GLOBALS['wordfriends_question_error'] = '문의 내용을 입력해 주세요.';
            return;
        }

        if (!is_user_logged_in() && (!$name || !$email || !is_email($email))) {
            $GLOBALS['wordfriends_question_error'] = '답변을 받을 이름과 이메일을 입력해 주세요.';
            return;
        }

        $contact_lines = [];

        if ($name) {
            $contact_lines[] = "문의자: {$name}";
        }

        if ($email) {
            $contact_lines[] = "이메일: {$email}";
        }

        if ($phone) {
            $contact_lines[] = "전화번호: {$phone}";
        }

        $contact_note = $contact_lines ? implode("\n", $contact_lines) . "\n\n" : '';

        $session_id = isset($_COOKIE['wordfriends_session_id']) ? sanitize_text_field(wp_unslash($_COOKIE['wordfriends_session_id'])) : '';
        $dedupe_key = 'wordfriends_question_' . md5(wp_json_encode([
            'category' => $category,
            'question' => $question,
            'name' => $name,
            'email' => $email,
            'phone' => $phone,
            'userId' => get_current_user_id(),
            'sessionId' => $session_id,
        ]));

        if (get_transient($dedupe_key)) {
            $GLOBALS['wordfriends_question_message'] = '문의가 접수되었습니다. 담당자가 확인 후 안내드리겠습니다.';
            return;
        }

        set_transient($dedupe_key, 1, 2 * MINUTE_IN_SECONDS);

        $result = wordfriends_siteops_send('/api/wordfriends/questions', [
            'question' => $contact_note . $question,
            'category' => $category,
            'customerCode' => wordfriends_siteops_customer_code(),
            'requesterName' => $name,
            'requesterEmail' => $email,
            'requesterPhone' => $phone,
            'sessionId' => $session_id,
            'pagePath' => isset($_SERVER['REQUEST_URI']) ? esc_url_raw(wp_unslash($_SERVER['REQUEST_URI'])) : '',
            'answerSummary' => is_user_logged_in() ? 'Wordfriends 로그인 고객 문의' : 'Wordfriends 비로그인 상담 문의',
        ]);

        if (is_wp_error($result)) {
            delete_transient($dedupe_key);
            $GLOBALS['wordfriends_question_error'] = '문의 접수 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';
            return;
        }

        $response_code = wp_remote_retrieve_response_code($result);

        if ($response_code < 200 || $response_code >= 300) {
            delete_transient($dedupe_key);
            $GLOBALS['wordfriends_question_error'] = '문의 접수 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';
            return;
        }

        $GLOBALS['wordfriends_question_message'] = '문의가 접수되었습니다. 담당자가 확인 후 안내드리겠습니다.';
    }
    if (isset($_POST['wordfriends_contract_request_action'])) {
        $_POST['wordfriends_contract_request_action_processed'] = '1';
        $GLOBALS['wordfriends_contract_request_message'] = '';
        $GLOBALS['wordfriends_contract_request_error'] = '';

        if (!isset($_POST['wordfriends_contract_request_nonce']) || !wp_verify_nonce(sanitize_text_field(wp_unslash($_POST['wordfriends_contract_request_nonce'])), 'wordfriends_contract_request')) {
            $GLOBALS['wordfriends_contract_request_error'] = '보안 확인에 실패했습니다. 새로고침 후 다시 시도해 주세요.';
            return;
        }

        $name = sanitize_text_field(wp_unslash($_POST['wordfriends_contract_name'] ?? ''));
        $email = sanitize_email(wp_unslash($_POST['wordfriends_contract_email'] ?? ''));
        $phone = sanitize_text_field(wp_unslash($_POST['wordfriends_contract_phone'] ?? ''));
        $domain_count = max(1, min(100, absint($_POST['wordfriends_contract_domain_count'] ?? 1)));
        $request_message = sanitize_textarea_field(wp_unslash($_POST['wordfriends_contract_message'] ?? ''));
        $current_user = is_user_logged_in() ? wp_get_current_user() : null;

        if ($current_user && $current_user->ID) {
            $name = sanitize_text_field($current_user->display_name ?: $current_user->user_login);
            $email = sanitize_email($current_user->user_email);
        }

        if (!$name || !$email || !is_email($email)) {
            $GLOBALS['wordfriends_contract_request_error'] = '계약 안내를 받을 이름과 이메일을 입력해 주세요.';
            return;
        }

        $session_id = isset($_COOKIE['wordfriends_session_id']) ? sanitize_text_field(wp_unslash($_COOKIE['wordfriends_session_id'])) : '';
        $dedupe_key = 'wordfriends_contract_request_' . md5(wp_json_encode([
            'name' => $name,
            'email' => $email,
            'phone' => $phone,
            'domainCount' => $domain_count,
            'userId' => get_current_user_id(),
            'sessionId' => $session_id,
        ]));

        if (get_transient($dedupe_key)) {
            $GLOBALS['wordfriends_contract_request_message'] = '계약 요청이 접수되었습니다. 담당자가 확인 후 안내드리겠습니다.';
            return;
        }

        set_transient($dedupe_key, 1, 2 * MINUTE_IN_SECONDS);

        $result = wordfriends_siteops_send('/api/wordfriends/contracts', [
            'customerCode' => wordfriends_siteops_customer_code(),
            'requesterName' => $name,
            'requesterEmail' => $email,
            'requesterPhone' => $phone,
            'desiredDomainCount' => $domain_count,
            'requestMessage' => $request_message,
            'sessionId' => $session_id,
            'pagePath' => isset($_SERVER['REQUEST_URI']) ? esc_url_raw(wp_unslash($_SERVER['REQUEST_URI'])) : '',
        ]);

        if (is_wp_error($result)) {
            delete_transient($dedupe_key);
            $GLOBALS['wordfriends_contract_request_error'] = '계약 요청 접수 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';
            return;
        }

        $response_code = wp_remote_retrieve_response_code($result);

        if ($response_code < 200 || $response_code >= 300) {
            delete_transient($dedupe_key);
            $GLOBALS['wordfriends_contract_request_error'] = '계약 요청 접수 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';
            return;
        }

        $GLOBALS['wordfriends_contract_request_message'] = '계약 요청이 접수되었습니다. 담당자가 확인 후 전자계약 안내를 드립니다.';
    }
}
add_action('init', 'wordfriends_siteops_handle_auth_posts');

function wordfriends_siteops_signup_shortcode($atts = []) {
    $atts = shortcode_atts([
        'redirect' => '',
        'title' => 'Wordfriends 시작하기',
        'subtitle' => '고객 소유 사이트 운영대행 상담과 계약 진행을 위한 계정을 만듭니다.',
    ], $atts, 'wordfriends_signup');

    if (is_user_logged_in()) {
        return wordfriends_siteops_dashboard_shortcode([
            'title' => '고객 포털',
            'subtitle' => '내 사이트, 문의, 정산/추천, 알림 상태를 한 번에 확인할 수 있습니다.',
        ]);
    }

    $message = $GLOBALS['wordfriends_signup_message'] ?? '';
    $error = $GLOBALS['wordfriends_signup_error'] ?? '';
    $terms_url = wordfriends_siteops_terms_page_url();
    $privacy_url = wordfriends_siteops_privacy_page_url();

    if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['wordfriends_signup_action']) && empty($_POST['wordfriends_signup_action_processed'])) {
        if (!isset($_POST['wordfriends_signup_nonce']) || !wp_verify_nonce(sanitize_text_field(wp_unslash($_POST['wordfriends_signup_nonce'])), 'wordfriends_signup')) {
            $error = '보안 확인에 실패했습니다. 새로고침 후 다시 시도해 주세요.';
        } else {
            $name = sanitize_text_field(wp_unslash($_POST['wordfriends_name'] ?? ''));
            $email = sanitize_email(wp_unslash($_POST['wordfriends_email'] ?? ''));
            $password = (string) ($_POST['wordfriends_password'] ?? '');
            $agree = isset($_POST['wordfriends_agree']);

            if (!$name || !$email || !$password) {
                $error = '이름, 이메일, 비밀번호를 모두 입력해 주세요.';
            } elseif (!$agree) {
                $error = '약관과 개인정보처리방침 동의가 필요합니다.';
            } elseif (!is_email($email)) {
                $error = '이메일 형식을 확인해 주세요.';
            } elseif (email_exists($email)) {
                $error = '이미 등록된 이메일입니다. 로그인 화면을 이용해 주세요.';
            } else {
                $user_id = wp_create_user($email, $password, $email);

                if (is_wp_error($user_id)) {
                    $error = $user_id->get_error_message();
                } else {
                    wp_update_user([
                        'ID' => $user_id,
                        'display_name' => $name,
                        'first_name' => $name,
                    ]);

                    $user = new WP_User($user_id);
                    $user->set_role('subscriber');

                    $customer_code = 'WF-' . str_pad((string) $user_id, 6, '0', STR_PAD_LEFT);
                    update_user_meta($user_id, 'customer_code', $customer_code);
                    update_user_meta($user_id, 'wordfriends_signup_source', 'shortcode');

                    wordfriends_siteops_send('/api/wordfriends/events', [
                        'eventType' => 'signup_completed',
                        'customerCode' => $customer_code,
                        'sessionId' => isset($_COOKIE['wordfriends_session_id']) ? sanitize_text_field(wp_unslash($_COOKIE['wordfriends_session_id'])) : '',
                        'pagePath' => isset($_SERVER['REQUEST_URI']) ? esc_url_raw(wp_unslash($_SERVER['REQUEST_URI'])) : '',
                        'payload' => [
                            'wpUserId' => $user_id,
                            'emailHash' => wp_hash($email),
                        ],
                    ]);

                    wp_new_user_notification($user_id, null, 'admin');
                    $message = '가입이 완료되었습니다. 이제 로그인해 주세요.';
                }
            }
        }
    }

    ob_start();
    ?>
    <section class="wordfriends-auth">
      <h2><?php echo esc_html($atts['title']); ?></h2>
      <p><?php echo esc_html($atts['subtitle']); ?></p>
      <?php if ($message) : ?>
        <div class="wordfriends-auth-notice"><?php echo esc_html($message); ?></div>
      <?php endif; ?>
      <?php if ($error) : ?>
        <div class="wordfriends-auth-error"><?php echo esc_html($error); ?></div>
      <?php endif; ?>
      <form method="post" data-siteops-event="signup_started">
        <?php wp_nonce_field('wordfriends_signup', 'wordfriends_signup_nonce'); ?>
        <input type="hidden" name="wordfriends_signup_action" value="1" />
        <div class="wordfriends-fieldset">
          <label>
            이름
            <input type="text" name="wordfriends_name" autocomplete="name" required />
          </label>
          <label>
            이메일
            <input type="email" name="wordfriends_email" autocomplete="email" required />
          </label>
          <label>
            비밀번호
            <input type="password" name="wordfriends_password" autocomplete="new-password" required minlength="8" />
          </label>
          <label class="wordfriends-check">
            <input type="checkbox" name="wordfriends_agree" value="1" required />
            <span>
              <a href="<?php echo esc_url($terms_url); ?>" target="_blank" rel="noopener">이용약관</a>과
              <a href="<?php echo esc_url($privacy_url); ?>" target="_blank" rel="noopener">개인정보처리방침</a>에 동의합니다.
            </span>
          </label>
        </div>
        <button class="wordfriends-button" type="submit">회원가입</button>
      </form>
      <p class="wordfriends-auth-small">수익, 애드센스 승인, 트래픽은 보장하지 않으며 운영 현황은 고객 계정 기준으로 안내됩니다.</p>
    </section>
    <?php
    return ob_get_clean();
}
add_shortcode('wordfriends_signup', 'wordfriends_siteops_signup_shortcode');

function wordfriends_siteops_login_shortcode($atts = []) {
    $atts = shortcode_atts([
        'redirect' => '',
        'title' => 'Wordfriends 로그인',
        'subtitle' => '계약, 내 사이트 현황, 정산 안내를 확인하기 위한 고객 로그인입니다.',
    ], $atts, 'wordfriends_login');

    if (is_user_logged_in()) {
        return wordfriends_siteops_dashboard_shortcode([
            'title' => '고객 포털',
            'subtitle' => '내 사이트, 문의, 정산/추천, 알림 상태를 한 번에 확인할 수 있습니다.',
        ]);
    }

    $error = $GLOBALS['wordfriends_login_error'] ?? '';

    if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['wordfriends_login_action']) && empty($_POST['wordfriends_login_action_processed'])) {
        if (!isset($_POST['wordfriends_login_nonce']) || !wp_verify_nonce(sanitize_text_field(wp_unslash($_POST['wordfriends_login_nonce'])), 'wordfriends_login')) {
            $error = '보안 확인에 실패했습니다. 새로고침 후 다시 시도해 주세요.';
        } else {
            $credentials = [
                'user_login' => sanitize_user(wp_unslash($_POST['wordfriends_login_email'] ?? '')),
                'user_password' => (string) ($_POST['wordfriends_login_password'] ?? ''),
                'remember' => isset($_POST['wordfriends_remember']),
            ];

            $user = wp_signon($credentials, is_ssl());

            if (is_wp_error($user)) {
                $error = '이메일 또는 비밀번호를 확인해 주세요.';
            } else {
                wp_safe_redirect(wordfriends_siteops_redirect_url($atts));
                exit;
            }
        }
    }

    ob_start();
    ?>
    <section class="wordfriends-auth">
      <h2><?php echo esc_html($atts['title']); ?></h2>
      <p><?php echo esc_html($atts['subtitle']); ?></p>
      <?php if ($error) : ?>
        <div class="wordfriends-auth-error"><?php echo esc_html($error); ?></div>
      <?php endif; ?>
      <form method="post" data-siteops-event="login_started">
        <?php wp_nonce_field('wordfriends_login', 'wordfriends_login_nonce'); ?>
        <input type="hidden" name="wordfriends_login_action" value="1" />
        <input type="hidden" name="wordfriends_redirect" value="<?php echo esc_url(wordfriends_siteops_redirect_url($atts)); ?>" />
        <div class="wordfriends-fieldset">
          <label>
            이메일
            <input type="email" name="wordfriends_login_email" autocomplete="email" required />
          </label>
          <label>
            비밀번호
            <input type="password" name="wordfriends_login_password" autocomplete="current-password" required />
          </label>
          <label class="wordfriends-check">
            <input type="checkbox" name="wordfriends_remember" value="1" />
            <span>로그인 상태 유지</span>
          </label>
        </div>
        <button class="wordfriends-button" type="submit">로그인</button>
      </form>
    </section>
    <?php
    return ob_get_clean();
}
add_shortcode('wordfriends_login', 'wordfriends_siteops_login_shortcode');

function wordfriends_siteops_logout_shortcode($atts = []) {
    $atts = shortcode_atts([
        'redirect' => home_url('/login/'),
    ], $atts, 'wordfriends_logout');

    if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['wordfriends_logout_action'])) {
        if (isset($_POST['wordfriends_logout_nonce']) && wp_verify_nonce(sanitize_text_field(wp_unslash($_POST['wordfriends_logout_nonce'])), 'wordfriends_customer_logout')) {
            $redirect = isset($_POST['wordfriends_redirect']) ? esc_url_raw(wp_unslash($_POST['wordfriends_redirect'])) : wordfriends_siteops_login_page_url();
            wp_logout();
            wp_safe_redirect($redirect ?: wordfriends_siteops_login_page_url());
            exit;
        }
    }

    if (!is_user_logged_in()) {
        return '<div class="wordfriends-auth"><h2>로그아웃 상태입니다.</h2><p>고객 계정으로 다시 이용하려면 상단의 로그인 메뉴를 이용해 주세요.</p></div>';
    }

    $redirect = esc_url_raw($atts['redirect']);
    $form_id = 'wordfriends-auto-logout-' . wp_generate_uuid4();

    return '<div class="wordfriends-auth"><h2>로그아웃 처리 중입니다.</h2><p>잠시만 기다려 주세요. 로그인 화면으로 이동합니다.</p><form id="' . esc_attr($form_id) . '" method="post" style="display:none"><input type="hidden" name="wordfriends_logout_action" value="1" /><input type="hidden" name="wordfriends_redirect" value="' . esc_url($redirect ?: home_url('/login/')) . '" />' . wp_nonce_field('wordfriends_customer_logout', 'wordfriends_logout_nonce', true, false) . '</form><script>(function(){var form=document.getElementById("' . esc_js($form_id) . '");if(form){form.submit();}}());</script></div>';
}
add_shortcode('wordfriends_logout', 'wordfriends_siteops_logout_shortcode');

function wordfriends_siteops_question_shortcode($atts = []) {
    $atts = shortcode_atts([
        'title' => '문의 / AI 상담',
        'subtitle' => '정산, 계약, 애드센스, 사이트 운영 문의를 남겨 주세요. 정책·세금·수익 관련 질문은 담당자 검토 후 안내됩니다.',
        'category' => 'general',
    ], $atts, 'wordfriends_question');

    $message = $GLOBALS['wordfriends_question_message'] ?? '';
    $error = $GLOBALS['wordfriends_question_error'] ?? '';
    $selected_category = sanitize_key($atts['category']);
    $categories = [
        'general' => '일반 문의',
        'contract' => '계약',
        'settlement' => '정산',
        'adsense' => '애드센스',
        'tax' => '세금',
        'policy' => '정책/약관',
        'technical' => '기술 지원',
    ];

    if (!isset($categories[$selected_category])) {
        $selected_category = 'general';
    }

    $user = is_user_logged_in() ? wp_get_current_user() : null;

    ob_start();
    ?>
    <section class="wordfriends-auth">
      <h2><?php echo esc_html($atts['title']); ?></h2>
      <p><?php echo esc_html($atts['subtitle']); ?></p>
      <?php if ($message) : ?>
        <div class="wordfriends-auth-success"><?php echo esc_html($message); ?></div>
      <?php endif; ?>
      <?php if ($error) : ?>
        <div class="wordfriends-auth-error"><?php echo esc_html($error); ?></div>
      <?php endif; ?>
      <form method="post" data-siteops-question-form data-siteops-question-category="<?php echo esc_attr($selected_category); ?>">
        <?php wp_nonce_field('wordfriends_question', 'wordfriends_question_nonce'); ?>
        <input type="hidden" name="wordfriends_question_action" value="1" />
        <div class="wordfriends-fieldset">
          <?php if (!$user) : ?>
            <label>
              이름
              <input type="text" name="wordfriends_question_name" autocomplete="name" required />
            </label>
            <label>
              이메일
              <input type="email" name="wordfriends_question_email" autocomplete="email" required />
            </label>
            <label>
              전화번호 <span class="wordfriends-optional">(선택)</span>
              <input type="tel" name="wordfriends_question_phone" autocomplete="tel" inputmode="tel" placeholder="010-0000-0000" />
            </label>
          <?php else : ?>
            <p class="wordfriends-auth-small"><?php echo esc_html($user->display_name ?: $user->user_login); ?> 계정으로 문의가 접수됩니다.</p>
          <?php endif; ?>
          <label>
            문의 분류
            <select name="wordfriends_question_category">
              <?php foreach ($categories as $value => $label) : ?>
                <option value="<?php echo esc_attr($value); ?>" <?php selected($selected_category, $value); ?>><?php echo esc_html($label); ?></option>
              <?php endforeach; ?>
            </select>
          </label>
          <label>
            문의 내용
            <textarea name="wordfriends_question_body" required placeholder="궁금한 점을 입력해 주세요. 계정 비밀번호, 애드센스 로그인 정보, API 키는 입력하지 마세요."></textarea>
          </label>
        </div>
        <button class="wordfriends-button" type="submit">문의 접수</button>
        <p class="wordfriends-auth-small">수익, 애드센스 승인, 트래픽은 보장하지 않으며 운영 현황과 검토 결과를 기준으로 안내됩니다.</p>
      </form>
    </section>
    <?php
    return ob_get_clean();
}
add_shortcode('wordfriends_question', 'wordfriends_siteops_question_shortcode');

function wordfriends_siteops_contract_status_label($status) {
    $labels = [
        'requested' => '요청 접수',
        'document_sent' => '계약서 발송',
        'signed' => '서명 완료',
        'setup_ready' => '세팅 대기',
        'closed' => '종료',
        'canceled' => '취소',
    ];

    return $labels[$status] ?? '요청 접수';
}

function wordfriends_siteops_contract_request_shortcode($atts = []) {
    $atts = shortcode_atts([
        'title' => '전자계약 요청',
        'subtitle' => '계약 진행을 원하시면 아래 정보를 남겨 주세요. 담당자가 확인 후 전자계약 링크를 안내드립니다.',
    ], $atts, 'wordfriends_contract_request');

    $message = $GLOBALS['wordfriends_contract_request_message'] ?? '';
    $error = $GLOBALS['wordfriends_contract_request_error'] ?? '';
    $user = is_user_logged_in() ? wp_get_current_user() : null;
    $contract_requests = [];

    if ($user && $user->ID) {
        $result = wordfriends_siteops_get('/api/wordfriends/contracts', [
            'customerCode' => wordfriends_siteops_customer_code(),
            'email' => $user->user_email,
        ]);

        if (!is_wp_error($result)) {
            $response_code = wp_remote_retrieve_response_code($result);
            $body = json_decode(wp_remote_retrieve_body($result), true);

            if ($response_code >= 200 && $response_code < 300 && is_array($body) && !empty($body['ok'])) {
                $contract_requests = is_array($body['contractRequests'] ?? null) ? $body['contractRequests'] : [];
            }
        }
    }

    $contract_pagination = wordfriends_siteops_paginate_items($contract_requests, 'wfc_page', 5);
    $contract_requests = $contract_pagination['items'];

    ob_start();
    ?>
    <section class="wordfriends-auth">
      <h2><?php echo esc_html($atts['title']); ?></h2>
      <p><?php echo esc_html($atts['subtitle']); ?></p>
      <?php if ($message) : ?>
        <div class="wordfriends-auth-success"><?php echo esc_html($message); ?></div>
      <?php endif; ?>
      <?php if ($error) : ?>
        <div class="wordfriends-auth-error"><?php echo esc_html($error); ?></div>
      <?php endif; ?>

      <?php if ($contract_requests) : ?>
        <div class="wordfriends-question-list">
          <?php foreach ($contract_requests as $request) : ?>
            <article class="wordfriends-question-card">
              <header>
                <h3><?php echo esc_html($request['statusLabel'] ?? wordfriends_siteops_contract_status_label($request['status'] ?? 'requested')); ?></h3>
                <span class="wordfriends-question-status"><?php echo esc_html($request['desiredDomainCount'] ?? 1); ?>개 도메인</span>
              </header>
              <?php if (!empty($request['publicMessage'])) : ?>
                <p><?php echo nl2br(esc_html($request['publicMessage'])); ?></p>
              <?php endif; ?>
              <?php if (!empty($request['contractDocumentUrl'])) : ?>
                <p><a class="wordfriends-button wordfriends-button-secondary" href="<?php echo esc_url($request['contractDocumentUrl']); ?>" target="_blank" rel="noopener">전자계약 열기</a></p>
              <?php endif; ?>
              <p class="wordfriends-auth-small">최근 갱신: <?php echo esc_html($request['updatedAt'] ?? ''); ?></p>
            </article>
          <?php endforeach; ?>
        </div>
        <?php echo wordfriends_siteops_render_pagination($contract_pagination, 'wfc_page'); ?>
      <?php endif; ?>

      <form method="post" data-siteops-event="contract_started">
        <?php wp_nonce_field('wordfriends_contract_request', 'wordfriends_contract_request_nonce'); ?>
        <input type="hidden" name="wordfriends_contract_request_action" value="1" />
        <div class="wordfriends-fieldset">
          <?php if (!$user) : ?>
            <label>
              이름
              <input type="text" name="wordfriends_contract_name" autocomplete="name" required />
            </label>
            <label>
              이메일
              <input type="email" name="wordfriends_contract_email" autocomplete="email" required />
            </label>
            <label>
              전화번호 <span class="wordfriends-optional">(선택)</span>
              <input type="tel" name="wordfriends_contract_phone" autocomplete="tel" inputmode="tel" placeholder="010-0000-0000" />
            </label>
          <?php else : ?>
            <p class="wordfriends-auth-small"><?php echo esc_html($user->display_name ?: $user->user_login); ?> 계정으로 계약 요청이 접수됩니다.</p>
          <?php endif; ?>
          <label>
            계약 도메인 수
            <input type="number" name="wordfriends_contract_domain_count" min="1" max="100" value="1" required />
          </label>
          <label>
            요청 메모 <span class="wordfriends-optional">(선택)</span>
            <textarea name="wordfriends_contract_message" placeholder="희망 도메인 수, 연락 가능 시간, 계약 관련 요청사항을 남겨 주세요."></textarea>
          </label>
        </div>
        <button class="wordfriends-button" type="submit">전자계약 요청</button>
        <p class="wordfriends-auth-small">정가와 이벤트 조건은 계약서 기준으로 확정됩니다. 수익, 애드센스 승인, 트래픽은 보장하지 않습니다.</p>
      </form>
    </section>
    <?php
    return ob_get_clean();
}
add_shortcode('wordfriends_contract_request', 'wordfriends_siteops_contract_request_shortcode');

function wordfriends_siteops_question_category_label($category) {
    $labels = [
        'general' => '일반 문의',
        'contract' => '계약',
        'settlement' => '정산',
        'adsense' => '애드센스',
        'tax' => '세금',
        'policy' => '정책/약관',
        'technical' => '기술 지원',
    ];

    return $labels[$category] ?? '일반 문의';
}

function wordfriends_siteops_dashboard_shortcode($atts = []) {
    $atts = shortcode_atts([
        'title' => '고객 포털',
        'subtitle' => '내 사이트, 문의, 정산/추천, 알림 상태를 한 번에 확인할 수 있습니다.',
    ], $atts, 'wordfriends_dashboard');

    if (!is_user_logged_in()) {
        return '<section class="wordfriends-auth"><h2>로그인이 필요합니다.</h2><p>고객 포털은 로그인 후 확인할 수 있습니다.</p><a class="wordfriends-button wordfriends-button-secondary" href="' . esc_url(wordfriends_siteops_login_page_url()) . '">로그인</a></section>';
    }

    $user = wp_get_current_user();
    $customer_code = wordfriends_siteops_customer_code();
    $query = [
        'customerCode' => $customer_code,
        'email' => $user->user_email,
    ];

    $sites = [];
    $questions = [];
    $timeline = [];
    $settlements = [];
    $referral_code = null;

    $sites_result = wordfriends_siteops_get('/api/wordfriends/sites', $query);
    if (!is_wp_error($sites_result)) {
        $body = json_decode(wp_remote_retrieve_body($sites_result), true);
        $sites = is_array($body['sites'] ?? null) ? $body['sites'] : [];
    }

    $questions_result = wordfriends_siteops_get('/api/wordfriends/questions', $query);
    if (!is_wp_error($questions_result)) {
        $body = json_decode(wp_remote_retrieve_body($questions_result), true);
        $questions = is_array($body['questions'] ?? null) ? $body['questions'] : [];
    }

    $timeline_result = wordfriends_siteops_get('/api/wordfriends/timeline', $query);
    if (!is_wp_error($timeline_result)) {
        $body = json_decode(wp_remote_retrieve_body($timeline_result), true);
        $timeline = is_array($body['timeline'] ?? null) ? $body['timeline'] : [];
    }

    $settlement_result = wordfriends_siteops_get('/api/wordfriends/settlement-referrals', $query);
    if (!is_wp_error($settlement_result)) {
        $body = json_decode(wp_remote_retrieve_body($settlement_result), true);
        $settlements = is_array($body['settlements'] ?? null) ? $body['settlements'] : [];
        $referral_code = is_array($body['referralCode'] ?? null) ? $body['referralCode'] : null;
    }

    $open_questions = array_filter($questions, function ($question) {
        return !in_array($question['status'] ?? '', ['answered', 'closed'], true);
    });
    $latest_site = $sites[0] ?? null;
    $latest_question = $questions[0] ?? null;
    $latest_notice = $timeline[0] ?? null;
    $latest_settlement = $settlements[0] ?? null;

    ob_start();
    ?>
    <section class="wordfriends-auth">
      <h2><?php echo esc_html($atts['title']); ?></h2>
      <p><?php echo esc_html($atts['subtitle']); ?></p>
      <div class="wordfriends-dashboard-grid">
        <a class="wordfriends-dashboard-card" href="<?php echo esc_url(wordfriends_siteops_my_sites_page_url()); ?>">
          <small>내 사이트</small>
          <strong><?php echo esc_html(count($sites)); ?>개</strong>
          <span><?php echo esc_html($latest_site ? (($latest_site['domain'] ?? '') . ' · ' . ($latest_site['statusLabel'] ?? '준비 중')) : '연결된 사이트가 표시됩니다.'); ?></span>
        </a>
        <a class="wordfriends-dashboard-card" href="<?php echo esc_url(wordfriends_siteops_my_questions_page_url()); ?>">
          <small>내 문의</small>
          <strong><?php echo esc_html(count($open_questions)); ?>건 확인 중</strong>
          <span><?php echo esc_html($latest_question ? (($latest_question['categoryLabel'] ?? '문의') . ' · ' . ($latest_question['statusLabel'] ?? '접수')) : '새 문의와 답변 상태를 확인합니다.'); ?></span>
        </a>
        <a class="wordfriends-dashboard-card" href="<?php echo esc_url(wordfriends_siteops_settlement_referrals_page_url()); ?>">
          <small>정산/추천</small>
          <strong><?php echo esc_html($latest_settlement['statusLabel'] ?? '준비 중'); ?></strong>
          <span><?php echo esc_html($referral_code ? ('추천 코드 ' . ($referral_code['code'] ?? '확인 중')) : '정산 참고와 추천 보상을 확인합니다.'); ?></span>
        </a>
        <a class="wordfriends-dashboard-card" href="<?php echo esc_url(wordfriends_siteops_timeline_page_url()); ?>">
          <small>알림센터</small>
          <strong><?php echo esc_html(count($timeline)); ?>건</strong>
          <span><?php echo esc_html($latest_notice ? (($latest_notice['title'] ?? '알림') . ' · ' . ($latest_notice['statusLabel'] ?? '안내')) : '새 알림이 이곳에 표시됩니다.'); ?></span>
        </a>
      </div>
      <p class="wordfriends-auth-small">수익, 애드센스 승인, 트래픽은 보장하지 않으며 운영 현황과 검토 결과를 기준으로 안내됩니다.</p>
    </section>
    <?php
    return ob_get_clean();
}
add_shortcode('wordfriends_dashboard', 'wordfriends_siteops_dashboard_shortcode');

function wordfriends_siteops_my_questions_shortcode($atts = []) {
    $atts = shortcode_atts([
        'title' => '내 문의',
        'subtitle' => 'Wordfriends에 남긴 문의와 답변 상태를 확인할 수 있습니다.',
    ], $atts, 'wordfriends_my_questions');

    if (!is_user_logged_in()) {
        return '<section class="wordfriends-auth"><h2>로그인이 필요합니다.</h2><p>내 문의와 답변은 로그인 후 확인할 수 있습니다.</p><a class="wordfriends-button wordfriends-button-secondary" href="' . esc_url(wordfriends_siteops_login_page_url()) . '">로그인</a></section>';
    }

    $user = wp_get_current_user();
    $customer_code = wordfriends_siteops_customer_code();
    $result = wordfriends_siteops_get('/api/wordfriends/questions', [
        'customerCode' => $customer_code,
        'email' => $user->user_email,
    ]);

    $error = '';
    $questions = [];

    if (is_wp_error($result)) {
        $error = '문의 목록을 불러오는 중 오류가 발생했습니다. 잠시 후 다시 확인해 주세요.';
    } else {
        $response_code = wp_remote_retrieve_response_code($result);
        $body = json_decode(wp_remote_retrieve_body($result), true);

        if ($response_code < 200 || $response_code >= 300 || !is_array($body) || empty($body['ok'])) {
            $error = '문의 목록을 불러오는 중 오류가 발생했습니다. 잠시 후 다시 확인해 주세요.';
        } else {
            $questions = is_array($body['questions'] ?? null) ? $body['questions'] : [];
        }
    }

    $question_pagination = wordfriends_siteops_paginate_items($questions, 'wfq_page', 5);
    $questions = $question_pagination['items'];

    ob_start();
    ?>
    <section class="wordfriends-auth">
      <h2><?php echo esc_html($atts['title']); ?></h2>
      <p><?php echo esc_html($atts['subtitle']); ?></p>
      <?php if ($error) : ?>
        <div class="wordfriends-auth-error"><?php echo esc_html($error); ?></div>
      <?php elseif (!$questions) : ?>
        <div class="wordfriends-empty">
          <strong>아직 접수된 문의가 없습니다.</strong>
          <p class="wordfriends-auth-small">문의 페이지에서 남긴 내용은 이곳에 표시됩니다.</p>
        </div>
      <?php else : ?>
        <div class="wordfriends-question-list">
          <?php foreach ($questions as $question) : ?>
            <article class="wordfriends-question-card">
              <header>
                <h3><?php echo esc_html(wordfriends_siteops_question_category_label($question['category'] ?? 'general')); ?></h3>
                <span class="wordfriends-question-status"><?php echo esc_html($question['statusLabel'] ?? '접수'); ?></span>
              </header>
              <p><?php echo nl2br(esc_html($question['question'] ?? '')); ?></p>
              <?php if (!empty($question['responseMessage'])) : ?>
                <div class="wordfriends-question-answer">
                  <strong>답변</strong>
                  <p><?php echo nl2br(esc_html($question['responseMessage'])); ?></p>
                </div>
              <?php else : ?>
                <p class="wordfriends-auth-small">담당자가 확인 후 답변을 등록하면 이곳에 표시됩니다.</p>
              <?php endif; ?>
              <p class="wordfriends-auth-small">최근 갱신: <?php echo esc_html($question['updatedAt'] ?? ''); ?></p>
            </article>
          <?php endforeach; ?>
        </div>
        <?php echo wordfriends_siteops_render_pagination($question_pagination, 'wfq_page'); ?>
      <?php endif; ?>
    </section>
    <?php
    return ob_get_clean();
}
add_shortcode('wordfriends_my_questions', 'wordfriends_siteops_my_questions_shortcode');

function wordfriends_siteops_my_sites_shortcode($atts = []) {
    $atts = shortcode_atts([
        'title' => '내 사이트 현황',
        'subtitle' => '고객 소유 사이트의 운영 준비, 콘텐츠, 사이트맵 상태를 확인할 수 있습니다.',
    ], $atts, 'wordfriends_my_sites');

    if (!is_user_logged_in()) {
        return '<section class="wordfriends-auth"><h2>로그인이 필요합니다.</h2><p>내 사이트 현황은 로그인 후 확인할 수 있습니다.</p><a class="wordfriends-button wordfriends-button-secondary" href="' . esc_url(wordfriends_siteops_login_page_url()) . '">로그인</a></section>';
    }

    $user = wp_get_current_user();
    $customer_code = wordfriends_siteops_customer_code();
    $result = wordfriends_siteops_get('/api/wordfriends/sites', [
        'customerCode' => $customer_code,
        'email' => $user->user_email,
    ]);

    $error = '';
    $sites = [];

    if (is_wp_error($result)) {
        $error = '사이트 현황을 불러오는 중 오류가 발생했습니다. 잠시 후 다시 확인해 주세요.';
    } else {
        $response_code = wp_remote_retrieve_response_code($result);
        $body = json_decode(wp_remote_retrieve_body($result), true);

        if ($response_code < 200 || $response_code >= 300 || !is_array($body) || empty($body['ok'])) {
            $error = '사이트 현황을 불러오는 중 오류가 발생했습니다. 잠시 후 다시 확인해 주세요.';
        } else {
            $sites = is_array($body['sites'] ?? null) ? $body['sites'] : [];
        }
    }

    $site_pagination = wordfriends_siteops_paginate_items($sites, 'wfsites_page', 4);
    $sites = $site_pagination['items'];

    ob_start();
    ?>
    <section class="wordfriends-auth">
      <h2><?php echo esc_html($atts['title']); ?></h2>
      <p><?php echo esc_html($atts['subtitle']); ?></p>
      <?php if ($error) : ?>
        <div class="wordfriends-auth-error"><?php echo esc_html($error); ?></div>
      <?php elseif (!$sites) : ?>
        <div class="wordfriends-empty">
          <strong>연결된 사이트가 아직 없습니다.</strong>
          <p class="wordfriends-auth-small">계약과 세팅이 진행되면 이곳에 사이트 현황이 표시됩니다.</p>
        </div>
      <?php else : ?>
        <div class="wordfriends-site-grid">
          <?php foreach ($sites as $site) : ?>
            <?php
              $progress = max(0, min(100, intval($site['progressPercent'] ?? 0)));
              $content = is_array($site['content'] ?? null) ? $site['content'] : [];
              $sitemap = is_array($site['sitemap'] ?? null) ? $site['sitemap'] : [];
              $seo = is_array($site['seo'] ?? null) ? $site['seo'] : [];
            ?>
            <article class="wordfriends-site-card">
              <header>
                <h3><?php echo esc_html($site['domain'] ?? $site['siteName'] ?? 'Wordfriends 사이트'); ?></h3>
                <span class="wordfriends-question-status"><?php echo esc_html($site['statusLabel'] ?? '준비 중'); ?></span>
              </header>
              <?php if (!empty($site['websiteUrl'])) : ?>
                <p class="wordfriends-auth-small"><a class="wordfriends-site-link" href="<?php echo esc_url($site['websiteUrl']); ?>" target="_blank" rel="noopener noreferrer">사이트 열기</a></p>
              <?php endif; ?>
              <div class="wordfriends-site-meta">
                <span><small>콘텐츠</small><?php echo esc_html($site['contentStatus'] ?? '콘텐츠 준비 중'); ?></span>
                <span><small>사이트맵/SEO</small><?php echo esc_html($site['sitemap']['statusLabel'] ?? '준비 중'); ?></span>
                <span><small>애드센스 참고</small><?php echo esc_html($site['seo']['adsenseStatus'] ?? 'not_started'); ?></span>
                <span><small>정산 참고</small><?php echo esc_html($site['settlementStatus'] ?? '정산 준비 중'); ?></span>
              </div>
              <div class="wordfriends-site-meta">
                <span><small>워드프레스</small><?php echo esc_html($site['wpStatusLabel'] ?? '연결 준비'); ?></span>
                <span><small>운영 점검</small><?php echo esc_html($site['riskLabel'] ?? '기본 점검'); ?></span>
                <span><small>애드센스 표시</small><?php echo esc_html($seo['adsenseStatusLabel'] ?? $seo['adsenseStatus'] ?? '준비 중'); ?></span>
                <span><small>사이트맵 확인</small><?php echo esc_html($sitemap['lastCheckedAt'] ?? '확인 전'); ?></span>
              </div>
              <div class="wordfriends-site-progress">
                <div class="wordfriends-site-progress-track" aria-label="콘텐츠 진행률">
                  <span class="wordfriends-site-progress-fill" style="width: <?php echo esc_attr($progress); ?>%;"></span>
                </div>
                <p class="wordfriends-auth-small">
                  콘텐츠 진행률 <?php echo esc_html($progress); ?>%
                  · 발행 <?php echo esc_html(intval($content['publishedCount'] ?? 0)); ?>건
                  · 준비 <?php echo esc_html(intval($content['approvedCount'] ?? 0) + intval($content['inProgressCount'] ?? 0)); ?>건
                </p>
              </div>
              <?php if (!empty($content['latestTitle'])) : ?>
                <div class="wordfriends-site-note">
                  <strong>최근 발행</strong>
                  <p><?php echo esc_html($content['latestTitle']); ?></p>
                  <?php if (!empty($content['latestUrl'])) : ?>
                    <a class="wordfriends-site-link" href="<?php echo esc_url($content['latestUrl']); ?>" target="_blank" rel="noopener noreferrer">게시글 보기</a>
                  <?php endif; ?>
                </div>
              <?php endif; ?>
              <?php if (!empty($site['content']['nextScheduledAt'])) : ?>
                <p class="wordfriends-auth-small">다음 예약: <?php echo esc_html($site['content']['nextScheduledAt']); ?></p>
              <?php endif; ?>
              <p class="wordfriends-auth-small">승인, 트래픽, 수익은 보장되지 않으며 운영 현황과 검토 결과를 기준으로 안내됩니다.</p>
            </article>
          <?php endforeach; ?>
        </div>
        <?php echo wordfriends_siteops_render_pagination($site_pagination, 'wfsites_page'); ?>
      <?php endif; ?>
    </section>
    <?php
    return ob_get_clean();
}
add_shortcode('wordfriends_my_sites', 'wordfriends_siteops_my_sites_shortcode');

function wordfriends_siteops_settlement_referrals_shortcode($atts = []) {
    $atts = shortcode_atts([
        'title' => '정산/추천 현황',
        'subtitle' => '정산 참고 상태와 1단계 추천 보상 현황을 확인할 수 있습니다.',
    ], $atts, 'wordfriends_settlement_referrals');

    if (!is_user_logged_in()) {
        return '<section class="wordfriends-auth"><h2>로그인이 필요합니다.</h2><p>정산/추천 현황은 로그인 후 확인할 수 있습니다.</p><a class="wordfriends-button wordfriends-button-secondary" href="' . esc_url(wordfriends_siteops_login_page_url()) . '">로그인</a></section>';
    }

    $user = wp_get_current_user();
    $customer_code = wordfriends_siteops_customer_code();
    $result = wordfriends_siteops_get('/api/wordfriends/settlement-referrals', [
        'customerCode' => $customer_code,
        'email' => $user->user_email,
    ]);

    $error = '';
    $data = [
        'referralCode' => null,
        'settlements' => [],
        'referralRewards' => [],
        'taxProfile' => [
            'label' => '세무 정보 확인 필요',
            'disclaimer' => '세액과 지급 방식은 참고용이며 최종 처리는 세무 전문가 확인이 필요합니다.',
        ],
    ];

    if (is_wp_error($result)) {
        $error = '정산/추천 현황을 불러오는 중 오류가 발생했습니다. 잠시 후 다시 확인해 주세요.';
    } else {
        $response_code = wp_remote_retrieve_response_code($result);
        $body = json_decode(wp_remote_retrieve_body($result), true);

        if ($response_code < 200 || $response_code >= 300 || !is_array($body) || empty($body['ok'])) {
            $error = '정산/추천 현황을 불러오는 중 오류가 발생했습니다. 잠시 후 다시 확인해 주세요.';
        } else {
            $data = array_merge($data, $body);
        }
    }

    $referral_code = $data['referralCode']['code'] ?? '준비 중';
    $settlements = is_array($data['settlements'] ?? null) ? $data['settlements'] : [];
    $rewards = is_array($data['referralRewards'] ?? null) ? $data['referralRewards'] : [];
    $latest_settlement = $settlements[0] ?? null;
    $settlement_pagination = wordfriends_siteops_paginate_items($settlements, 'wfsettle_page', 5);
    $reward_pagination = wordfriends_siteops_paginate_items($rewards, 'wfreward_page', 5);
    $settlements = $settlement_pagination['items'];
    $rewards = $reward_pagination['items'];

    ob_start();
    ?>
    <section class="wordfriends-auth">
      <h2><?php echo esc_html($atts['title']); ?></h2>
      <p><?php echo esc_html($atts['subtitle']); ?></p>
      <?php if ($error) : ?>
        <div class="wordfriends-auth-error"><?php echo esc_html($error); ?></div>
      <?php else : ?>
        <div class="wordfriends-summary-row">
          <div class="wordfriends-summary-box">
            <small>추천인 코드</small>
            <strong><?php echo esc_html($referral_code); ?></strong>
          </div>
          <div class="wordfriends-summary-box">
            <small>최근 정산 상태</small>
            <strong><?php echo esc_html($latest_settlement['statusLabel'] ?? '정산 준비 중'); ?></strong>
          </div>
          <div class="wordfriends-summary-box">
            <small>세액 참고</small>
            <strong><?php echo esc_html($data['taxProfile']['label'] ?? '세무 정보 확인 필요'); ?></strong>
          </div>
        </div>

        <h3>정산 참고</h3>
        <?php if (!$settlements) : ?>
          <div class="wordfriends-empty">
            <strong>표시할 정산 내역이 아직 없습니다.</strong>
            <p class="wordfriends-auth-small">정산 대상이 확정되면 이곳에 상태가 표시됩니다.</p>
          </div>
        <?php else : ?>
          <table class="wordfriends-table">
            <thead>
              <tr>
                <th>월</th>
                <th>사이트</th>
                <th>예상 정산</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              <?php foreach ($settlements as $settlement) : ?>
                <tr>
                  <td><?php echo esc_html($settlement['month'] ?? ''); ?></td>
                  <td><?php echo esc_html($settlement['domain'] ?? ''); ?></td>
                  <td><?php echo esc_html($settlement['agencyFee'] ?? '0원'); ?></td>
                  <td><?php echo esc_html($settlement['statusLabel'] ?? '정산 준비 중'); ?></td>
                </tr>
              <?php endforeach; ?>
            </tbody>
          </table>
          <?php echo wordfriends_siteops_render_pagination($settlement_pagination, 'wfsettle_page'); ?>
        <?php endif; ?>

        <h3>1단계 추천 보상</h3>
        <?php if (!$rewards) : ?>
          <div class="wordfriends-empty">
            <strong>표시할 추천 보상이 아직 없습니다.</strong>
            <p class="wordfriends-auth-small">추천 계약이 승인되면 1단계 보상 상태가 표시됩니다.</p>
          </div>
        <?php else : ?>
          <table class="wordfriends-table">
            <thead>
              <tr>
                <th>추천 고객</th>
                <th>월</th>
                <th>보상</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              <?php foreach ($rewards as $reward) : ?>
                <tr>
                  <td><?php echo esc_html($reward['referredCustomerCode'] ?? ''); ?></td>
                  <td><?php echo esc_html($reward['rewardMonth'] ?? ''); ?></td>
                  <td><?php echo esc_html($reward['rewardAmount'] ?? '0원'); ?></td>
                  <td><?php echo esc_html($reward['statusLabel'] ?? '검토 중'); ?></td>
                </tr>
              <?php endforeach; ?>
            </tbody>
          </table>
          <?php echo wordfriends_siteops_render_pagination($reward_pagination, 'wfreward_page'); ?>
        <?php endif; ?>

        <p class="wordfriends-auth-small"><?php echo esc_html($data['taxProfile']['disclaimer'] ?? '세액과 지급 방식은 참고용이며 최종 처리는 세무 전문가 확인이 필요합니다.'); ?></p>
        <p class="wordfriends-auth-small">수익, 애드센스 승인, 트래픽은 보장하지 않으며 정산/추천 보상은 계약과 검토 결과를 기준으로 안내됩니다.</p>
      <?php endif; ?>
    </section>
    <?php
    return ob_get_clean();
}
add_shortcode('wordfriends_settlement_referrals', 'wordfriends_siteops_settlement_referrals_shortcode');

function wordfriends_siteops_timeline_shortcode($atts = []) {
    $atts = shortcode_atts([
        'title' => '알림센터',
        'subtitle' => '계약, 문의, 사이트 운영, 정산 관련 최근 진행 상황을 확인할 수 있습니다.',
    ], $atts, 'wordfriends_timeline');

    if (!is_user_logged_in()) {
        return '<section class="wordfriends-auth"><h2>로그인이 필요합니다.</h2><p>알림센터는 로그인 후 확인할 수 있습니다.</p><a class="wordfriends-button wordfriends-button-secondary" href="' . esc_url(wordfriends_siteops_login_page_url()) . '">로그인</a></section>';
    }

    $user = wp_get_current_user();
    $result = wordfriends_siteops_get('/api/wordfriends/timeline', [
        'customerCode' => wordfriends_siteops_customer_code(),
        'email' => $user->user_email,
    ]);

    $error = '';
    $timeline = [];

    if (is_wp_error($result)) {
        $error = '알림을 불러오는 중 오류가 발생했습니다. 잠시 후 다시 확인해 주세요.';
    } else {
        $response_code = wp_remote_retrieve_response_code($result);
        $body = json_decode(wp_remote_retrieve_body($result), true);

        if ($response_code < 200 || $response_code >= 300 || !is_array($body) || empty($body['ok'])) {
            $error = '알림을 불러오는 중 오류가 발생했습니다. 잠시 후 다시 확인해 주세요.';
        } else {
            $timeline = is_array($body['timeline'] ?? null) ? $body['timeline'] : [];
        }
    }

    $timeline_pagination = wordfriends_siteops_paginate_items($timeline, 'wft_page', 5);
    $timeline = $timeline_pagination['items'];

    ob_start();
    ?>
    <section class="wordfriends-auth">
      <h2><?php echo esc_html($atts['title']); ?></h2>
      <p><?php echo esc_html($atts['subtitle']); ?></p>
      <?php if ($error) : ?>
        <div class="wordfriends-auth-error"><?php echo esc_html($error); ?></div>
      <?php elseif (!$timeline) : ?>
        <div class="wordfriends-empty">
          <strong>아직 표시할 알림이 없습니다.</strong>
          <p class="wordfriends-auth-small">계약, 문의, 사이트 운영 상태가 갱신되면 이곳에 표시됩니다.</p>
        </div>
      <?php else : ?>
        <div class="wordfriends-question-list">
          <?php foreach ($timeline as $item) : ?>
            <article class="wordfriends-question-card">
              <header>
                <h3><?php echo esc_html($item['title'] ?? '알림'); ?></h3>
                <span class="wordfriends-question-status"><?php echo esc_html($item['statusLabel'] ?? '안내'); ?></span>
              </header>
              <p><?php echo nl2br(esc_html($item['message'] ?? '')); ?></p>
              <p class="wordfriends-auth-small">
                <?php echo esc_html($item['category'] ?? 'general'); ?> · <?php echo esc_html($item['occurredAt'] ?? ''); ?>
              </p>
            </article>
          <?php endforeach; ?>
        </div>
        <?php echo wordfriends_siteops_render_pagination($timeline_pagination, 'wft_page'); ?>
      <?php endif; ?>
      <p class="wordfriends-auth-small">수익, 애드센스 승인, 트래픽은 보장하지 않으며 운영 현황과 검토 결과를 기준으로 안내됩니다.</p>
    </section>
    <?php
    return ob_get_clean();
}
add_shortcode('wordfriends_timeline', 'wordfriends_siteops_timeline_shortcode');

function wordfriends_siteops_customer_home_url() {
    return wordfriends_siteops_my_sites_page_url();
}

function wordfriends_siteops_portal_page_url($shortcode, $fallback_path, $slugs = []) {
    static $cache = [];

    $cache_key = $shortcode . '|' . $fallback_path;

    if (isset($cache[$cache_key])) {
        return $cache[$cache_key];
    }

    foreach ($slugs as $slug) {
        $page = get_page_by_path($slug);

        if ($page && $page->post_status === 'publish') {
            $cache[$cache_key] = get_permalink($page);
            return $cache[$cache_key];
        }
    }

    $pages = get_posts([
        'post_type' => 'page',
        'post_status' => 'publish',
        'posts_per_page' => 80,
        'fields' => 'ids',
    ]);

    foreach ($pages as $page_id) {
        $content = get_post_field('post_content', $page_id);

        if ($content && has_shortcode($content, $shortcode)) {
            $cache[$cache_key] = get_permalink($page_id);
            return $cache[$cache_key];
        }
    }

    $cache[$cache_key] = home_url($fallback_path);
    return $cache[$cache_key];
}

function wordfriends_siteops_login_page_url() {
    return wordfriends_siteops_portal_page_url('wordfriends_login', '/login/', ['login', '로그인']);
}

function wordfriends_siteops_dashboard_page_url() {
    return wordfriends_siteops_portal_page_url('wordfriends_dashboard', '/login/', ['portal', 'customer-portal', '고객-포털']);
}

function wordfriends_siteops_logout_page_url() {
    return wordfriends_siteops_portal_page_url('wordfriends_logout', '/logout/', ['logout', '로그아웃']);
}

function wordfriends_siteops_question_page_url() {
    return wordfriends_siteops_portal_page_url('wordfriends_question', '/contact/', ['contact', 'inquiry']);
}

function wordfriends_siteops_my_questions_page_url() {
    return wordfriends_siteops_portal_page_url('wordfriends_my_questions', '/my-questions/', ['my-questions', '내-문의']);
}

function wordfriends_siteops_my_sites_page_url() {
    return wordfriends_siteops_portal_page_url('wordfriends_my_sites', '/my-sites/', ['my-sites', '내-사이트']);
}

function wordfriends_siteops_settlement_referrals_page_url() {
    return wordfriends_siteops_portal_page_url('wordfriends_settlement_referrals', '/settlement-referrals/', ['settlement-referrals', '정산-추천']);
}

function wordfriends_siteops_timeline_page_url() {
    return wordfriends_siteops_portal_page_url('wordfriends_timeline', '/notifications/', ['notifications', '알림센터']);
}

function wordfriends_siteops_contract_guide_page_url() {
    return wordfriends_siteops_portal_page_url('wordfriends_contract_request', '/contract-guide/', ['contract-guide', '전자계약-안내']);
}

function wordfriends_siteops_terms_page_url() {
    return wordfriends_siteops_portal_page_url('wordfriends_terms', '/terms/', ['terms', '이용약관']);
}

function wordfriends_siteops_privacy_page_url() {
    return wordfriends_siteops_portal_page_url('wordfriends_privacy', '/privacy-policy/', ['privacy-policy', 'privacy', '개인정보처리방침']);
}

function wordfriends_siteops_customer_logout_url($redirect = '') {
    return wp_nonce_url(add_query_arg([
        'wordfriends_logout_action' => '1',
        'redirect_to' => rawurlencode($redirect ?: wordfriends_siteops_login_page_url()),
    ], wordfriends_siteops_logout_page_url()), 'wordfriends_customer_logout', 'wordfriends_logout_nonce');
}

function wordfriends_siteops_handle_customer_logout() {
    if (!isset($_GET['wordfriends_logout_action'])) {
        return;
    }

    if (!isset($_GET['wordfriends_logout_nonce']) || !wp_verify_nonce(sanitize_text_field(wp_unslash($_GET['wordfriends_logout_nonce'])), 'wordfriends_customer_logout')) {
        wp_safe_redirect(wordfriends_siteops_login_page_url());
        exit;
    }

    $redirect = isset($_GET['redirect_to']) ? esc_url_raw(rawurldecode(wp_unslash($_GET['redirect_to']))) : wordfriends_siteops_login_page_url();

    wp_logout();
    wp_safe_redirect($redirect ?: wordfriends_siteops_login_page_url());
    exit;
}
add_action('template_redirect', 'wordfriends_siteops_handle_customer_logout');

function wordfriends_siteops_is_customer_user($user = null) {
    if (!$user) {
        $user = wp_get_current_user();
    }

    if (!$user || empty($user->ID)) {
        return false;
    }

    return !user_can($user, 'edit_posts');
}

function wordfriends_siteops_hide_customer_admin_bar($show) {
    if (is_user_logged_in() && wordfriends_siteops_is_customer_user()) {
        return false;
    }

    return $show;
}
add_filter('show_admin_bar', 'wordfriends_siteops_hide_customer_admin_bar');

function wordfriends_siteops_block_customer_admin() {
    if (!is_admin() || wp_doing_ajax() || !is_user_logged_in()) {
        return;
    }

    if (wordfriends_siteops_is_customer_user()) {
        wp_safe_redirect(wordfriends_siteops_customer_home_url());
        exit;
    }
}
add_action('admin_init', 'wordfriends_siteops_block_customer_admin');

function wordfriends_siteops_customer_login_redirect($redirect_to, $requested_redirect_to, $user) {
    if ($user instanceof WP_User && wordfriends_siteops_is_customer_user($user)) {
        return wordfriends_siteops_customer_home_url();
    }

    return $redirect_to;
}
add_filter('login_redirect', 'wordfriends_siteops_customer_login_redirect', 10, 3);

function wordfriends_siteops_front_login_url($login_url, $redirect = '', $force_reauth = false) {
    if (is_admin()) {
        return $login_url;
    }

    return wordfriends_siteops_login_page_url();
}
add_filter('login_url', 'wordfriends_siteops_front_login_url', 10, 3);

function wordfriends_siteops_front_logout_url($logout_url, $redirect = '') {
    if (is_admin()) {
        return $logout_url;
    }

    return wordfriends_siteops_logout_page_url();
}
add_filter('logout_url', 'wordfriends_siteops_front_logout_url', 10, 2);

function wordfriends_siteops_redirect_default_wp_login() {
    if (is_user_logged_in() || strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
        return;
    }

    $action = isset($_GET['action']) ? sanitize_key(wp_unslash($_GET['action'])) : '';
    $admin_bypass = isset($_GET['wordfriends_admin']) && sanitize_key(wp_unslash($_GET['wordfriends_admin'])) === '1';
    $redirect_to = isset($_GET['redirect_to']) ? rawurldecode(wp_unslash($_GET['redirect_to'])) : '';
    $admin_path = wp_parse_url(admin_url(), PHP_URL_PATH) ?: '/wp-admin/';
    $redirect_path = $redirect_to ? (wp_parse_url($redirect_to, PHP_URL_PATH) ?: '') : '';
    $request_uri = isset($_SERVER['REQUEST_URI']) ? rawurldecode(wp_unslash($_SERVER['REQUEST_URI'])) : '';

    if ($admin_bypass || strpos($redirect_to, 'wp-admin') !== false || strpos($request_uri, 'wp-admin') !== false) {
        return;
    }

    if ($redirect_path && strpos(trailingslashit($redirect_path), trailingslashit($admin_path)) === 0) {
        return;
    }

    if ($action && !in_array($action, ['login', 'logout'], true)) {
        return;
    }

    wp_safe_redirect(wordfriends_siteops_login_page_url());
    exit;
}
add_action('login_init', 'wordfriends_siteops_redirect_default_wp_login');

function wordfriends_siteops_ajax_event() {
    check_ajax_referer('wordfriends_siteops_event', 'nonce');

    $payload = json_decode(stripslashes($_POST['payload'] ?? '{}'), true);

    if (!is_array($payload)) {
        wp_send_json_error(['message' => 'Invalid payload'], 400);
    }

    $event_type = sanitize_text_field($payload['eventType'] ?? '');
    unset($payload['eventType']);

    if (!$event_type) {
        wp_send_json_error(['message' => 'Missing event type'], 400);
    }

    $result = wordfriends_siteops_send('/api/wordfriends/events', array_merge($payload, [
        'eventType' => $event_type,
    ]));

    if (is_wp_error($result)) {
        wp_send_json_error(['message' => $result->get_error_message()], 500);
    }

    wp_send_json_success(['ok' => true]);
}
add_action('wp_ajax_wordfriends_siteops_event', 'wordfriends_siteops_ajax_event');
add_action('wp_ajax_nopriv_wordfriends_siteops_event', 'wordfriends_siteops_ajax_event');

function wordfriends_siteops_ajax_question() {
    check_ajax_referer('wordfriends_siteops_event', 'nonce');

    $payload = json_decode(stripslashes($_POST['payload'] ?? '{}'), true);

    if (!is_array($payload)) {
        wp_send_json_error(['message' => 'Invalid payload'], 400);
    }

    $payload['question'] = sanitize_textarea_field($payload['question'] ?? '');
    $payload['category'] = sanitize_text_field($payload['category'] ?? 'general');
    $payload['customerCode'] = wordfriends_siteops_customer_code();

    if (is_user_logged_in()) {
        $user = wp_get_current_user();
        $payload['requesterName'] = sanitize_text_field($user->display_name ?: $user->user_login);
        $payload['requesterEmail'] = sanitize_email($user->user_email);
    }

    if (!$payload['question']) {
        wp_send_json_error(['message' => 'Missing question'], 400);
    }

    $result = wordfriends_siteops_send('/api/wordfriends/questions', $payload);

    if (is_wp_error($result)) {
        wp_send_json_error(['message' => $result->get_error_message()], 500);
    }

    wp_send_json_success(['ok' => true]);
}
add_action('wp_ajax_wordfriends_siteops_question', 'wordfriends_siteops_ajax_question');
add_action('wp_ajax_nopriv_wordfriends_siteops_question', 'wordfriends_siteops_ajax_question');

function wordfriends_siteops_track_login($user_login, $user) {
    wordfriends_siteops_track_event('login', [
        'customerCode' => wordfriends_siteops_customer_code_for_user($user->ID),
        'payload' => [
            'wpUserId' => $user->ID,
            'login' => $user_login,
        ],
    ]);
}
add_action('wp_login', 'wordfriends_siteops_track_login', 10, 2);
