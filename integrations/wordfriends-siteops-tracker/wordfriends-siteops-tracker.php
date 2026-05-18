<?php
/**
 * Plugin Name: Wordfriends SiteOps Tracker
 * Description: Sends Wordfriends portal activity and support questions to BOSS SiteOps without exposing the event token in the browser.
 * Version: 0.4.8
 * Author: BOSS SiteOps
 */

if (!defined('ABSPATH')) {
    exit;
}

const WORDFRIENDS_SITEOPS_OPTION_ENDPOINT = 'wordfriends_siteops_endpoint';
const WORDFRIENDS_SITEOPS_OPTION_TOKEN = 'wordfriends_siteops_token';
const WORDFRIENDS_SITEOPS_VERSION = '0.4.8';

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
        'homeUrl' => wordfriends_siteops_home_page_url(),
        'dashboardUrl' => wordfriends_siteops_dashboard_page_url(),
        'signupUrl' => wordfriends_siteops_signup_page_url(),
        'loginUrl' => wordfriends_siteops_login_page_url(),
        'logoutUrl' => wordfriends_siteops_logout_page_url(),
        'inquiryUrl' => wordfriends_siteops_question_page_url(),
        'servicesUrl' => wordfriends_siteops_services_page_url(),
        'startGuideUrl' => wordfriends_siteops_start_guide_page_url(),
        'casesUrl' => wordfriends_siteops_cases_page_url(),
        'guideUrl' => wordfriends_siteops_guide_page_url(),
        'myQuestionsUrl' => wordfriends_siteops_my_questions_page_url(),
        'mySitesUrl' => wordfriends_siteops_my_sites_page_url(),
        'settlementReferralsUrl' => wordfriends_siteops_settlement_referrals_page_url(),
        'timelineUrl' => wordfriends_siteops_timeline_page_url(),
        'contractGuideUrl' => wordfriends_siteops_contract_guide_page_url(),
        'termsUrl' => wordfriends_siteops_terms_page_url(),
        'privacyUrl' => wordfriends_siteops_privacy_page_url(),
        'isLoggedIn' => is_user_logged_in(),
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

  function normalizeLabel(text) {
    return String(text || '').replace(/[\s·ㆍ\/]/g, '').trim().toLowerCase();
  }

  function findPortalLink(text, aliases) {
    var labels = [text].concat(aliases || []).map(normalizeLabel);
    var nav = document.querySelector('header nav, .wp-block-navigation, nav');
    if (!nav) return null;

    var links = Array.prototype.slice.call(nav.querySelectorAll('a'));
    return links.find(function (link) {
      return labels.indexOf(normalizeLabel(link.textContent)) !== -1;
    }) || null;
  }

  function ensurePortalLink(text, href, aliases) {
    if (!href) return;
    var nav = document.querySelector('header nav, .wp-block-navigation, nav');
    if (!nav) return;

    var existingLink = findPortalLink(text, aliases);
    if (existingLink) {
      existingLink.href = href;
      existingLink.textContent = text;
      return;
    }

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
    var nav = document.querySelector('header nav, .wp-block-navigation, nav');
    var list = nav ? nav.querySelector('ul, .wp-block-navigation__container') : null;
    var publicLinks = [
      ['\ud648', WordfriendsSiteOps.homeUrl || '/', ['HOME']],
      ['\uc11c\ube44\uc2a4', WordfriendsSiteOps.servicesUrl],
      ['\uad6c\ucd95\uc808\ucc28', WordfriendsSiteOps.startGuideUrl],
      ['\uc0ac\ub840', WordfriendsSiteOps.casesUrl],
      ['\uac00\uc774\ub4dc/FAQ', WordfriendsSiteOps.guideUrl, ['\uac00\uc774\ub4dc', 'FAQ']],
      ['\ubb38\uc758', WordfriendsSiteOps.inquiryUrl]
    ];
    var customerLinks = WordfriendsSiteOps.isLoggedIn ? [
      ['\uace0\uac1d\ud3ec\ud138', WordfriendsSiteOps.dashboardUrl, ['\uace0\uac1d \ud3ec\ud138']],
      ['\ub85c\uadf8\uc544\uc6c3', WordfriendsSiteOps.logoutUrl]
    ] : [
      ['\uace0\uac1d\ud3ec\ud138', WordfriendsSiteOps.dashboardUrl, ['\uace0\uac1d \ud3ec\ud138']],
      ['\ub85c\uadf8\uc778', WordfriendsSiteOps.loginUrl],
      ['\ud68c\uc6d0\uac00\uc785', WordfriendsSiteOps.signupUrl]
    ];

    publicLinks.concat(customerLinks).forEach(function (item) {
      ensurePortalLink(item[0], item[1], item[2]);
    });

    if (list) {
      publicLinks.concat(customerLinks).forEach(function (item) {
        var link = findPortalLink(item[0], item[2]);
        var node = link ? (link.closest('li') || link) : null;
        if (node && node.parentNode === list) {
          list.appendChild(node);
        }
      });
    }
  }

  function hideOperationalHeaderLinks() {
    var nav = document.querySelector('header nav, .wp-block-navigation, nav');
    if (!nav) return;

    var hiddenLabels = WordfriendsSiteOps.isLoggedIn
      ? ['\ub85c\uadf8\uc778', '\ud68c\uc6d0\uac00\uc785', '\ub0b4\uc0ac\uc774\ud2b8', '\ub0b4\ubb38\uc758', '\uc815\uc0b0/\ucd94\ucc9c', '\uc815\uc0b0\u00b7\ucd94\ucc9c', '\uc815\uc0b0\ucd94\ucc9c', '\uc54c\ub9bc\uc13c\ud130', '\uc804\uc790\uacc4\uc57d']
      : ['\ub0b4\uc0ac\uc774\ud2b8', '\ub0b4\ubb38\uc758', '\uc815\uc0b0/\ucd94\ucc9c', '\uc815\uc0b0\u00b7\ucd94\ucc9c', '\uc815\uc0b0\ucd94\ucc9c', '\uc54c\ub9bc\uc13c\ud130', '\uc804\uc790\uacc4\uc57d', '\ub85c\uadf8\uc544\uc6c3'];
    hiddenLabels = hiddenLabels.map(normalizeLabel);

    Array.prototype.forEach.call(nav.querySelectorAll('a'), function (link) {
      var label = normalizeLabel(link.textContent);
      if (hiddenLabels.indexOf(label) === -1) return;

      var item = link.closest('li') || link;
      item.style.display = 'none';
      item.setAttribute('data-wordfriends-portal-only', '1');
    });
  }

  function ensurePolicyFooterLinks() {
    var footer = document.querySelector('footer, .wp-block-template-part footer');
    if (!footer) return;

    if (footer.querySelector('[data-wordfriends-footer]')) return;

    Array.prototype.forEach.call(footer.children, function (child) {
      child.style.display = 'none';
      child.setAttribute('data-wordfriends-footer-hidden', '1');
    });
    footer.classList.add('wordfriends-footer-ready');

    var wrap = document.createElement('div');
    wrap.className = 'wordfriends-site-footer';
    wrap.setAttribute('data-wordfriends-footer', '1');

    var brand = document.createElement('div');
    brand.className = 'wordfriends-site-footer-brand';

    var brandName = document.createElement('strong');
    brandName.textContent = '\uc6cc\ub4dc\ud504\ub79c\uc988';
    brand.appendChild(brandName);

    var brandText = document.createElement('p');
    brandText.textContent = '\uace0\uac1d \uc18c\uc720 \ub3c4\uba54\uc778\uacfc \uacc4\uc815\uc744 \uae30\uc900\uc73c\ub85c WordPress \uad6c\ucd95, \ucf58\ud150\uce20 \uc6b4\uc601, \uae30\uc220\uc9c0\uc6d0\uc744 \uc815\ub9ac\ud569\ub2c8\ub2e4.';
    brand.appendChild(brandText);

    var linkGroups = document.createElement('div');
    linkGroups.className = 'wordfriends-site-footer-groups';

    var publicNav = document.createElement('nav');
    publicNav.className = 'wordfriends-site-footer-links';
    publicNav.setAttribute('aria-label', 'Wordfriends');

    [
      ['\uc11c\ube44\uc2a4', WordfriendsSiteOps.servicesUrl],
      ['\uad6c\ucd95\uc808\ucc28', WordfriendsSiteOps.startGuideUrl],
      ['\uc0ac\ub840', WordfriendsSiteOps.casesUrl],
      ['\uac00\uc774\ub4dc/FAQ', WordfriendsSiteOps.guideUrl],
      ['\ubb38\uc758', WordfriendsSiteOps.inquiryUrl],
      ['\uace0\uac1d\ud3ec\ud138', WordfriendsSiteOps.dashboardUrl]
    ].forEach(function (item) {
      appendFooterLink(publicNav, item[0], item[1]);
    });

    var policyNav = document.createElement('nav');
    policyNav.className = 'wordfriends-site-footer-links wordfriends-site-footer-policy';
    policyNav.setAttribute('aria-label', 'Policy');

    [
      ['\uc804\uc790\uacc4\uc57d \uc548\ub0b4', WordfriendsSiteOps.contractGuideUrl],
      ['\uc774\uc6a9\uc57d\uad00', WordfriendsSiteOps.termsUrl],
      ['\uac1c\uc778\uc815\ubcf4\ucc98\ub9ac\ubc29\uce68', WordfriendsSiteOps.privacyUrl]
    ].forEach(function (item) {
      appendFooterLink(policyNav, item[0], item[1]);
    });

    linkGroups.appendChild(publicNav);
    linkGroups.appendChild(policyNav);

    var info = document.createElement('div');
    info.className = 'wordfriends-site-footer-info';

    [
      '(\uc8fc)\uc2a4\ud0c0\uc77c\ucef4\ud37c\ub2c8',
      '\uc0ac\uc5c5\uc790\ub4f1\ub85d\ubc88\ud638: 620-88-01252',
      '\ud1b5\uc2e0\ud310\ub9e4\uc5c5 \uc2e0\uace0\ubc88\ud638: \uc81c 2019-\uc131\ub0a8\uc911\uc6d0-0577\ud638'
    ].forEach(function (text) {
      var item = document.createElement('span');
      item.textContent = text;
      info.appendChild(item);
    });

    var email = document.createElement('a');
    email.className = 'wordfriends-site-footer-email';
    email.href = 'mailto:talk@wordfriends.co.kr';
    email.textContent = '\uc774\uba54\uc77c: talk@wordfriends.co.kr';
    info.appendChild(email);

    var notice = document.createElement('p');
    notice.className = 'wordfriends-site-footer-notice';
    notice.textContent = 'Wordfriends\ub294 \uc6b4\uc601\ub300\ud589, \ucf58\ud150\uce20 \uc6b4\uc601, \uae30\uc220\uc9c0\uc6d0 \uc5ed\ud560\uc744 \uc218\ud589\ud558\uba70 \uc218\uc775, AdSense \uc2b9\uc778, \ud2b8\ub798\ud53d, \uac80\uc0c9 \uc21c\uc704\ub97c \ubcf4\uc7a5\ud558\uc9c0 \uc54a\uc2b5\ub2c8\ub2e4.';

    wrap.appendChild(brand);
    wrap.appendChild(linkGroups);
    wrap.appendChild(info);
    wrap.appendChild(notice);

    footer.appendChild(wrap);
  }

  function appendFooterLink(parent, text, href) {
    if (!href) return;

    var link = document.createElement('a');
    link.href = href;
    link.textContent = text;
    parent.appendChild(link);
  }

  function markWordfriendsDocumentPage() {
    var pageUrls = [
      WordfriendsSiteOps.contractGuideUrl,
      WordfriendsSiteOps.termsUrl,
      WordfriendsSiteOps.privacyUrl
    ].filter(Boolean);
    var currentPath = normalizePath(window.location.pathname);

    var isDocumentPage = pageUrls.some(function (url) {
      var path = normalizePath(url);
      return path && currentPath === path;
    });

    if (isDocumentPage) {
      document.body.classList.add('wordfriends-document-page');
    }
  }

  function normalizePath(url) {
    try {
      return new URL(url, window.location.origin).pathname.replace(/\/+$/, '') || '/';
    } catch (error) {
      return '';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      markWordfriendsDocumentPage();
      ensurePortalLinks();
      hideOperationalHeaderLinks();
      ensurePolicyFooterLinks();
    });
  } else {
    markWordfriendsDocumentPage();
    ensurePortalLinks();
    hideOperationalHeaderLinks();
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
      .wordfriends-auth,
      .wordfriends-auth *,
      .wordfriends-site-footer,
      .wordfriends-site-footer * {
        box-sizing: border-box;
      }
      .wordfriends-auth {
        width: min(100%, 520px);
        margin-right: auto;
        margin-left: auto;
        max-width: 520px;
        border: 1px solid #d9e2e7;
        border-radius: 8px;
        padding: 22px;
        background: #fff;
        color: #17212b;
      }
      .wordfriends-auth h2 {
        margin: 0 0 8px;
        font-size: 24px;
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
        min-height: 42px;
        border: 0;
        border-radius: 8px;
        padding: 0 16px;
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
      .wordfriends-question-guide {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
        margin: 14px 0 16px;
      }
      .wordfriends-question-guide article {
        border: 1px solid #d9e2e7;
        border-radius: 8px;
        padding: 12px;
        background: #fff;
      }
      .wordfriends-question-guide strong {
        display: block;
        color: #17212b;
        font-size: 14px;
        line-height: 1.35;
      }
      .wordfriends-question-guide span {
        display: block;
        margin-top: 6px;
        color: #64748b;
        font-size: 13px;
        line-height: 1.5;
      }
      .wordfriends-question-form-note {
        margin-top: 8px;
      }
      .wordfriends-question-list {
        display: grid;
        gap: 14px;
        margin-top: 18px;
      }
      .wordfriends-question-filters {
        display: grid;
        grid-template-columns: minmax(180px, 1.45fr) minmax(118px, 0.8fr) minmax(90px, 0.58fr) auto;
        gap: 10px;
        align-items: end;
        margin: 18px 0 4px;
      }
      .wordfriends-question-filters label {
        display: grid;
        gap: 5px;
        margin: 0;
        color: #334155;
        font-size: 12px;
        font-weight: 800;
      }
      .wordfriends-question-filters input,
      .wordfriends-question-filters select {
        width: 100%;
        min-width: 0;
        min-height: 42px;
        border: 1px solid #cbd5e1;
        border-radius: 8px;
        padding: 8px 10px;
        background: #fff;
        color: #17212b;
        font-size: 14px;
      }
      .wordfriends-question-filters button {
        min-height: 42px;
        white-space: nowrap;
        border: 0;
        border-radius: 8px;
        padding: 8px 16px;
        background: #17212b;
        color: #fff;
        font-weight: 800;
        cursor: pointer;
      }
      .wordfriends-question-filter-summary {
        margin: 10px 0 0;
        color: #64748b;
        font-size: 13px;
        font-weight: 700;
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
      .wordfriends-empty p:last-child {
        margin-bottom: 0;
      }
      .wordfriends-empty .wordfriends-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        margin-top: 8px;
        text-decoration: none;
      }
      .wordfriends-site-grid {
        display: grid;
        gap: 12px;
        margin-top: 18px;
      }
      .wordfriends-site-filters {
        display: grid;
        grid-template-columns: minmax(180px, 1.45fr) minmax(118px, 0.8fr) minmax(90px, 0.58fr) auto;
        gap: 10px;
        align-items: end;
        margin: 18px 0 4px;
      }
      .wordfriends-site-filters label {
        display: grid;
        gap: 5px;
        margin: 0;
        color: #334155;
        font-size: 12px;
        font-weight: 800;
      }
      .wordfriends-site-filters input,
      .wordfriends-site-filters select {
        width: 100%;
        min-width: 0;
        min-height: 42px;
        border: 1px solid #cbd5e1;
        border-radius: 8px;
        padding: 8px 10px;
        background: #fff;
        color: #17212b;
        font-size: 14px;
      }
      .wordfriends-site-filters button {
        min-height: 42px;
        white-space: nowrap;
        border: 0;
        border-radius: 8px;
        padding: 8px 16px;
        background: #17212b;
        color: #fff;
        font-weight: 800;
        cursor: pointer;
      }
      .wordfriends-site-filter-summary {
        margin: 10px 0 0;
        color: #64748b;
        font-size: 13px;
        font-weight: 700;
      }
      .wordfriends-site-card {
        border: 1px solid #d9e2e7;
        border-radius: 8px;
        padding: 14px;
        background: #f8fbfc;
      }
      .wordfriends-site-card header {
        display: flex;
        flex-wrap: wrap;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 8px;
      }
      .wordfriends-site-card h3 {
        margin: 0;
        font-size: 17px;
        line-height: 1.35;
      }
      .wordfriends-site-meta {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(112px, 1fr));
        gap: 8px;
        margin-top: 10px;
      }
      .wordfriends-site-meta span {
        display: grid;
        gap: 3px;
        border-radius: 8px;
        padding: 9px;
        background: #fff;
        color: #17212b;
        font-size: 15px;
        line-height: 1.35;
      }
      .wordfriends-site-meta small {
        color: #64748b;
        font-size: 11px;
        font-weight: 800;
      }
      .wordfriends-site-progress {
        margin-top: 10px;
      }
      .wordfriends-site-next {
        display: grid;
        gap: 4px;
        margin-top: 10px;
        border: 1px solid #d9e2e7;
        border-radius: 8px;
        padding: 10px 12px;
        background: #fff;
      }
      .wordfriends-site-next small {
        color: #64748b;
        font-size: 11px;
        font-weight: 800;
      }
      .wordfriends-site-next strong {
        color: #17212b;
        font-size: 15px;
        line-height: 1.45;
      }
      .wordfriends-site-next span {
        color: #64748b;
        font-size: 12px;
      }
      .wordfriends-site-progress-track {
        overflow: hidden;
        height: 7px;
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
      .wordfriends-site-details {
        margin-top: 10px;
        border-top: 1px solid #d9e2e7;
        padding-top: 10px;
      }
      .wordfriends-site-details summary {
        cursor: pointer;
        color: #126451;
        font-size: 13px;
        font-weight: 800;
      }
      .wordfriends-site-card a.wordfriends-site-link {
        color: #126451;
        font-weight: 800;
        text-decoration: underline;
        text-underline-offset: 3px;
      }
      .wordfriends-services {
        display: grid;
        gap: 18px;
        max-width: 860px;
      }
      .wordfriends-services-hero {
        display: grid;
        gap: 14px;
      }
      .wordfriends-services-eyebrow {
        color: #2bd4b7;
        font-size: 12px;
        font-weight: 900;
        letter-spacing: 0;
        text-transform: uppercase;
      }
      .wordfriends-services-actions {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
      }
      .wordfriends-services-actions .wordfriends-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        box-sizing: border-box;
        min-width: 0;
        padding: 0 10px;
        line-height: 1.2;
        text-align: center;
        white-space: nowrap;
      }
      .wordfriends-services-actions .wordfriends-button.wordfriends-button-secondary {
        min-width: 0;
      }
      .wordfriends-services h3 {
        margin: 0;
        color: inherit;
        font-size: 22px;
        line-height: 1.35;
      }
      .wordfriends-services-section {
        border: 1px solid rgba(106, 173, 178, 0.35);
        border-radius: 8px;
        padding: 20px;
        background: rgba(18, 54, 58, 0.82);
      }
      .wordfriends-services-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 12px;
        margin-top: 14px;
      }
      .wordfriends-service-card {
        display: grid;
        gap: 8px;
        min-width: 0;
        min-height: 170px;
        border: 1px solid rgba(106, 173, 178, 0.35);
        border-radius: 8px;
        padding: 16px;
        background: rgba(5, 30, 33, 0.68);
      }
      .wordfriends-service-card small,
      .wordfriends-service-video small,
      .wordfriends-service-proof small {
        color: #8fb8c5;
        font-size: 12px;
        font-weight: 900;
      }
      .wordfriends-service-card strong {
        color: #f8ffff;
        font-size: 19px;
        line-height: 1.4;
        overflow-wrap: anywhere;
      }
      .wordfriends-service-card p,
      .wordfriends-services-section p {
        margin: 0;
        color: #c7f2ee;
        font-size: 15px;
        line-height: 1.7;
        overflow-wrap: anywhere;
      }
      .wordfriends-service-list {
        display: grid;
        gap: 6px;
        margin: 4px 0 0;
        padding: 0;
        list-style: none;
      }
      .wordfriends-service-list li {
        display: grid;
        grid-template-columns: 6px 1fr;
        align-items: start;
        column-gap: 8px;
        color: #dffdf8;
        font-size: 14px;
        line-height: 1.55;
      }
      .wordfriends-service-list li::before {
        content: "";
        display: block;
        width: 6px;
        height: 6px;
        margin-top: 8px;
        border-radius: 999px;
        background: #2bd4b7;
      }
      .wordfriends-service-flow {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
        gap: 10px;
        margin-top: 14px;
      }
      .wordfriends-service-step {
        position: relative;
        border: 1px solid rgba(106, 173, 178, 0.35);
        border-radius: 8px;
        padding: 14px;
        background: rgba(5, 30, 33, 0.78);
      }
      .wordfriends-service-step:not(:last-child)::after {
        content: "";
        position: absolute;
        top: 50%;
        right: -8px;
        width: 12px;
        height: 2px;
        background: #2bd4b7;
      }
      .wordfriends-service-step span {
        display: inline-grid;
        place-items: center;
        width: 26px;
        height: 26px;
        margin-bottom: 10px;
        border-radius: 999px;
        background: #dffdf4;
        color: #063034;
        font-size: 12px;
        font-weight: 900;
      }
      .wordfriends-service-step strong {
        display: block;
        color: #f8ffff;
        font-size: 15px;
      }
      .wordfriends-service-step small {
        display: block;
        margin-top: 6px;
        color: #8fb8c5;
        font-size: 12px;
        line-height: 1.5;
      }
      .wordfriends-service-videos,
      .wordfriends-service-proofs {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
        gap: 10px;
        margin-top: 14px;
      }
      .wordfriends-service-scope {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
        margin-top: 14px;
      }
      .wordfriends-service-scope article,
      .wordfriends-service-video,
      .wordfriends-service-proof {
        border: 1px solid rgba(106, 173, 178, 0.35);
        border-radius: 8px;
        padding: 14px;
        background: rgba(5, 30, 33, 0.72);
      }
      .wordfriends-service-scope article {
        transition: transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
      }
      .wordfriends-service-scope article:hover,
      .wordfriends-service-scope article:focus-within {
        transform: translateY(-2px);
        border-color: #35c6a5;
        box-shadow: 0 10px 24px rgba(0, 0, 0, 0.22);
      }
      .wordfriends-service-scope small {
        color: #8fb8c5;
        font-size: 12px;
        font-weight: 900;
      }
      .wordfriends-service-scope strong {
        display: block;
        margin-top: 6px;
        color: #f8ffff;
        font-size: 18px;
        line-height: 1.35;
      }
      .wordfriends-setup-checkpoints {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
        margin-top: 14px;
      }
      .wordfriends-setup-checkpoints article {
        border: 1px solid rgba(106, 173, 178, 0.35);
        border-radius: 8px;
        padding: 14px;
        background: rgba(5, 30, 33, 0.72);
        transition: transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
      }
      .wordfriends-setup-checkpoints article:hover,
      .wordfriends-setup-checkpoints article:focus-within {
        transform: translateY(-2px);
        border-color: #35c6a5;
        box-shadow: 0 10px 24px rgba(0, 0, 0, 0.22);
      }
      .wordfriends-setup-checkpoints small {
        color: #8fb8c5;
        font-size: 12px;
        font-weight: 900;
      }
      .wordfriends-setup-checkpoints strong {
        display: block;
        margin-top: 6px;
        color: #f8ffff;
        font-size: 18px;
        line-height: 1.35;
      }
      .wordfriends-service-video-frame {
        display: grid;
        place-items: center;
        min-height: 118px;
        margin-bottom: 12px;
        border: 1px dashed rgba(199, 242, 238, 0.35);
        border-radius: 8px;
        background: rgba(2, 19, 22, 0.78);
        color: #dffdf4;
        font-size: 13px;
        font-weight: 900;
      }
      .wordfriends-service-video strong {
        display: block;
        color: #f8ffff;
        font-size: 15px;
        line-height: 1.45;
      }
      .wordfriends-service-proof strong {
        display: block;
        margin-top: 6px;
        color: #f8ffff;
        font-size: 16px;
      }
      .wordfriends-service-cta {
        display: grid;
        gap: 10px;
        border: 1px solid #35c6a5;
        border-radius: 8px;
        background: linear-gradient(135deg, rgba(43, 212, 183, .14), rgba(7, 26, 31, .96));
        padding: 18px;
      }
      .wordfriends-service-cta strong {
        color: #f8ffff;
        font-size: 18px;
        line-height: 1.35;
      }
      .wordfriends-service-cta span {
        color: #c7f2ee;
        font-size: 14px;
        line-height: 1.55;
      }
      .wordfriends-guide {
        display: grid;
        gap: 18px;
        max-width: 860px;
      }
      .wordfriends-guide-hero {
        display: grid;
        gap: 14px;
      }
      .wordfriends-guide-eyebrow {
        color: #2bd4b7;
        font-size: 12px;
        font-weight: 900;
        letter-spacing: 0;
        text-transform: uppercase;
      }
      .wordfriends-guide-actions {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
      }
      .wordfriends-guide-actions .wordfriends-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        box-sizing: border-box;
        min-width: 0;
        padding: 0 10px;
        line-height: 1.2;
        text-align: center;
        white-space: nowrap;
      }
      .wordfriends-guide-actions .wordfriends-button.wordfriends-button-secondary {
        min-width: 0;
      }
      .wordfriends-guide h3 {
        margin: 0;
        color: inherit;
        font-size: 22px;
        line-height: 1.35;
      }
      .wordfriends-guide-section {
        border: 1px solid rgba(106, 173, 178, 0.35);
        border-radius: 8px;
        padding: 20px;
        background: rgba(18, 54, 58, 0.82);
      }
      .wordfriends-guide-section p {
        margin: 0;
        color: #c7f2ee;
        font-size: 15px;
        line-height: 1.7;
      }
      .wordfriends-guide-featured {
        border-color: rgba(43, 212, 183, 0.62);
        background: linear-gradient(135deg, rgba(43, 212, 183, .14), rgba(18, 54, 58, .9) 58%, rgba(5, 30, 33, .96));
        box-shadow: 0 18px 42px rgba(0, 0, 0, 0.22);
      }
      .wordfriends-guide-featured-head {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 12px;
        align-items: start;
      }
      .wordfriends-guide-quicklinks {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
        margin-top: 16px;
      }
      .wordfriends-guide-quicklinks a {
        display: inline-flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 2px;
        min-height: 52px;
        border: 1px solid rgba(43, 212, 183, 0.72);
        border-radius: 8px;
        padding: 0 14px;
        background: linear-gradient(135deg, #e4fff7, #c8f6e9);
        color: #063034;
        font-size: 15px;
        font-weight: 900;
        line-height: 1.25;
        text-align: center;
        text-decoration: none;
        box-shadow: 0 10px 22px rgba(0, 0, 0, 0.16);
        transition: transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease, background 160ms ease;
      }
      .wordfriends-guide-quicklinks a span {
        display: block;
      }
      .wordfriends-guide-quicklinks a:hover,
      .wordfriends-guide-quicklinks a:focus-visible {
        transform: translateY(-2px);
        border-color: #063034;
        background: linear-gradient(135deg, #f3fffb, #bdf5e4);
        box-shadow: 0 0 0 2px #2bd4b7, 0 14px 28px rgba(0, 0, 0, 0.24);
        outline: none;
      }
      .wordfriends-guide-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 12px;
        margin-top: 14px;
      }
      .wordfriends-guide-hub {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 12px;
        margin-top: 14px;
      }
      .wordfriends-guide-hub-card {
        display: grid;
        gap: 8px;
        min-width: 0;
        border: 1px solid rgba(106, 173, 178, 0.35);
        border-radius: 8px;
        padding: 16px;
        background: rgba(5, 30, 33, 0.72);
        transition: transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
      }
      .wordfriends-guide-hub-card:hover,
      .wordfriends-guide-hub-card:focus-within {
        transform: translateY(-2px);
        border-color: #35c6a5;
        box-shadow: 0 10px 24px rgba(0, 0, 0, 0.22);
      }
      .wordfriends-guide-hub-card small,
      .wordfriends-guide-draft-card small {
        color: #2bd4b7;
        font-size: 12px;
        font-weight: 900;
      }
      .wordfriends-guide-hub-card strong,
      .wordfriends-guide-draft-card strong {
        color: #f8ffff;
        font-size: 17px;
        line-height: 1.35;
      }
      .wordfriends-guide-hub-card p,
      .wordfriends-guide-draft-card p {
        margin: 0;
        color: #c7f2ee;
        font-size: 14px;
        line-height: 1.6;
      }
      .wordfriends-guide-drafts {
        display: grid;
        gap: 10px;
        margin-top: 14px;
      }
      .wordfriends-guide-draft-card {
        display: grid;
        grid-template-columns: 36px minmax(0, 1fr) auto;
        gap: 12px;
        align-items: start;
        min-width: 0;
        border: 1px solid rgba(106, 173, 178, 0.35);
        border-radius: 8px;
        padding: 14px;
        background: rgba(5, 30, 33, 0.72);
      }
      .wordfriends-guide-draft-card span {
        display: inline-grid;
        place-items: center;
        width: 30px;
        height: 30px;
        border-radius: 999px;
        background: #dffdf4;
        color: #063034;
        font-size: 12px;
        font-weight: 900;
      }
      .wordfriends-guide-draft-card em {
        display: inline-flex;
        align-items: center;
        min-height: 28px;
        border: 1px solid rgba(106, 173, 178, 0.35);
        border-radius: 999px;
        padding: 0 10px;
        color: #dffdf8;
        font-size: 12px;
        font-style: normal;
        font-weight: 900;
        white-space: nowrap;
      }
      .wordfriends-guide-category-map {
        display: grid;
        gap: 10px;
        margin-top: 14px;
      }
      .wordfriends-guide-category-row {
        display: grid;
        grid-template-columns: minmax(170px, .52fr) minmax(0, 1fr);
        gap: 12px;
        align-items: stretch;
        min-width: 0;
        border: 1px solid rgba(106, 173, 178, 0.35);
        border-radius: 8px;
        padding: 14px;
        background: rgba(5, 30, 33, 0.72);
      }
      .wordfriends-guide-category-row > div {
        display: grid;
        align-content: center;
      }
      .wordfriends-guide-category-row small {
        color: #2bd4b7;
        font-size: 12px;
        font-weight: 900;
      }
      .wordfriends-guide-category-row strong {
        display: block;
        margin-top: 4px;
        color: #f8ffff;
        font-size: 16px;
        line-height: 1.35;
      }
      .wordfriends-guide-category-row p {
        grid-column: 2;
        grid-row: 1;
        margin: 0;
        color: #c7f2ee;
        font-size: 14px;
        line-height: 1.6;
      }
      .wordfriends-guide-category-row ul {
        display: grid;
        gap: 5px;
        grid-column: 2;
        grid-row: 2;
        margin: 0;
        padding-left: 16px;
        color: #dffdf8;
        font-size: 13px;
        line-height: 1.45;
      }
      .wordfriends-guide-card {
        display: grid;
        gap: 8px;
        min-width: 0;
        border: 1px solid rgba(106, 173, 178, 0.35);
        border-radius: 8px;
        padding: 16px;
        background: rgba(5, 30, 33, 0.68);
      }
      .wordfriends-guide-card small,
      .wordfriends-guide-video small {
        color: #8fb8c5;
        font-size: 12px;
        font-weight: 900;
      }
      .wordfriends-guide-card strong {
        color: #f8ffff;
        font-size: 18px;
        line-height: 1.4;
        overflow-wrap: anywhere;
      }
      .wordfriends-guide-card p {
        margin: 0;
        color: #c7f2ee;
        font-size: 14px;
        line-height: 1.65;
        overflow-wrap: anywhere;
      }
      .wordfriends-cases-map-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
        margin-top: 14px;
      }
      .wordfriends-cases-map-grid article {
        min-width: 0;
        border: 1px solid rgba(106, 173, 178, 0.35);
        border-radius: 8px;
        padding: 14px;
        background: rgba(5, 30, 33, 0.72);
        transition: transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
      }
      .wordfriends-cases-map-grid article:hover,
      .wordfriends-cases-map-grid article:focus-within {
        transform: translateY(-2px);
        border-color: #35c6a5;
        box-shadow: 0 10px 24px rgba(0, 0, 0, 0.22);
      }
      .wordfriends-cases-map-grid small {
        color: #8fb8c5;
        font-size: 12px;
        font-weight: 900;
      }
      .wordfriends-cases-map-grid strong {
        display: block;
        margin-top: 6px;
        color: #f8ffff;
        font-size: 16px;
        line-height: 1.35;
        overflow-wrap: anywhere;
      }
      .wordfriends-cases-map-grid span {
        display: block;
        margin-top: 8px;
        color: #b8d6d4;
        font-size: 13px;
        line-height: 1.5;
        overflow-wrap: anywhere;
      }
      .wordfriends-guide-list {
        display: grid;
        gap: 6px;
        margin: 4px 0 0;
        padding: 0;
        list-style: none;
      }
      .wordfriends-guide-list li {
        display: grid;
        grid-template-columns: 6px 1fr;
        align-items: start;
        column-gap: 8px;
        color: #dffdf8;
        font-size: 14px;
        line-height: 1.55;
      }
      .wordfriends-guide-list li::before {
        content: "";
        display: block;
        width: 6px;
        height: 6px;
        margin-top: 8px;
        border-radius: 999px;
        background: #2bd4b7;
      }
      .wordfriends-guide-path {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
        gap: 10px;
        margin-top: 14px;
      }
      .wordfriends-guide-step {
        min-width: 0;
        border: 1px solid rgba(106, 173, 178, 0.35);
        border-radius: 8px;
        padding: 14px;
        background: rgba(5, 30, 33, 0.78);
      }
      .wordfriends-guide-step span {
        display: inline-grid;
        place-items: center;
        width: 26px;
        height: 26px;
        margin-bottom: 10px;
        border-radius: 999px;
        background: #dffdf4;
        color: #063034;
        font-size: 12px;
        font-weight: 900;
      }
      .wordfriends-guide-step strong {
        display: block;
        color: #f8ffff;
        font-size: 15px;
        line-height: 1.35;
        overflow-wrap: anywhere;
      }
      .wordfriends-guide-step small {
        display: block;
        margin-top: 6px;
        color: #8fb8c5;
        font-size: 12px;
        line-height: 1.5;
      }
      .wordfriends-guide-faq {
        display: grid;
        gap: 10px;
        margin-top: 14px;
      }
      .wordfriends-guide-faq details {
        border: 1px solid rgba(106, 173, 178, 0.35);
        border-radius: 8px;
        padding: 14px;
        background: rgba(5, 30, 33, 0.72);
      }
      .wordfriends-guide-faq summary {
        cursor: pointer;
        color: #f8ffff;
        font-size: 15px;
        font-weight: 900;
        line-height: 1.45;
        overflow-wrap: anywhere;
      }
      .wordfriends-guide-faq p {
        margin-top: 10px;
      }
      .wordfriends-guide-videos {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
        gap: 10px;
        margin-top: 14px;
      }
      .wordfriends-guide-video {
        border: 1px solid rgba(106, 173, 178, 0.35);
        border-radius: 8px;
        padding: 14px;
        background: rgba(5, 30, 33, 0.72);
      }
      .wordfriends-guide-video-frame {
        display: grid;
        place-items: center;
        min-height: 118px;
        margin-bottom: 12px;
        border: 1px dashed rgba(199, 242, 238, 0.35);
        border-radius: 8px;
        background: rgba(2, 19, 22, 0.78);
        color: #dffdf4;
        font-size: 13px;
        font-weight: 900;
      }
      .wordfriends-guide-video strong {
        display: block;
        color: #f8ffff;
        font-size: 15px;
        line-height: 1.45;
      }
      .wordfriends-guide-callout {
        border-left: 3px solid #2bd4b7;
        border-radius: 8px;
        padding: 12px 14px;
        background: rgba(18, 54, 58, 0.82);
        color: #dffdf8;
        font-size: 14px;
        line-height: 1.6;
      }
      @media (max-width: 860px) {
        .wordfriends-question-filters,
        .wordfriends-site-filters {
          grid-template-columns: minmax(0, 1fr) minmax(118px, 0.75fr) minmax(90px, 0.6fr);
        }
        .wordfriends-question-filters label:first-child,
        .wordfriends-site-filters label:first-child {
          grid-column: 1 / -1;
        }
        .wordfriends-question-filters button,
        .wordfriends-site-filters button {
          grid-column: 1 / -1;
          width: 100%;
        }
      }
      @media (max-width: 520px) {
        body:has(.wordfriends-auth) main {
          padding-right: 0;
          padding-left: 0;
        }
        .wordfriends-auth {
          width: min(100%, calc(100vw - 32px));
          max-width: calc(100vw - 32px);
          margin-right: auto;
          margin-left: auto;
          padding: 16px;
        }
        .wordfriends-auth h2 {
          font-size: 19px;
        }
        .wordfriends-auth p {
          font-size: 14px;
        }
        .wordfriends-services-section,
        .wordfriends-guide-section,
        .wordfriends-service-card,
        .wordfriends-guide-hub-card,
        .wordfriends-guide-draft-card,
        .wordfriends-guide-card {
          padding: 14px;
        }
        .wordfriends-service-card {
          min-height: 0;
        }
        .wordfriends-service-card strong,
        .wordfriends-guide-hub-card strong,
        .wordfriends-guide-draft-card strong,
        .wordfriends-guide-card strong,
        .wordfriends-cases-map-grid strong {
          font-size: 16px;
        }
        .wordfriends-service-card p,
        .wordfriends-services-section p,
        .wordfriends-guide-hub-card p,
        .wordfriends-guide-draft-card p,
        .wordfriends-guide-card p,
        .wordfriends-guide-section p,
        .wordfriends-cases-map-grid span,
        .wordfriends-guide-list li,
        .wordfriends-guide-step small {
          font-size: 13px;
          line-height: 1.6;
        }
        .wordfriends-guide-faq details,
        .wordfriends-guide-video,
        .wordfriends-guide-step,
        .wordfriends-guide-hub-card,
        .wordfriends-guide-draft-card,
        .wordfriends-cases-map-grid article {
          padding: 12px;
        }
        .wordfriends-services-actions,
        .wordfriends-guide-actions,
        .wordfriends-home-actions {
          grid-template-columns: 1fr;
          gap: 8px;
        }
        .wordfriends-services-actions .wordfriends-button,
        .wordfriends-guide-actions .wordfriends-button,
        .wordfriends-home-actions .wordfriends-button {
          padding: 0 8px;
          font-size: 12px;
          white-space: normal;
        }
        .wordfriends-inline-actions {
          display: grid;
          grid-template-columns: 1fr;
        }
        .wordfriends-guide-hub {
          grid-template-columns: 1fr;
        }
        .wordfriends-guide-featured-head {
          grid-template-columns: 1fr;
        }
        .wordfriends-guide-quicklinks {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .wordfriends-guide-quicklinks a {
          min-height: 50px;
          padding: 0 10px;
          font-size: 12px;
        }
        .wordfriends-guide-draft-card {
          grid-template-columns: 34px minmax(0, 1fr);
        }
        .wordfriends-guide-draft-card em {
          grid-column: 2;
          width: fit-content;
        }
        .wordfriends-guide-category-row {
          grid-template-columns: 1fr;
        }
        .wordfriends-guide-category-row p,
        .wordfriends-guide-category-row ul {
          grid-column: auto;
          grid-row: auto;
        }
        .wordfriends-portal-nav {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .wordfriends-portal-nav a {
          width: 100%;
          padding: 0 8px;
          font-size: 11px;
          white-space: normal;
          text-align: center;
        }
        .wordfriends-dashboard-grid {
          grid-template-columns: 1fr;
          gap: 10px;
        }
        .wordfriends-dashboard-card {
          min-height: 0;
        }
        .wordfriends-dashboard-card-head {
          align-items: flex-start;
        }
        .wordfriends-inline-actions .wordfriends-button {
          width: 100%;
          white-space: normal;
          text-align: center;
        }
        .wordfriends-auth textarea {
          min-height: 148px;
        }
        .wordfriends-question-form-note {
          font-size: 12px;
          line-height: 1.5;
        }
        .wordfriends-question-filters,
        .wordfriends-site-filters {
          grid-template-columns: 1fr;
        }
        .wordfriends-question-guide {
          grid-template-columns: 1fr;
        }
        .wordfriends-services-grid,
        .wordfriends-service-flow,
        .wordfriends-service-videos,
        .wordfriends-service-proofs,
        .wordfriends-service-scope,
        .wordfriends-setup-checkpoints,
        .wordfriends-guide-grid,
        .wordfriends-cases-map-grid,
        .wordfriends-guide-path,
        .wordfriends-guide-videos {
          grid-template-columns: 1fr;
        }
        .wordfriends-service-step:not(:last-child)::after {
          display: none;
        }
        body.wordfriends-document-page main {
          padding: 0 18px 48px;
        }
        body.wordfriends-document-page .wp-block-post-title,
        body.wordfriends-document-page .entry-title,
        body.wordfriends-document-page main h1 {
          margin-bottom: 18px;
          font-size: 24px;
        }
        body.wordfriends-document-page .entry-content,
        body.wordfriends-document-page .wp-block-post-content {
          font-size: 14px;
          line-height: 1.7;
        }
        body.wordfriends-document-page .entry-content h2,
        body.wordfriends-document-page .wp-block-post-content h2 {
          font-size: 20px;
        }
        body.wordfriends-document-page .entry-content h3,
        body.wordfriends-document-page .wp-block-post-content h3 {
          font-size: 17px;
        }
        .wordfriends-site-footer {
          padding: 30px 18px 28px;
          gap: 16px;
        }
        .wordfriends-site-footer-brand strong {
          font-size: 24px;
        }
        .wordfriends-site-footer-brand p,
        .wordfriends-site-footer-notice {
          font-size: 12px;
        }
        .wordfriends-site-footer-links {
          gap: 8px 12px;
        }
        .wordfriends-site-footer-info {
          display: grid;
          gap: 5px;
          justify-items: center;
        }
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
      .wordfriends-portal-nav {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin: 14px 0 18px;
      }
      .wordfriends-portal-nav a {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 0;
        min-height: 34px;
        border: 1px solid #24474d;
        border-radius: 8px;
        padding: 0 11px;
        background: #071a1f;
        color: #c7f2ee;
        font-size: 12px;
        font-weight: 900;
        text-decoration: none;
        white-space: nowrap;
      }
      .wordfriends-portal-nav a:hover,
      .wordfriends-portal-nav a:focus-visible,
      .wordfriends-portal-nav a.is-active {
        border-color: #35c6a5;
        background: #dff8ef;
        color: #05201b;
        outline: none;
      }
      .wordfriends-inline-actions {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
        margin: 12px 0 16px;
      }
      .wordfriends-inline-actions .wordfriends-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        min-width: 0;
        min-height: 36px;
        text-align: center;
        text-decoration: none;
      }
      .wordfriends-auth form > .wordfriends-button[type="submit"] {
        width: 100%;
      }
      .wordfriends-site-actions {
        margin: 10px 0 0;
      }
      .wordfriends-site-actions .wordfriends-button {
        min-height: 34px;
        padding: 0 12px;
        font-size: 13px;
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
        min-height: 132px;
        transition: border-color .16s ease, box-shadow .16s ease, transform .16s ease, background .16s ease;
      }
      .wordfriends-dashboard-card:hover,
      .wordfriends-dashboard-card:focus-visible {
        border-color: #1f8a70;
        background: #f3fbf8;
        box-shadow: 0 10px 24px rgba(15, 118, 110, .12);
        transform: translateY(-1px);
        outline: none;
      }
      .wordfriends-dashboard-card small {
        color: #64748b;
        font-size: 12px;
        font-weight: 800;
      }
      .wordfriends-dashboard-card-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        min-width: 0;
      }
      .wordfriends-dashboard-badge {
        border-radius: 999px;
        padding: 3px 8px;
        background: #e8f5f1;
        color: #126451;
        font-size: 11px;
        font-style: normal;
        font-weight: 900;
        white-space: nowrap;
      }
      .wordfriends-dashboard-badge.neutral {
        background: #eef3f6;
        color: #53616d;
      }
      .wordfriends-dashboard-badge.warn {
        background: #fff4de;
        color: #8a5a00;
      }
      .wordfriends-dashboard-card strong {
        font-size: 22px;
        overflow-wrap: anywhere;
      }
      .wordfriends-dashboard-card span {
        color: #5b6872;
        line-height: 1.5;
        overflow-wrap: anywhere;
      }
      .wordfriends-dashboard-card .wordfriends-dashboard-detail {
        color: #697985;
        font-size: 12px;
        line-height: 1.45;
      }
      .wordfriends-card-action {
        align-self: end;
        display: inline-flex;
        width: fit-content;
        align-items: center;
        gap: 6px;
        margin-top: 4px;
        color: #1f8a70;
        font-size: 13px;
        font-weight: 900;
      }
      .wordfriends-card-action::after {
        content: ">";
        font-size: 14px;
        line-height: 1;
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
      body:has(.wordfriends-auth) {
        background: #061316;
        color: #d8f2ee;
      }
      body:has(.wordfriends-auth) .wp-site-blocks,
      body:has(.wordfriends-auth) main,
      body:has(.wordfriends-auth) .entry-content {
        background: #061316;
      }
      body:has(.wordfriends-auth),
      body:has(.wordfriends-auth) .wp-site-blocks {
        overflow-x: hidden;
      }
      body:has(.wordfriends-auth) header,
      body:has(.wordfriends-auth) footer {
        background: #061316;
        color: #d8f2ee;
      }
      body:has(.wordfriends-auth) header a,
      body:has(.wordfriends-auth) footer a {
        color: #d8f2ee;
        text-decoration-thickness: 1px;
        text-underline-offset: 4px;
      }
      body:has(.wordfriends-auth) header a:hover,
      body:has(.wordfriends-auth) footer a:hover {
        color: #4ad6b4;
      }
      body.wordfriends-document-page {
        background: #061316;
        color: #d8f2ee;
      }
      body.wordfriends-document-page .wp-site-blocks,
      body.wordfriends-document-page main,
      body.wordfriends-document-page .entry-content,
      body.wordfriends-document-page .wp-block-post-content {
        background: #061316;
      }
      body.wordfriends-document-page header,
      body.wordfriends-document-page footer {
        background: #061316;
        color: #d8f2ee;
      }
      body.wordfriends-document-page main {
        padding: 0 20px 76px;
      }
      body.wordfriends-document-page .wp-block-post-title,
      body.wordfriends-document-page .entry-title,
      body.wordfriends-document-page main h1 {
        width: min(100%, 760px);
        margin: 0 auto 22px;
        color: #f3fffd;
        font-size: clamp(26px, 2.6vw, 34px);
        line-height: 1.2;
        font-weight: 900;
        letter-spacing: 0;
      }
      body.wordfriends-document-page .entry-content,
      body.wordfriends-document-page .wp-block-post-content {
        width: min(100%, 760px);
        margin: 0 auto;
        color: #c7e8e4;
        font-size: 15px;
        line-height: 1.75;
      }
      body.wordfriends-document-page .entry-content > *,
      body.wordfriends-document-page .wp-block-post-content > * {
        max-width: none;
      }
      body.wordfriends-document-page .entry-content h2,
      body.wordfriends-document-page .entry-content h3,
      body.wordfriends-document-page .wp-block-post-content h2,
      body.wordfriends-document-page .wp-block-post-content h3 {
        margin: 30px 0 10px;
        color: #f3fffd;
        font-weight: 900;
        letter-spacing: 0;
      }
      body.wordfriends-document-page .entry-content h2,
      body.wordfriends-document-page .wp-block-post-content h2 {
        font-size: 22px;
      }
      body.wordfriends-document-page .entry-content h3,
      body.wordfriends-document-page .wp-block-post-content h3 {
        font-size: 18px;
      }
      body.wordfriends-document-page .entry-content p,
      body.wordfriends-document-page .entry-content li,
      body.wordfriends-document-page .wp-block-post-content p,
      body.wordfriends-document-page .wp-block-post-content li {
        color: #c7e8e4;
      }
      body.wordfriends-document-page .entry-content ul,
      body.wordfriends-document-page .entry-content ol,
      body.wordfriends-document-page .wp-block-post-content ul,
      body.wordfriends-document-page .wp-block-post-content ol {
        padding-left: 22px;
      }
      body.wordfriends-document-page .entry-content a,
      body.wordfriends-document-page .wp-block-post-content a,
      body.wordfriends-document-page header a,
      body.wordfriends-document-page footer a {
        color: #8de8d7;
        text-underline-offset: 4px;
      }
      body.wordfriends-document-page .entry-content a[href^="mailto:"],
      body.wordfriends-document-page .wp-block-post-content a[href^="mailto:"] {
        color: #5aaeff;
        font-weight: 800;
      }
      body.wordfriends-document-page .entry-content a:hover,
      body.wordfriends-document-page .wp-block-post-content a:hover,
      body.wordfriends-document-page header a:hover,
      body.wordfriends-document-page footer a:hover {
        color: #4ad6b4;
      }
      .wordfriends-footer-ready {
        border-top: 1px solid #14363b;
        background: #061316;
        color: #d8f2ee;
      }
      .wordfriends-site-footer {
        width: min(100%, 960px);
        margin: 0 auto;
        padding: 34px 20px 30px;
        display: grid;
        gap: 18px;
        text-align: center;
        justify-items: center;
      }
      .wordfriends-site-footer-brand {
        display: grid;
        gap: 8px;
        justify-items: center;
      }
      .wordfriends-site-footer-brand strong {
        color: #f3fffd;
        font-size: 26px;
        line-height: 1.15;
        font-weight: 900;
      }
      .wordfriends-site-footer-brand p,
      .wordfriends-site-footer-notice {
        margin: 0;
        color: #a9cfcb;
        font-size: 13px;
        line-height: 1.55;
      }
      .wordfriends-site-footer-groups {
        display: grid;
        gap: 10px;
        justify-items: center;
      }
      .wordfriends-site-footer-links {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 8px 14px;
      }
      .wordfriends-site-footer-links a {
        color: #d8f2ee;
        font-size: 13px;
        font-weight: 800;
        text-decoration: none;
      }
      .wordfriends-site-footer-policy a {
        color: #8de8d7;
      }
      .wordfriends-site-footer-info {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 6px 14px;
        color: #8fb5b1;
        font-size: 12px;
        line-height: 1.5;
      }
      .wordfriends-site-footer-email {
        color: #5aaeff;
        font-weight: 800;
        text-decoration: none;
      }
      .wordfriends-site-footer-email:hover {
        color: #8cc7ff;
        text-decoration: underline;
        text-underline-offset: 4px;
      }
      .wordfriends-site-footer-notice {
        padding-top: 14px;
        border-top: 1px solid #24474d;
      }
      .wordfriends-auth {
        max-width: 620px;
        border-color: #24474d;
        background: #0b2227;
        color: #e6fffb;
        box-shadow: 0 18px 42px rgba(0, 0, 0, .22);
      }
      .wordfriends-auth h2 {
        color: #f3fffd;
        font-size: 30px;
        font-weight: 900;
        letter-spacing: 0;
      }
      .wordfriends-auth h3,
      .wordfriends-question-card h3,
      .wordfriends-site-card h3 {
        color: #f3fffd;
      }
      .wordfriends-auth p,
      .wordfriends-dashboard-card span,
      .wordfriends-site-next strong {
        color: #b8d6d4;
      }
      .wordfriends-auth label,
      .wordfriends-question-filters label,
      .wordfriends-site-filters label {
        color: #bfe6df;
      }
      .wordfriends-auth input[type="text"],
      .wordfriends-auth input[type="email"],
      .wordfriends-auth input[type="tel"],
      .wordfriends-auth input[type="number"],
      .wordfriends-auth input[type="password"],
      .wordfriends-auth select,
      .wordfriends-auth textarea,
      .wordfriends-question-filters input,
      .wordfriends-question-filters select,
      .wordfriends-site-filters input,
      .wordfriends-site-filters select {
        border-color: #29545b;
        background: #071a1f;
        color: #f3fffd;
      }
      .wordfriends-auth input::placeholder,
      .wordfriends-auth textarea::placeholder,
      .wordfriends-question-filters input::placeholder,
      .wordfriends-site-filters input::placeholder {
        color: #7ea09f;
      }
      .wordfriends-auth input:focus,
      .wordfriends-auth select:focus,
      .wordfriends-auth textarea:focus,
      .wordfriends-question-filters input:focus,
      .wordfriends-question-filters select:focus,
      .wordfriends-site-filters input:focus,
      .wordfriends-site-filters select:focus {
        border-color: #35c6a5;
        box-shadow: 0 0 0 3px rgba(53, 198, 165, .14);
        outline: none;
      }
      .wordfriends-button,
      .wordfriends-pagination .is-active {
        background: #28a987;
        border-color: #28a987;
        color: #05201b;
      }
      .wordfriends-button.wordfriends-button-secondary,
      .wordfriends-question-filters button,
      .wordfriends-site-filters button {
        background: #dff8ef;
        color: #05201b;
      }
      .wordfriends-auth-notice,
      .wordfriends-auth-success {
        border: 1px solid #2b6e62;
        background: #102f2c;
        color: #c9fff1;
      }
      .wordfriends-auth-error {
        border: 1px solid #7f3f3a;
        background: #351a1b;
        color: #ffd8d4;
      }
      .wordfriends-question-guide article {
        border-color: #24474d;
        background: #071a1f;
      }
      .wordfriends-question-guide strong {
        color: #f3fffd;
      }
      .wordfriends-question-guide span {
        color: #b8d6d4;
      }
      .wordfriends-auth-small,
      .wordfriends-question-filter-summary,
      .wordfriends-site-filter-summary,
      .wordfriends-dashboard-card .wordfriends-dashboard-detail,
      .wordfriends-site-next span,
      .wordfriends-site-meta small,
      .wordfriends-table th,
      .wordfriends-optional {
        color: #86aaa8;
      }
      .wordfriends-question-card,
      .wordfriends-site-card,
      .wordfriends-summary-box,
      .wordfriends-dashboard-card,
      .wordfriends-empty {
        border-color: #24474d;
        background: #102a30;
        color: #e6fffb;
      }
      .wordfriends-dashboard-card:hover,
      .wordfriends-dashboard-card:focus-visible {
        border-color: #35c6a5;
        background: #12342f;
        box-shadow: 0 14px 34px rgba(0, 0, 0, .28);
      }
      .wordfriends-question-answer,
      .wordfriends-site-note,
      .wordfriends-site-next,
      .wordfriends-site-meta span {
        border-color: #24474d;
        background: #071a1f;
        color: #e6fffb;
      }
      .wordfriends-question-status,
      .wordfriends-dashboard-badge {
        background: #dff8ef;
        color: #0f5f50;
      }
      .wordfriends-dashboard-badge.neutral {
        background: #d9e6ed;
        color: #28404a;
      }
      .wordfriends-dashboard-badge.warn {
        background: #ffe9b5;
        color: #6d4500;
      }
      .wordfriends-card-action,
      .wordfriends-site-card a.wordfriends-site-link,
      .wordfriends-site-details summary {
        color: #4ad6b4;
      }
      .wordfriends-site-progress-track {
        background: #24474d;
      }
      .wordfriends-site-progress-fill {
        background: #35c6a5;
      }
      .wordfriends-table th,
      .wordfriends-table td,
      .wordfriends-site-details {
        border-color: #24474d;
      }
      .wordfriends-pagination a,
      .wordfriends-pagination span {
        border-color: #24474d;
        background: #102a30;
        color: #d8f2ee;
      }
      .wordfriends-pagination .is-muted {
        color: #6f918f;
      }
      body:has(.wordfriends-auth) .entry-content {
        font-size: 15px;
        line-height: 1.55;
      }
      body:has(.wordfriends-auth) .wp-block-post-title,
      body:has(.wordfriends-auth) .entry-title,
      body:has(.wordfriends-auth) main h1 {
        font-size: clamp(26px, 2.6vw, 32px);
        line-height: 1.15;
        font-weight: 700;
      }
      .wordfriends-auth {
        font-size: 14px;
        line-height: 1.55;
      }
      .wordfriends-auth h2 {
        font-size: 20px;
        line-height: 1.25;
        margin-bottom: 8px;
      }
      .wordfriends-auth h3,
      .wordfriends-question-card h3,
      .wordfriends-site-card h3 {
        font-size: 15px;
        line-height: 1.35;
      }
      .wordfriends-auth p {
        font-size: 14px;
        line-height: 1.55;
      }
      .wordfriends-auth label {
        font-size: 14px;
      }
      .wordfriends-auth input[type="text"],
      .wordfriends-auth input[type="email"],
      .wordfriends-auth input[type="tel"],
      .wordfriends-auth input[type="number"],
      .wordfriends-auth input[type="password"],
      .wordfriends-auth select,
      .wordfriends-auth textarea,
      .wordfriends-question-filters input,
      .wordfriends-question-filters select,
      .wordfriends-site-filters input,
      .wordfriends-site-filters select {
        min-height: 40px;
        font-size: 14px;
      }
      .wordfriends-auth textarea {
        min-height: 132px;
      }
      .wordfriends-button,
      .wordfriends-question-filters button,
      .wordfriends-site-filters button {
        min-height: 38px;
        font-size: 13px;
      }
      .wordfriends-fieldset,
      .wordfriends-auth form {
        gap: 12px;
      }
      .wordfriends-services h3,
      .wordfriends-guide h3 {
        font-size: 19px;
        line-height: 1.35;
      }
      .wordfriends-services-section,
      .wordfriends-guide-section {
        padding: 18px;
      }
      .wordfriends-dashboard-card {
        min-height: 122px;
        padding: 14px;
      }
      .wordfriends-dashboard-card strong {
        font-size: 16px;
        line-height: 1.25;
      }
      .wordfriends-dashboard-card span {
        font-size: 14px;
        line-height: 1.45;
      }
      .wordfriends-dashboard-card .wordfriends-dashboard-detail,
      .wordfriends-summary-box small,
      .wordfriends-auth-small,
      .wordfriends-question-filter-summary,
      .wordfriends-site-filter-summary {
        font-size: 12px;
        line-height: 1.45;
      }
      .wordfriends-summary-box strong {
        font-size: 16px;
      }
      .wordfriends-question-card p,
      .wordfriends-question-answer,
      .wordfriends-table td {
        font-size: 14px;
        line-height: 1.55;
      }
      .wordfriends-question-answer strong {
        font-size: 15px;
      }
      body:has(.wordfriends-auth) header {
        border-bottom: 1px solid #12343a;
      }
      body:has(.wordfriends-auth) header .wp-block-site-title,
      body:has(.wordfriends-auth) header .wp-block-site-title a {
        color: #d8fff6;
        font-size: 18px;
        font-weight: 900;
      }
      body:has(.wordfriends-auth) .wp-block-navigation a {
        font-size: 14px;
        font-weight: 800;
      }
      body:has(.wordfriends-auth) .wp-block-navigation__container {
        gap: clamp(12px, 1.5vw, 22px);
      }
      body:has(.wordfriends-auth) .wp-block-navigation__responsive-container.is-menu-open,
      body.wordfriends-document-page .wp-block-navigation__responsive-container.is-menu-open {
        background: #061316 !important;
        color: #d8f2ee !important;
      }
      body:has(.wordfriends-auth) .wp-block-navigation__responsive-container.is-menu-open .wp-block-navigation__responsive-container-content,
      body.wordfriends-document-page .wp-block-navigation__responsive-container.is-menu-open .wp-block-navigation__responsive-container-content {
        align-items: center !important;
        padding: 72px 28px 32px !important;
      }
      body:has(.wordfriends-auth) .wp-block-navigation__responsive-container.is-menu-open .wp-block-navigation__container,
      body.wordfriends-document-page .wp-block-navigation__responsive-container.is-menu-open .wp-block-navigation__container {
        width: min(100%, 360px);
        align-items: stretch !important;
        gap: 10px !important;
      }
      body:has(.wordfriends-auth) .wp-block-navigation__responsive-container.is-menu-open .wp-block-navigation-item,
      body.wordfriends-document-page .wp-block-navigation__responsive-container.is-menu-open .wp-block-navigation-item {
        width: 100%;
      }
      body:has(.wordfriends-auth) .wp-block-navigation__responsive-container.is-menu-open a,
      body.wordfriends-document-page .wp-block-navigation__responsive-container.is-menu-open a {
        display: flex;
        justify-content: center;
        width: 100%;
        min-height: 42px;
        border: 1px solid #24474d;
        border-radius: 8px;
        background: #071a1f;
        color: #d8fff6 !important;
        text-align: center;
      }
      body:has(.wordfriends-auth) .wp-block-navigation__responsive-container-close,
      body.wordfriends-document-page .wp-block-navigation__responsive-container-close {
        color: #d8fff6 !important;
      }
      .wordfriends-home {
        max-width: 860px;
      }
      .wordfriends-home-hero {
        border: 1px solid #24474d;
        background: linear-gradient(135deg, #102a30 0%, #071a1f 100%);
        border-radius: 8px;
        padding: 22px;
        margin-bottom: 16px;
      }
      .wordfriends-home-eyebrow {
        display: block;
        margin-bottom: 10px;
        color: #5de0c0;
        font-size: 11px;
        font-weight: 900;
        letter-spacing: 0;
      }
      .wordfriends-home-actions {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
        margin-top: 18px;
      }
      .wordfriends-home-actions .wordfriends-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        box-sizing: border-box;
        min-width: 0;
        padding: 0 10px;
        text-align: center;
        white-space: nowrap;
      }
      .wordfriends-home-highlights {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 16px;
      }
      .wordfriends-home-highlights span,
      .wordfriends-home-mini-grid span {
        border: 1px solid #2a555c;
        border-radius: 8px;
        background: rgba(7, 26, 31, .78);
        color: #dffdf8;
        font-size: 12px;
        font-weight: 900;
        line-height: 1.35;
      }
      .wordfriends-home-highlights span {
        padding: 7px 10px;
      }
      .wordfriends-button-secondary {
        background: #dffff6;
        color: #071a1f;
      }
      .wordfriends-home-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
        margin: 20px 0;
      }
      .wordfriends-home-trust,
      .wordfriends-home-portal,
      .wordfriends-home-faq {
        display: grid;
        gap: 12px;
        margin: 16px 0;
      }
      .wordfriends-home-trust {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
      .wordfriends-home-portal {
        grid-template-columns: minmax(0, 1.05fr) minmax(0, .95fr);
      }
      .wordfriends-home-card {
        border: 1px solid #24474d;
        background: #102a30;
        color: #e6fffb;
        border-radius: 8px;
        padding: 16px;
        text-decoration: none;
        transition: transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
      }
      .wordfriends-home-card:hover,
      .wordfriends-home-card:focus-visible {
        transform: translateY(-2px);
        border-color: #35c6a5;
        box-shadow: 0 10px 24px rgba(0, 0, 0, 0.22);
      }
      .wordfriends-home-card strong {
        display: block;
        color: #f3fffd;
        font-size: 16px;
        line-height: 1.3;
      }
      .wordfriends-home-card span {
        display: block;
        margin-top: 8px;
        color: #b8d6d4;
        font-size: 14px;
        line-height: 1.55;
      }
      .wordfriends-home-card small {
        display: block;
        margin-bottom: 8px;
        color: #5de0c0;
        font-size: 11px;
        font-weight: 900;
        letter-spacing: 0;
        text-transform: uppercase;
      }
      .wordfriends-home-steps {
        border: 1px solid #24474d;
        background: #071a1f;
        border-radius: 8px;
        padding: 18px;
      }
      .wordfriends-home-steps ol {
        display: grid;
        gap: 10px;
        margin: 12px 0 0;
        padding-left: 20px;
      }
      .wordfriends-home-steps li strong {
        display: block;
        color: #f3fffd;
      }
      .wordfriends-home-steps li span {
        display: block;
        color: #b8d6d4;
        font-size: 14px;
      }
      .wordfriends-home-focus {
        margin: 18px 0;
      }
      .wordfriends-home-mini-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
        margin-top: 14px;
      }
      .wordfriends-home-mini-grid span {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 38px;
        padding: 8px 10px;
        text-align: center;
      }
      .wordfriends-home-ready-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
        margin-top: 14px;
      }
      .wordfriends-home-ready-grid article {
        border: 1px solid #24474d;
        border-radius: 8px;
        background: #102a30;
        padding: 14px;
        transition: transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
      }
      .wordfriends-home-ready-grid article:hover,
      .wordfriends-home-ready-grid article:focus-within {
        transform: translateY(-2px);
        border-color: #35c6a5;
        box-shadow: 0 10px 24px rgba(0, 0, 0, 0.22);
      }
      .wordfriends-home-ready-grid strong {
        display: block;
        color: #f3fffd;
        font-size: 14px;
        line-height: 1.35;
      }
      .wordfriends-home-ready-grid span {
        display: block;
        margin-top: 8px;
        color: #b8d6d4;
        font-size: 13px;
        line-height: 1.5;
      }
      .wordfriends-home-final-cta {
        display: grid;
        gap: 10px;
        border: 1px solid #35c6a5;
        border-radius: 8px;
        background: linear-gradient(135deg, rgba(43, 212, 183, .14), rgba(7, 26, 31, .96));
        padding: 18px;
        margin: 18px 0 12px;
      }
      .wordfriends-home-final-cta strong {
        color: #f3fffd;
        font-size: 18px;
        line-height: 1.35;
      }
      .wordfriends-home-final-cta span {
        color: #b8d6d4;
        font-size: 14px;
        line-height: 1.55;
      }
      .wordfriends-home-steps p,
      .wordfriends-home-faq p {
        color: #b8d6d4;
        font-size: 14px;
        line-height: 1.6;
      }
      @media (max-width: 640px) {
        body:has(.wordfriends-auth) main,
        body:has(.wordfriends-auth) .entry-content {
          overflow-x: hidden;
        }
        body:has(.wordfriends-auth) .wp-block-post-title,
        body:has(.wordfriends-auth) .entry-title,
        body:has(.wordfriends-auth) main h1 {
          font-size: 26px;
        }
        .wordfriends-auth h2 {
          font-size: 19px;
        }
        .wordfriends-auth p {
          font-size: 14px;
        }
        .wordfriends-dashboard-card strong {
          font-size: 15px;
        }
        .wordfriends-home-grid {
          grid-template-columns: 1fr;
        }
        .wordfriends-home-trust,
        .wordfriends-home-portal {
          grid-template-columns: 1fr;
        }
        .wordfriends-home-highlights,
        .wordfriends-home-mini-grid,
        .wordfriends-home-ready-grid {
          grid-template-columns: 1fr;
        }
        .wordfriends-home-highlights {
          display: grid;
        }
        .wordfriends-home-hero,
        .wordfriends-home-steps {
          padding: 16px;
        }
        .wordfriends-home-actions {
          grid-template-columns: 1fr;
          gap: 8px;
        }
        .wordfriends-home-actions .wordfriends-button {
          padding: 0 8px;
          font-size: 12px;
          white-space: normal;
        }
      }
      @media (max-width: 520px) {
        .wordfriends-portal-nav {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
        }
        .wordfriends-portal-nav a {
          width: 100%;
          min-height: 36px;
          padding: 0 8px;
          font-size: 11px;
          white-space: normal;
          text-align: center;
        }
        .wordfriends-inline-actions {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
        }
        .wordfriends-inline-actions .wordfriends-button {
          width: 100%;
          min-width: 0;
          padding-right: 8px;
          padding-left: 8px;
          white-space: normal;
          text-align: center;
        }
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

function wordfriends_siteops_normalize_phone($phone) {
    $phone = sanitize_text_field((string) $phone);
    $phone = preg_replace('/[^\d+\-\s().]/', '', $phone);
    $phone = preg_replace('/\s+/', ' ', trim((string) $phone));

    return mb_substr($phone, 0, 30);
}

function wordfriends_siteops_is_valid_phone($phone, $required = false) {
    $phone = trim((string) $phone);

    if ($phone === '') {
        return !$required;
    }

    $digits = preg_replace('/\D+/', '', $phone);
    return strlen($digits) >= 8 && strlen($digits) <= 15;
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
        $phone = wordfriends_siteops_normalize_phone(wp_unslash($_POST['wordfriends_phone'] ?? ''));
        $password = (string) ($_POST['wordfriends_password'] ?? '');
        $agree = isset($_POST['wordfriends_agree']);

        if (!$name || !$email || !$phone || !$password) {
            $GLOBALS['wordfriends_signup_error'] = '이름, 이메일, 전화번호, 비밀번호를 모두 입력해 주세요.';
            return;
        }

        if (!wordfriends_siteops_is_valid_phone($phone, true)) {
            $GLOBALS['wordfriends_signup_error'] = '전화번호 형식을 확인해 주세요.';
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
        update_user_meta($user_id, 'wordfriends_phone', $phone);
        update_user_meta($user_id, 'billing_phone', $phone);
        update_user_meta($user_id, 'wordfriends_signup_source', 'shortcode');

        wordfriends_siteops_send('/api/wordfriends/events', [
            'eventType' => 'signup_completed',
            'customerCode' => $customer_code,
            'name' => $name,
            'email' => $email,
            'phone' => $phone,
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
        $phone = wordfriends_siteops_normalize_phone(wp_unslash($_POST['wordfriends_question_phone'] ?? ''));
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

        if (!wordfriends_siteops_is_valid_phone($phone, false)) {
            $GLOBALS['wordfriends_question_error'] = '전화번호 형식을 확인해 주세요.';
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
        $phone = wordfriends_siteops_normalize_phone(wp_unslash($_POST['wordfriends_contract_phone'] ?? ''));
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

        if (!wordfriends_siteops_is_valid_phone($phone, false)) {
            $GLOBALS['wordfriends_contract_request_error'] = '전화번호 형식을 확인해 주세요.';
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
            $GLOBALS['wordfriends_contract_request_message'] = '계약 요청이 접수되었습니다. 진행 안내는 알림센터에서 확인할 수 있습니다.';
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

        $GLOBALS['wordfriends_contract_request_message'] = '계약 요청이 접수되었습니다. 진행 안내는 알림센터에서 확인할 수 있습니다.';
    }
}
add_action('init', 'wordfriends_siteops_handle_auth_posts');

function wordfriends_siteops_home_shortcode($atts = []) {
    $atts = shortcode_atts([
        'title' => 'Wordfriends',
        'subtitle' => '도메인 준비부터 WordPress 구축, 콘텐츠 운영 준비, AdSense 점검, 고객 포털 공유까지 헷갈리는 과정을 한 흐름으로 정리합니다.',
    ], $atts, 'wordfriends_home');

    ob_start();
    ?>
    <section class="wordfriends-auth wordfriends-home">
        <div class="wordfriends-home-hero">
            <span class="wordfriends-home-eyebrow">WORDFRIENDS PLATFORM</span>
            <h2><?php echo esc_html($atts['title']); ?></h2>
            <p><?php echo esc_html($atts['subtitle']); ?></p>
            <div class="wordfriends-home-highlights">
                <span>고객 소유 계정 원칙</span>
                <span>운영 준비 단계 공유</span>
                <span>수익·승인 보장 금지</span>
            </div>
            <div class="wordfriends-home-actions">
                <a class="wordfriends-button" href="<?php echo esc_url(wordfriends_siteops_question_page_url()); ?>">상담 문의</a>
                <a class="wordfriends-button wordfriends-button-secondary" href="<?php echo esc_url(wordfriends_siteops_start_guide_page_url()); ?>">구축절차 보기</a>
            </div>
        </div>

        <div class="wordfriends-home-trust">
            <article class="wordfriends-home-card">
                <small>CONFUSING STEP</small>
                <strong>무엇부터 준비할지 막막할 때</strong>
                <span>도메인, 호스팅, WordPress, 필수 페이지, 보안 기준을 순서대로 나눠 안내합니다.</span>
            </article>
            <article class="wordfriends-home-card">
                <small>OPERATIONS</small>
                <strong>운영 준비를 계속 확인해야 할 때</strong>
                <span>콘텐츠 큐, 사이트맵, 문의 답변, 진행 상태를 고객 포털 기준으로 정리합니다.</span>
            </article>
            <article class="wordfriends-home-card">
                <small>REVIEW</small>
                <strong>승인과 수익을 약속하지 않는 방식</strong>
                <span>보장형 문구 대신 정책, 콘텐츠 품질, 계정 상태, 운영 현황을 기준으로 검토합니다.</span>
            </article>
        </div>

        <div class="wordfriends-home-steps wordfriends-home-focus">
            <h3>Wordfriends가 정리하는 일</h3>
            <p>고객이 직접 소유해야 하는 계정과 Wordfriends가 지원하는 작업을 분리해, 나중에 계정 소유권이나 운영 책임이 흐려지지 않도록 정리합니다.</p>
            <div class="wordfriends-home-mini-grid">
                <span>도메인·호스팅 연결</span>
                <span>WordPress 기본 세팅</span>
                <span>필수 페이지 구성</span>
                <span>콘텐츠 운영 준비</span>
                <span>문의·알림 관리</span>
                <span>정산·추천 참고</span>
            </div>
        </div>

        <div class="wordfriends-home-steps wordfriends-home-method">
            <h3>운영 경험을 체크리스트로 정리합니다</h3>
            <p>Wordfriends는 반복 운영에서 확인한 항목을 기준으로 계정 소유, 도메인 구조, WordPress 세팅, 콘텐츠 운영, 정책 리스크를 순서대로 점검합니다.</p>
            <div class="wordfriends-home-ready-grid">
                <article>
                    <strong>계정은 고객 소유 기준</strong>
                    <span>AdSense와 Google 계정은 고객 소유를 원칙으로 하며, 필요한 확인 사항만 분리해 안내합니다.</span>
                </article>
                <article>
                    <strong>도메인 수는 작업 범위 기준</strong>
                    <span>도메인 수는 승인이나 수익을 의미하지 않고, 구축 범위와 운영 준비 항목을 산정하기 위한 기준입니다.</span>
                </article>
                <article>
                    <strong>반복 업무는 포털로 정리</strong>
                    <span>사이트 상태, 문의 답변, 알림, 정산 참고 정보를 고객 포털에서 확인할 수 있게 정리합니다.</span>
                </article>
            </div>
        </div>

        <div class="wordfriends-home-grid">
            <a class="wordfriends-home-card" href="<?php echo esc_url(wordfriends_siteops_services_page_url()); ?>">
                <small>01</small>
                <strong>서비스</strong>
                <span>구축, 운영 준비, 기술지원 범위를 한눈에 확인합니다.</span>
            </a>
            <a class="wordfriends-home-card" href="<?php echo esc_url(wordfriends_siteops_start_guide_page_url()); ?>">
                <small>02</small>
                <strong>구축절차</strong>
                <span>상담부터 계약, 세팅, 포털 공유까지 진행 순서를 안내합니다.</span>
            </a>
            <a class="wordfriends-home-card" href="<?php echo esc_url(wordfriends_siteops_cases_page_url()); ?>">
                <small>03</small>
                <strong>사례</strong>
                <span>고객 정보를 노출하지 않는 유형별 운영 예시를 확인합니다.</span>
            </a>
            <a class="wordfriends-home-card" href="<?php echo esc_url(wordfriends_siteops_guide_page_url()); ?>">
                <small>04</small>
                <strong>가이드/FAQ</strong>
                <span>AdSense, 도메인, WordPress, 보안 질문을 쉬운 순서로 정리합니다.</span>
            </a>
            <a class="wordfriends-home-card" href="<?php echo esc_url(wordfriends_siteops_dashboard_page_url()); ?>">
                <small>05</small>
                <strong>고객 포털</strong>
                <span>계약 후 내 사이트, 문의, 전자계약, 알림 상태를 확인합니다.</span>
            </a>
            <a class="wordfriends-home-card" href="<?php echo esc_url(wordfriends_siteops_contract_guide_page_url()); ?>">
                <small>06</small>
                <strong>전자계약</strong>
                <span>작업 범위, 비용, 계정 소유 원칙을 문서로 확인합니다.</span>
            </a>
        </div>

        <div class="wordfriends-home-steps">
            <h3>진행 흐름</h3>
            <p>처음 상담에서는 준비 상태를 확인하고, 계약 후에는 작업 상태와 필요한 확인 사항을 고객 포털에 공유합니다.</p>
            <ol>
                <li><strong>상담 및 준비 확인</strong><span>운영 목적, 희망 도메인 수, 계정 준비 상태를 확인합니다.</span></li>
                <li><strong>계약 조건 정리</strong><span>비용, 작업 범위, 계정 소유 원칙, 보장 금지 기준을 문서로 확인합니다.</span></li>
                <li><strong>세팅과 운영 준비</strong><span>도메인 연결, WordPress 구성, 필수 페이지, 콘텐츠 큐를 순서대로 준비합니다.</span></li>
                <li><strong>포털에서 상태 공유</strong><span>내 사이트 현황, 문의 답변, 계약 상태, 알림을 한곳에서 확인합니다.</span></li>
            </ol>
        </div>

        <div class="wordfriends-home-steps wordfriends-home-ready">
            <h3>이런 경우 먼저 상담해 주세요</h3>
            <div class="wordfriends-home-ready-grid">
                <article>
                    <strong>도메인만 준비한 상태</strong>
                    <span>네임서버, 호스팅, WordPress 연결 순서를 확인해야 할 때</span>
                </article>
                <article>
                    <strong>AdSense 준비가 막힌 상태</strong>
                    <span>필수 페이지, 정책 리스크, 콘텐츠 품질을 점검해야 할 때</span>
                </article>
                <article>
                    <strong>운영 상황을 한곳에 모으고 싶을 때</strong>
                    <span>문의, 알림, 사이트 상태, 정산 참고 정보를 고객 포털로 보고 싶을 때</span>
                </article>
            </div>
        </div>

        <div class="wordfriends-home-portal">
            <article class="wordfriends-home-card">
                <small>CUSTOMER PORTAL</small>
                <strong>계약 후에는 포털에서 확인합니다</strong>
                <span>내 사이트 현황, 문의 답변, 전자계약 상태, 정산·추천 참고 정보, 알림센터를 연결합니다. 진행 상황을 채팅에 흩뜨리지 않고 한곳에 모읍니다.</span>
            </article>
            <article class="wordfriends-home-card">
                <small>GUIDE</small>
                <strong>처음이라면 가이드부터</strong>
                <span>AdSense 기본, 도메인 준비, WordPress 세팅, 보안 원칙을 쉬운 순서로 확인할 수 있습니다. 실제 영상/글 콘텐츠도 이 구조에 연결합니다.</span>
            </article>
        </div>

        <div class="wordfriends-home-steps wordfriends-home-faq">
            <h3>먼저 알아둘 점</h3>
            <p>운영 이력 도메인이나 샌드박스 경과 도메인은 검토 가능한 후보 유형일 수 있지만, 검색 노출이나 승인에 유리하다고 단정하지 않습니다.</p>
            <p>Google 계정, 도메인, 호스팅, AdSense는 고객 소유를 원칙으로 합니다. Wordfriends는 운영대행, 콘텐츠 운영, 기술지원, 진행 상태 정리 역할을 수행합니다.</p>
        </div>

        <div class="wordfriends-home-final-cta">
            <strong>준비 상태가 애매해도 괜찮습니다</strong>
            <span>도메인 수, 운영 목적, 현재 준비된 계정만 알려주시면 다음 확인 순서를 안내드립니다.</span>
            <div class="wordfriends-home-actions">
                <a class="wordfriends-button" href="<?php echo esc_url(wordfriends_siteops_question_page_url()); ?>">상담 문의</a>
                <a class="wordfriends-button wordfriends-button-secondary" href="<?php echo esc_url(wordfriends_siteops_guide_page_url()); ?>">가이드/FAQ</a>
            </div>
        </div>

        <p class="wordfriends-auth-small">수익, AdSense 승인, 트래픽은 보장하지 않으며 운영 현황과 검토 결과를 기준으로 안내드립니다.</p>
    </section>
    <?php
    return ob_get_clean();
}
add_shortcode('wordfriends_home', 'wordfriends_siteops_home_shortcode');

function wordfriends_siteops_services_shortcode($atts = []) {
    $atts = shortcode_atts([
        'title' => '운영 진단부터 재설계와 관리 대행까지 정리합니다',
        'subtitle' => '구글 SEO, GEO, 도메인 검수, 콘텐츠 품질, 발행 점검, 사이트 상태를 함께 보고 필요한 운영 구조를 다시 설계합니다.',
    ], $atts, 'wordfriends_services');

    ob_start();
    ?>
    <section class="wordfriends-auth wordfriends-services">
        <div class="wordfriends-services-hero">
            <span class="wordfriends-services-eyebrow">WORDFRIENDS SERVICES</span>
            <h2><?php echo esc_html($atts['title']); ?></h2>
            <p><?php echo esc_html($atts['subtitle']); ?></p>
            <div class="wordfriends-services-actions">
                <a class="wordfriends-button" href="<?php echo esc_url(wordfriends_siteops_question_page_url()); ?>">상담 문의</a>
                <a class="wordfriends-button wordfriends-button-secondary" href="<?php echo esc_url(wordfriends_siteops_start_guide_page_url()); ?>">구축절차 보기</a>
            </div>
        </div>

        <div class="wordfriends-services-section">
            <h3>Wordfriends가 해주는 서비스</h3>
            <p>사이트가 왜 막히는지 먼저 진단하고, 고객 소유 계정 기준으로 검색·콘텐츠·기술·정책 상태를 정리한 뒤 재설계와 관리 대행 범위를 안내합니다.</p>
            <div class="wordfriends-services-grid">
                <article class="wordfriends-service-card">
                    <small>SEO / GEO</small>
                    <strong>검색 노출 구조 점검</strong>
                    <p>구글 검색과 AI 검색 환경에서 사이트 구조, 주제 연결, 기본 노출 준비 상태를 점검합니다.</p>
                    <ul class="wordfriends-service-list">
                        <li>구글 SEO 기본 구조 확인</li>
                        <li>GEO 관점의 주제·문맥 정리</li>
                        <li>검색 도구와 사이트맵 상태 점검</li>
                    </ul>
                </article>
                <article class="wordfriends-service-card">
                    <small>DOMAIN</small>
                    <strong>도메인 검수와 운영 이력 확인</strong>
                    <p>신규 도메인과 운영 이력 후보를 구분하고, 고객이 판단할 수 있는 검토 항목을 정리합니다.</p>
                    <ul class="wordfriends-service-list">
                        <li>소유권과 만료·갱신 상태 확인</li>
                        <li>운영 이력과 정책 리스크 참고 검토</li>
                        <li>네임서버·DNS 연결 준비 점검</li>
                    </ul>
                </article>
                <article class="wordfriends-service-card">
                    <small>CONTENT</small>
                    <strong>고품질 콘텐츠 개발과 발행 점검</strong>
                    <p>글 주제, 발행 기준, 금지 소재, 품질 점검 기준을 정리해 콘텐츠 운영 부담을 낮춥니다.</p>
                    <ul class="wordfriends-service-list">
                        <li>콘텐츠 주제와 카테고리 설계</li>
                        <li>발행글 품질·정책 리스크 점검</li>
                        <li>복사글·저품질 글 발행 방지</li>
                    </ul>
                </article>
                <article class="wordfriends-service-card">
                    <small>SITE OPS</small>
                    <strong>홈페이지 상태 진단과 관리 대행</strong>
                    <p>WordPress, 필수 페이지, 사이트맵, 플러그인, 고객 포털 연결 상태를 전반적으로 확인합니다.</p>
                    <ul class="wordfriends-service-list">
                        <li>홈페이지 전반 상태 점검</li>
                        <li>운영 중단 지점과 개선 항목 정리</li>
                        <li>재설계 후 관리 대행 범위 안내</li>
                    </ul>
                </article>
            </div>
        </div>

        <div class="wordfriends-services-section">
            <h3>컨설팅 이후 재설계 흐름</h3>
            <p>상담에서 끝내지 않고, 실제 운영에 필요한 항목을 점검표로 나눠 고객 포털과 진행 안내에 연결합니다.</p>
            <div class="wordfriends-service-proofs">
                <article class="wordfriends-service-proof">
                    <small>DIAGNOSIS</small>
                    <strong>진단</strong>
                    <p>도메인, 사이트, 콘텐츠, 검색 도구, AdSense 준비 상태를 한 번에 확인합니다.</p>
                </article>
                <article class="wordfriends-service-proof">
                    <small>REDESIGN</small>
                    <strong>재설계</strong>
                    <p>메뉴, 필수 페이지, 콘텐츠 카테고리, 발행 흐름을 운영 기준에 맞게 다시 정리합니다.</p>
                </article>
                <article class="wordfriends-service-proof">
                    <small>MANAGEMENT</small>
                    <strong>관리 대행</strong>
                    <p>반복 점검, 발행 준비, 정책 리스크 확인, 고객 포털 공유를 지속 운영합니다.</p>
                </article>
            </div>
        </div>

        <div class="wordfriends-services-section">
            <h3>서비스 범위</h3>
            <p>Wordfriends가 지원하는 작업과 고객이 직접 소유하고 확인해야 하는 항목을 분리해 안내합니다.</p>
            <div class="wordfriends-service-scope">
                <article>
                    <small>WORDFRIENDS SUPPORT</small>
                    <strong>Wordfriends가 정리하는 일</strong>
                    <ul class="wordfriends-service-list">
                        <li>도메인 연결과 WordPress 기본 세팅 지원</li>
                        <li>필수 페이지, 메뉴, 사이트맵 준비 점검</li>
                        <li>콘텐츠 운영 큐와 발행 준비 상태 정리</li>
                        <li>고객 포털에 사이트/문의/알림 상태 공유</li>
                    </ul>
                </article>
                <article>
                    <small>CUSTOMER OWNERSHIP</small>
                    <strong>고객이 소유하고 확인할 일</strong>
                    <ul class="wordfriends-service-list">
                        <li>도메인, 호스팅, Google 계정 소유</li>
                        <li>AdSense, Search Console, Analytics 계정 관리</li>
                        <li>계약 조건, 정산 참고 정보, 세금 정보 확인</li>
                        <li>정책 위반 가능성이 있는 요청 최종 판단</li>
                    </ul>
                </article>
            </div>
        </div>

        <div class="wordfriends-services-section">
            <h3>운영 방식</h3>
            <p>숨겨진 비법을 약속하기보다, 반복 운영에서 필요한 확인 항목을 체크리스트로 나눠 고객에게 공유합니다.</p>
            <div class="wordfriends-service-scope">
                <article>
                    <small>CHECKLIST</small>
                    <strong>반복 운영 체크리스트</strong>
                    <ul class="wordfriends-service-list">
                        <li>계정 소유와 접근 권한 확인</li>
                        <li>도메인 구조와 사이트별 준비 상태 확인</li>
                        <li>필수 페이지와 콘텐츠 품질 점검</li>
                        <li>정책 리스크와 보장 금지 기준 안내</li>
                    </ul>
                </article>
                <article>
                    <small>DOMAIN SCOPE</small>
                    <strong>도메인 수를 확인하는 이유</strong>
                    <ul class="wordfriends-service-list">
                        <li>사이트 구축 범위와 작업량 산정</li>
                        <li>콘텐츠 운영 큐와 점검 항목 분리</li>
                        <li>고객 포털에 표시할 사이트 상태 연결</li>
                        <li>승인·수익 보장이 아닌 운영 범위 확인</li>
                    </ul>
                </article>
            </div>
        </div>

        <div class="wordfriends-services-section">
            <h3>진행 흐름</h3>
            <p>고객이 준비해야 하는 항목과 Wordfriends가 처리하는 항목을 분리해, 진행 상황을 고객 포털에서 확인할 수 있게 만듭니다.</p>
            <div class="wordfriends-service-flow" aria-label="Wordfriends 진행 흐름">
                <div class="wordfriends-service-step">
                    <span>1</span>
                    <strong>고객 준비</strong>
                    <small>도메인, 계정, 요청사항, 계약 조건을 확인합니다.</small>
                </div>
                <div class="wordfriends-service-step">
                    <span>2</span>
                    <strong>세팅 정리</strong>
                    <small>WordPress, 필수 페이지, 운영 기준을 구성합니다.</small>
                </div>
                <div class="wordfriends-service-step">
                    <span>3</span>
                    <strong>운영 점검</strong>
                    <small>콘텐츠, 사이트맵, SEO, 정책 리스크를 점검합니다.</small>
                </div>
                <div class="wordfriends-service-step">
                    <span>4</span>
                    <strong>포털 공유</strong>
                    <small>내 사이트, 문의, 정산, 알림 상태를 고객에게 안내합니다.</small>
                </div>
            </div>
        </div>

        <div class="wordfriends-services-section">
            <h3>영상 가이드 준비 영역</h3>
            <p>글보다 화면을 보며 따라 하는 것이 편한 고객을 위해 단계별 짧은 영상 가이드를 배치할 수 있도록 자리를 만들어 둡니다.</p>
            <div class="wordfriends-service-videos">
                <article class="wordfriends-service-video">
                    <div class="wordfriends-service-video-frame">영상 준비</div>
                    <small>도메인</small>
                    <strong>도메인 구매와 네임서버 연결</strong>
                </article>
                <article class="wordfriends-service-video">
                    <div class="wordfriends-service-video-frame">영상 준비</div>
                    <small>WordPress</small>
                    <strong>기본 세팅과 필수 페이지 확인</strong>
                </article>
                <article class="wordfriends-service-video">
                    <div class="wordfriends-service-video-frame">영상 준비</div>
                    <small>Portal</small>
                    <strong>고객 포털에서 진행 현황 확인</strong>
                </article>
            </div>
        </div>

        <div class="wordfriends-services-section">
            <h3>운영 원칙</h3>
            <div class="wordfriends-service-proofs">
                <article class="wordfriends-service-proof">
                    <small>OWNERSHIP</small>
                    <strong>고객 소유 계정 원칙</strong>
                    <p>도메인, 호스팅, Google 계정은 고객 소유를 기준으로 안내합니다.</p>
                </article>
                <article class="wordfriends-service-proof">
                    <small>NO GUARANTEE</small>
                    <strong>보장 문구 금지</strong>
                    <p>수익, AdSense 승인, 트래픽, 검색 순위는 보장하지 않습니다.</p>
                </article>
                <article class="wordfriends-service-proof">
                    <small>REVIEW</small>
                    <strong>필요한 질문은 사람 검토</strong>
                    <p>정산, 세금, 정책성 문의는 자동 답변보다 담당자 검토를 우선합니다.</p>
                </article>
            </div>
        </div>

        <div class="wordfriends-service-cta">
            <strong>내 상황에 맞는 서비스 범위를 먼저 확인하세요</strong>
            <span>도메인 준비 상태, 운영 목적, 현재 막힌 지점을 남겨주시면 필요한 작업과 다음 순서를 안내드립니다.</span>
            <div class="wordfriends-services-actions">
                <a class="wordfriends-button" href="<?php echo esc_url(wordfriends_siteops_question_page_url()); ?>">상담 문의</a>
                <a class="wordfriends-button wordfriends-button-secondary" href="<?php echo esc_url(wordfriends_siteops_cases_page_url()); ?>">사례 보기</a>
            </div>
        </div>

        <p class="wordfriends-auth-small">Wordfriends는 운영대행, 콘텐츠 운영, 기술지원 역할을 수행하며 결과는 플랫폼 정책, 콘텐츠 품질, 시장 상황, 고객 계정 상태에 따라 달라질 수 있습니다.</p>
    </section>
    <?php
    return ob_get_clean();
}
add_shortcode('wordfriends_services', 'wordfriends_siteops_services_shortcode');

function wordfriends_siteops_post_url($slug) {
    static $cache = [];

    if (isset($cache[$slug])) {
        return $cache[$slug];
    }

    $post = get_page_by_path($slug, OBJECT, 'post');

    if ($post && $post->post_status === 'publish') {
        $cache[$slug] = get_permalink($post);
        return $cache[$slug];
    }

    $cache[$slug] = home_url('/' . trim($slug, '/') . '/');
    return $cache[$slug];
}

function wordfriends_siteops_guide_shortcode($atts = []) {
    $atts = shortcode_atts([
        'title' => '처음 준비하는 고객을 위한 가이드',
        'subtitle' => '도메인, WordPress, AdSense 준비, 콘텐츠 운영, 보안 원칙을 상담 전에 먼저 이해할 수 있도록 쉬운 순서로 정리합니다.',
    ], $atts, 'wordfriends_guide');

    $guide_links = [
        ['구글 애드센스', '기본 이해', 'adsense-basic-guide'],
        ['애드센스용 도메인', '구매 전 체크', 'domain-before-buy-checklist'],
        ['도메인 네임서버', '연결 이해하기', 'nameserver-dns-setup-guide'],
        ['애드센스 승인', '필수 페이지 준비', 'wordpress-required-pages'],
        ['AdSense 신청 전', '체크리스트', 'adsense-readiness-checklist'],
        ['애드센스', '금지사항', 'adsense-policy-violations'],
    ];

    ob_start();
    ?>
    <section class="wordfriends-auth wordfriends-guide">
        <div class="wordfriends-guide-hero">
            <span class="wordfriends-guide-eyebrow">WORDFRIENDS GUIDE / FAQ</span>
            <h2><?php echo esc_html($atts['title']); ?></h2>
            <p><?php echo esc_html($atts['subtitle']); ?></p>
            <div class="wordfriends-guide-actions">
                <a class="wordfriends-button" href="<?php echo esc_url(wordfriends_siteops_question_page_url()); ?>">상담 문의</a>
                <a class="wordfriends-button wordfriends-button-secondary" href="<?php echo esc_url(wordfriends_siteops_start_guide_page_url()); ?>">구축절차 보기</a>
            </div>
        </div>

        <div class="wordfriends-guide-section wordfriends-guide-featured">
            <div class="wordfriends-guide-featured-head">
                <div>
                    <h3>처음 읽을 가이드</h3>
                    <p>모바일에서도 바로 찾을 수 있도록 상담 전에 확인하면 좋은 글을 2열 버튼으로 정리했습니다.</p>
                </div>
            </div>
            <div class="wordfriends-guide-quicklinks" aria-label="Wordfriends published guide links">
                <?php foreach ($guide_links as $guide_link): ?>
                    <a href="<?php echo esc_url(wordfriends_siteops_post_url($guide_link[2])); ?>"><span><?php echo esc_html($guide_link[0]); ?></span><span><?php echo esc_html($guide_link[1]); ?></span></a>
                <?php endforeach; ?>
            </div>
        </div>

        <div class="wordfriends-guide-section">
            <h3>구글 애드센스 수익금은 무엇인가?</h3>
            <p>애드센스는 Google 광고 네트워크를 통해 사이트 지면에 광고가 노출되고, 정책에 맞는 광고 성과가 발생했을 때 게시자에게 수익이 배분되는 구조입니다.</p>
            <div class="wordfriends-guide-grid">
                <article class="wordfriends-guide-card">
                    <small>ADSENSE</small>
                    <strong>애드센스란?</strong>
                    <p>사이트 운영자가 Google 광고 코드를 붙이고, 방문자에게 관련 광고가 노출되는 광고 플랫폼입니다.</p>
                    <ul class="wordfriends-guide-list">
                        <li>Google 광고 네트워크 기반</li>
                        <li>사이트 콘텐츠와 광고 지면 연결</li>
                        <li>정책 기준에 맞는 운영 필요</li>
                    </ul>
                </article>
                <article class="wordfriends-guide-card">
                    <small>REVENUE</small>
                    <strong>왜 수익이 발생하나요?</strong>
                    <p>구글 광고주는 노출과 클릭 등 광고 성과에 비용을 지불하고, Google은 그 일부를 애드센스 운영자에게 광고비로 배분합니다.</p>
                    <ul class="wordfriends-guide-list">
                        <li>구글 광고 예산 기반</li>
                        <li>구글 광고 성과에 따른 정산 구조</li>
                    </ul>
                </article>
                <article class="wordfriends-guide-card">
                    <small>GOOGLE</small>
                    <strong>Google은 왜 지급하나요?</strong>
                    <p>좋은 콘텐츠와 방문자가 있는 사이트가 광고 지면을 제공하기 때문에 광고 생태계가 유지됩니다.</p>
                    <ul class="wordfriends-guide-list">
                        <li>광고주와 게시자 연결</li>
                        <li>콘텐츠 지면 활용</li>
                        <li>정책 위반 시 제한 가능</li>
                    </ul>
                </article>
                <article class="wordfriends-guide-card">
                    <small>LEGAL</small>
                    <strong>합법인가요?</strong>
                    <p>정책과 관련 법규를 지키며 운영하면 일반적인 온라인 광고 수익 모델로 활용할 수 있습니다.</p>
                    <ul class="wordfriends-guide-list">
                        <li>광고 정책 준수</li>
                        <li>저작권과 개인정보 기준 확인</li>
                        <li>세금과 정산은 별도 확인</li>
                    </ul>
                </article>
                <article class="wordfriends-guide-card">
                    <small>SAFETY</small>
                    <strong>안전한가요?</strong>
                    <p>계정 소유권, 비밀번호 관리, 금지 클릭, 복사 콘텐츠를 피하는 기본 안전 원칙이 중요합니다.</p>
                    <ul class="wordfriends-guide-list">
                        <li>본인 광고 클릭 금지</li>
                        <li>고객 소유 계정 원칙</li>
                        <li>저품질·복사글 주의</li>
                    </ul>
                </article>
                <article class="wordfriends-guide-card">
                    <small>MANAGEMENT</small>
                    <strong>관리는 쉬운가요?</strong>
                    <p>지속적인 관리, 고품질 콘텐츠 발행, 정책 점검, 사이트 운영 상태 확인이 중요합니다.</p>
                    <ul class="wordfriends-guide-list">
                        <li>콘텐츠 발행 기준</li>
                        <li>정책 리스크 점검</li>
                        <li>사이트 운영 상태 지속 관리</li>
                    </ul>
                </article>
            </div>
        </div>

        <div class="wordfriends-guide-section">
            <h3>구글 애드센스 카테고리 설계 순서</h3>
            <p>애드센스 준비와 운영을 고객이 이해하기 쉬운 순서로 정리합니다. 각 단계는 상담, 구축절차, 고객 포털 안내와 자연스럽게 연결됩니다.</p>
            <div class="wordfriends-guide-category-map">
                <article class="wordfriends-guide-category-row">
                    <div><small>STEP 01</small><strong>애드센스 가이드</strong></div>
                    <p>AdSense 신청 전 이해해야 할 기본 개념, 정책 리스크, 콘텐츠 품질 기준을 먼저 설명합니다.</p>
                    <ul><li>구글 애드센스 기본 이해</li><li>AdSense 신청 전 체크리스트</li><li>애드센스 금지사항</li></ul>
                </article>
                <article class="wordfriends-guide-category-row">
                    <div><small>STEP 02</small><strong>도메인/호스팅/서버 준비</strong></div>
                    <p>도메인 구매, 운영 이력 후보, 네임서버, DNS, SSL, 호스팅 연결처럼 초기 세팅에서 막히는 지점을 다룹니다.</p>
                    <ul><li>애드센스용 도메인 구매 전 체크</li><li>도메인 네임서버 연결 이해하기</li><li>SSL과 DNS 기본</li></ul>
                </article>
                <article class="wordfriends-guide-category-row">
                    <div><small>STEP 03</small><strong>애드센스 WordPress 구축 및 세팅</strong></div>
                    <p>WordPress 기본 구조, 필수 페이지, 메뉴, 사이트맵, Search Console, ads.txt 확인 순서를 정리합니다.</p>
                    <ul><li>애드센스 승인 필수 페이지 준비</li><li>사이트맵 제출</li><li>Search Console 연결</li></ul>
                </article>
                <article class="wordfriends-guide-category-row">
                    <div><small>STEP 04</small><strong>수익형 애드센스 운영</strong></div>
                    <p>콘텐츠 주제 설계, 발행 큐, 사람 검토, 금지 소재, 운영 점검 루틴을 보장 문구 없이 안내합니다.</p>
                    <ul><li>콘텐츠 운영 루틴</li><li>금지 소재 점검</li><li>발행 후 점검</li></ul>
                </article>
                <article class="wordfriends-guide-category-row">
                    <div><small>STEP 05</small><strong>운영·콘텐츠</strong></div>
                    <p>AI 초안과 사람 검토를 나누고, 카테고리 설계와 발행 기준을 품질 중심으로 정리합니다.</p>
                    <ul><li>글감과 카테고리 설계</li><li>사람 검토 기준</li><li>발행 품질 점검</li></ul>
                </article>
                <article class="wordfriends-guide-category-row">
                    <div><small>STEP 06</small><strong>정산·추천</strong></div>
                    <p>고객 포털에서 정산 참고 상태, 추천 보상, 알림을 확인하는 방법을 안내합니다.</p>
                    <ul><li>정산 참고 상태</li><li>추천 보상 확인</li><li>알림센터 확인</li></ul>
                </article>
                <article class="wordfriends-guide-category-row">
                    <div><small>STEP 07</small><strong>보안·계정</strong></div>
                    <p>비밀번호, Google 계정, API 키를 안전하게 다루고 고객 소유 원칙을 지키는 기준을 정리합니다.</p>
                    <ul><li>비밀번호 공유 금지</li><li>고객 소유 계정 원칙</li><li>API 키·토큰 비공개</li></ul>
                </article>
                <article class="wordfriends-guide-category-row">
                    <div><small>STEP 08</small><strong>워드프랜즈 관리</strong></div>
                    <p>Wordfriends는 운영대행, 콘텐츠 운영, 기술지원, 진행 상태 정리를 맡고 고객 포털로 현황을 안내합니다.</p>
                    <ul><li>사이트 운영 점검</li><li>문의와 계약 상태 안내</li><li>진행 현황 공유</li></ul>
                </article>
            </div>
        </div>

        <div class="wordfriends-guide-section">
            <h3>자주 묻는 질문</h3>
            <div class="wordfriends-guide-faq">
                <details open>
                    <summary>샌드박스 기간이 지난 도메인을 구매할 수 있나요?</summary>
                    <p>운영 이력, 연령, 백링크 등을 참고한 후보 검수는 가능하지만 모든 도메인이 검색 노출이나 승인에 유리하다고 보장되지는 않습니다. 고객 소유 원칙에 따라 구매 전 소유권과 비용을 먼저 확인합니다.</p>
                </details>
                <details>
                    <summary>AdSense 승인을 보장하나요?</summary>
                    <p>보장하지 않습니다. Wordfriends는 필수 페이지, 정책 위험, 콘텐츠 품질, 운영 상태를 기준으로 준비를 돕고 검토 결과를 안내합니다.</p>
                </details>
                <details>
                    <summary>도메인·호스팅·Google 계정은 누가 소유하나요?</summary>
                    <p>고객 소유를 원칙으로 합니다. Wordfriends는 운영대행, 콘텐츠 운영, 기술지원 역할을 수행합니다.</p>
                </details>
                <details>
                    <summary>계정 비밀번호를 보내야 하나요?</summary>
                    <p>아니요. 비밀번호, AdSense 로그인 정보, API 키는 문의창이나 이메일로 보내지 않는 것이 원칙입니다.</p>
                </details>
                <details>
                    <summary>처음이면 어디부터 보면 되나요?</summary>
                    <p>구축절차 페이지에서 전체 흐름을 보고, 이 가이드에서 AdSense와 도메인 기본 개념을 순서대로 확인하면 됩니다.</p>
                </details>
                <details>
                    <summary>도메인 수는 왜 확인하나요?</summary>
                    <p>도메인 수는 승인이나 수익을 의미하지 않습니다. 사이트 구축 범위, 콘텐츠 운영 큐, 고객 포털에 표시할 사이트 상태를 나누기 위한 기준입니다.</p>
                </details>
                <details>
                    <summary>Wordfriends가 모든 운영을 대신하나요?</summary>
                    <p>반복되는 기술 세팅과 운영 준비는 정리하지만, 계정 소유권, 계약 조건, 정산 참고 정보, 중요한 승인 절차는 고객 확인을 기준으로 진행합니다.</p>
                </details>
            </div>
        </div>

        <div class="wordfriends-guide-section">
            <h3>영상 가이드 준비 영역</h3>
            <p>글보다 화면을 보고 따라 하는 것이 편한 고객을 위해 짧은 영상 가이드를 배치할 수 있도록 자리를 만들어 둡니다.</p>
            <div class="wordfriends-guide-videos">
                <article class="wordfriends-guide-video">
                    <div class="wordfriends-guide-video-frame">영상 준비</div>
                    <small>DOMAIN</small>
                    <strong>도메인 구매와 네임서버 연결</strong>
                </article>
                <article class="wordfriends-guide-video">
                    <div class="wordfriends-guide-video-frame">영상 준비</div>
                    <small>ADSENSE</small>
                    <strong>AdSense 신청 전 체크리스트</strong>
                </article>
                <article class="wordfriends-guide-video">
                    <div class="wordfriends-guide-video-frame">영상 준비</div>
                    <small>PORTAL</small>
                    <strong>고객 포털에서 진행 상태 확인</strong>
                </article>
            </div>
        </div>

        <div class="wordfriends-guide-callout">운영 이력 도메인, 샌드박스 경과 도메인, AdSense 준비 상태는 검수와 참고 정보로만 안내합니다. 검색 순위, 색인, 승인, 수익은 보장하지 않습니다.</div>
        <div class="wordfriends-service-cta">
            <strong>가이드를 봐도 애매한 부분은 상담으로 정리하세요</strong>
            <span>도메인 후보, 준비된 계정, 현재 막힌 지점을 남겨주시면 어떤 글이나 절차부터 보면 좋을지 안내드립니다.</span>
            <div class="wordfriends-guide-actions">
                <a class="wordfriends-button" href="<?php echo esc_url(wordfriends_siteops_question_page_url()); ?>">상담 문의</a>
                <a class="wordfriends-button wordfriends-button-secondary" href="<?php echo esc_url(wordfriends_siteops_start_guide_page_url()); ?>">구축절차 보기</a>
            </div>
        </div>
    </section>
    <?php
    return ob_get_clean();
}

add_shortcode('wordfriends_guide', 'wordfriends_siteops_guide_shortcode');

function wordfriends_siteops_start_guide_shortcode($atts = []) {
    $atts = shortcode_atts([
        'title' => '상담부터 고객 포털 공유까지',
        'subtitle' => '계약 전 확인, 전자계약, 기술 세팅, 운영 준비, 고객 포털 공유까지 실제 진행 순서를 단계별로 안내합니다.',
    ], $atts, 'wordfriends_start_guide');

    ob_start();
    ?>
    <section class="wordfriends-auth wordfriends-services">
        <div class="wordfriends-services-hero">
            <span class="wordfriends-services-eyebrow">WORDFRIENDS SETUP FLOW</span>
            <h2><?php echo esc_html($atts['title']); ?></h2>
            <p><?php echo esc_html($atts['subtitle']); ?></p>
            <div class="wordfriends-services-actions">
                <a class="wordfriends-button" href="<?php echo esc_url(wordfriends_siteops_question_page_url()); ?>">상담 문의</a>
                <a class="wordfriends-button wordfriends-button-secondary" href="<?php echo esc_url(wordfriends_siteops_contract_guide_page_url()); ?>">전자계약 안내</a>
            </div>
        </div>

        <div class="wordfriends-services-section">
            <h3>전체 진행 단계</h3>
            <p>수익이나 승인을 약속하는 흐름이 아니라, 고객 소유 계정과 운영 준비 상태를 기준으로 필요한 작업을 차례대로 확인합니다.</p>
            <div class="wordfriends-service-flow" aria-label="Wordfriends setup flow">
                <div class="wordfriends-service-step"><span>1</span><strong>상담 접수</strong><small>운영 목적, 희망 도메인 수, 준비된 계정과 문의 내용을 확인합니다.</small></div>
                <div class="wordfriends-service-step"><span>2</span><strong>조건 정리</strong><small>도메인, 호스팅, WordPress, 콘텐츠 범위와 고객 소유 원칙을 정리합니다.</small></div>
                <div class="wordfriends-service-step"><span>3</span><strong>계약 안내</strong><small>전자계약 요청, 계약서 링크, 입금 확인, 세팅 시작 조건을 안내합니다.</small></div>
                <div class="wordfriends-service-step"><span>4</span><strong>기술 세팅</strong><small>도메인 연결, SSL, WordPress, 필수 페이지, 사이트맵을 구성합니다.</small></div>
                <div class="wordfriends-service-step"><span>5</span><strong>운영 준비</strong><small>콘텐츠 주제, 발행 큐, 정책 리스크, AdSense 준비 상태를 점검합니다.</small></div>
                <div class="wordfriends-service-step"><span>6</span><strong>포털 공유</strong><small>내 사이트, 문의, 알림, 정산 참고 정보를 고객 포털에서 확인하게 합니다.</small></div>
            </div>
        </div>

        <div class="wordfriends-services-section">
            <h3>단계별 확인 포인트</h3>
            <p>각 단계에서 확인해야 하는 항목을 미리 알면 계약 이후 세팅과 운영 준비가 훨씬 부드럽게 이어집니다.</p>
            <div class="wordfriends-setup-checkpoints">
                <article>
                    <small>BEFORE CONTRACT</small>
                    <strong>계약 전 확인</strong>
                    <ul class="wordfriends-service-list">
                        <li>운영 목적과 희망 도메인 수</li>
                        <li>도메인/호스팅/Google 계정 준비 상태</li>
                        <li>콘텐츠 주제와 피해야 할 소재</li>
                    </ul>
                </article>
                <article>
                    <small>CONTRACT</small>
                    <strong>전자계약 및 시작 조건</strong>
                    <ul class="wordfriends-service-list">
                        <li>작업 범위와 비용 확인</li>
                        <li>고객 소유 계정 원칙 확인</li>
                        <li>입금 확인 후 세팅 일정 안내</li>
                    </ul>
                </article>
                <article>
                    <small>SETUP</small>
                    <strong>세팅과 운영 준비</strong>
                    <ul class="wordfriends-service-list">
                        <li>도메인 연결과 WordPress 기본 구성</li>
                        <li>필수 페이지와 사이트맵 준비</li>
                        <li>콘텐츠 큐와 정책 리스크 점검</li>
                    </ul>
                </article>
                <article>
                    <small>PORTAL</small>
                    <strong>고객 포털 공유</strong>
                    <ul class="wordfriends-service-list">
                        <li>내 사이트 현황 확인</li>
                        <li>문의 답변과 알림센터 확인</li>
                        <li>정산·추천 참고 상태 확인</li>
                    </ul>
                </article>
            </div>
        </div>

        <div class="wordfriends-services-section">
            <h3>고객 준비 체크리스트</h3>
            <p>아래 항목이 준비되어 있으면 상담과 세팅 속도가 빨라집니다. 준비가 덜 된 항목은 상담 단계에서 같이 정리할 수 있습니다.</p>
            <div class="wordfriends-services-grid">
                <article class="wordfriends-service-card">
                    <small>ACCOUNT</small>
                    <strong>계정과 소유권</strong>
                    <p>도메인, 호스팅, Google 계정은 고객 소유를 기준으로 준비합니다.</p>
                    <ul class="wordfriends-service-list">
                        <li>도메인 구매처 또는 후보</li>
                        <li>호스팅/서버 준비 상태</li>
                        <li>Google 계정과 AdSense 준비 여부</li>
                    </ul>
                </article>
                <article class="wordfriends-service-card">
                    <small>CONTENT</small>
                    <strong>운영 주제</strong>
                    <p>사이트 목적과 피해야 할 소재를 먼저 정해야 콘텐츠 품질 관리가 쉬워집니다.</p>
                    <ul class="wordfriends-service-list">
                        <li>희망 카테고리와 타깃 독자</li>
                        <li>금지 소재와 정책 리스크</li>
                        <li>초기 글감 또는 참고 사이트</li>
                    </ul>
                </article>
                <article class="wordfriends-service-card">
                    <small>CONTRACT</small>
                    <strong>계약 조건</strong>
                    <p>작업 범위, 비용, 정산 참고 방식, 추천 보상 기준을 문서로 확인합니다.</p>
                    <ul class="wordfriends-service-list">
                        <li>작업 범위와 일정</li>
                        <li>계약자 정보와 연락처</li>
                        <li>정산/추천 안내 확인</li>
                    </ul>
                </article>
                <article class="wordfriends-service-card">
                    <small>SECURITY</small>
                    <strong>보안 원칙</strong>
                    <p>비밀번호와 키를 채팅에 보내지 않고, 필요한 권한만 안전하게 확인합니다.</p>
                    <ul class="wordfriends-service-list">
                        <li>비밀번호 직접 공유 금지</li>
                        <li>API 키·토큰 비공개</li>
                        <li>권한 부여 방식 별도 안내</li>
                    </ul>
                </article>
            </div>
        </div>

        <div class="wordfriends-services-section">
            <h3>진행 상태 안내 기준</h3>
            <div class="wordfriends-service-proofs">
                <article class="wordfriends-service-proof">
                    <small>READY</small>
                    <strong>준비 완료</strong>
                    <p>계약과 기본 자료가 확인되어 세팅을 시작할 수 있는 상태입니다.</p>
                </article>
                <article class="wordfriends-service-proof">
                    <small>IN PROGRESS</small>
                    <strong>세팅/운영 중</strong>
                    <p>도메인 연결, WordPress 구성, 콘텐츠 준비, 검수가 진행 중인 상태입니다.</p>
                </article>
                <article class="wordfriends-service-proof">
                    <small>REVIEW</small>
                    <strong>검토 필요</strong>
                    <p>정책, 보안, 계정, 계약 조건처럼 담당자 확인이 필요한 상태입니다.</p>
                </article>
            </div>
        </div>

        <div class="wordfriends-service-cta">
            <strong>지금 어느 단계인지 모르겠다면 먼저 문의해 주세요</strong>
            <span>현재 준비된 계정, 도메인 후보, 운영 목적만 알려주시면 상담 단계에서 다음 순서를 정리해 드립니다.</span>
            <div class="wordfriends-services-actions">
                <a class="wordfriends-button" href="<?php echo esc_url(wordfriends_siteops_question_page_url()); ?>">상담 문의</a>
                <a class="wordfriends-button wordfriends-button-secondary" href="<?php echo esc_url(wordfriends_siteops_services_page_url()); ?>">서비스 보기</a>
            </div>
        </div>

        <p class="wordfriends-auth-small">Wordfriends는 구축과 운영 준비를 돕지만 AdSense 승인, 검색 순위, 트래픽, 수익은 보장하지 않습니다.</p>
    </section>
    <?php
    return ob_get_clean();
}
add_shortcode('wordfriends_start_guide', 'wordfriends_siteops_start_guide_shortcode');

function wordfriends_siteops_cases_shortcode($atts = []) {
    $atts = shortcode_atts([
        'title' => '고객 문제 해결 사례',
        'subtitle' => '구축절차는 실행 순서, 사례는 고객이 왜 Wordfriends에 운영을 맡기는지 이해할 수 있는 상황별 시나리오로 정리합니다.',
    ], $atts, 'wordfriends_cases');

    ob_start();
    ?>
    <section class="wordfriends-auth wordfriends-guide">
        <div class="wordfriends-guide-hero">
            <span class="wordfriends-guide-eyebrow">WORDFRIENDS CASES</span>
            <h2><?php echo esc_html($atts['title']); ?></h2>
            <p><?php echo esc_html($atts['subtitle']); ?></p>
            <div class="wordfriends-guide-actions">
                <a class="wordfriends-button" href="<?php echo esc_url(wordfriends_siteops_question_page_url()); ?>">상담 문의</a>
                <a class="wordfriends-button wordfriends-button-secondary" href="<?php echo esc_url(wordfriends_siteops_services_page_url()); ?>">서비스 보기</a>
            </div>
        </div>

        <div class="wordfriends-guide-section wordfriends-cases-map">
            <h3>왜 Wordfriends에 맡기나요?</h3>
            <p>고객은 도메인, WordPress, 콘텐츠, 정책, 계정 관리가 한 번에 얽히는 지점에서 어려움을 느낍니다. Wordfriends는 고객 소유 계정을 기준으로 필요한 작업을 정리하고, 정책에 맞는 운영 가이드를 제시합니다.</p>
            <div class="wordfriends-cases-map-grid">
                <article><small>OWNERSHIP</small><strong>고객 소유 원칙</strong><span>Google, 도메인, 호스팅, AdSense는 고객 소유를 기준으로 안내합니다.</span></article>
                <article><small>GUIDE</small><strong>정책 맞춤 운영</strong><span>승인이나 수익을 보장하지 않고, Google 정책에 맞춘 준비 항목을 점검합니다.</span></article>
                <article><small>PORTAL</small><strong>한곳에서 확인</strong><span>사이트 현황, 문의 답변, 계약, 정산 참고 정보를 고객 포털에서 확인합니다.</span></article>
            </div>
        </div>

        <div class="wordfriends-guide-section">
            <h3>대표 고객 시나리오</h3>
            <p>아래 내용은 실제 고객 정보를 공개하는 수익 사례가 아니라, 상담에서 자주 만나는 문제와 Wordfriends가 정리하는 운영 범위를 설명하는 예시입니다.</p>
            <div class="wordfriends-guide-grid">
                <article class="wordfriends-guide-card">
                    <small>CASE 01</small>
                    <strong>AdSense가 처음인 고객</strong>
                    <p>AdSense가 무엇인지, 왜 광고 정산 구조가 생기는지, 고객이 직접 소유해야 할 계정이 무엇인지 먼저 정리합니다.</p>
                    <ul class="wordfriends-guide-list">
                        <li>AdSense 기본 구조 안내</li>
                        <li>고객 소유 계정 원칙</li>
                        <li>수익·승인 보장 금지 고지</li>
                    </ul>
                </article>
                <article class="wordfriends-guide-card">
                    <small>CASE 02</small>
                    <strong>도메인 선택이 어려운 고객</strong>
                    <p>Wordfriends가 검토 가능한 도메인 후보와 운영 이력 참고 자료를 정리해 고객이 판단할 수 있도록 돕습니다.</p>
                    <ul class="wordfriends-guide-list">
                        <li>도메인 소유권 확인</li>
                        <li>운영 이력 참고 검토</li>
                        <li>구매 전 판단 자료 정리</li>
                    </ul>
                </article>
                <article class="wordfriends-guide-card">
                    <small>CASE 03</small>
                    <strong>WordPress 운영이 부담인 고객</strong>
                    <p>설치, 필수 페이지, 메뉴, 사이트맵, Search Console, ads.txt처럼 초기에 헷갈리는 항목을 순서대로 정리합니다.</p>
                    <ul class="wordfriends-guide-list">
                        <li>기본 세팅 점검</li>
                        <li>필수 페이지 구성</li>
                        <li>검색 도구 연결 안내</li>
                    </ul>
                </article>
                <article class="wordfriends-guide-card">
                    <small>CASE 04</small>
                    <strong>콘텐츠와 정책이 걱정인 고객</strong>
                    <p>복사글, 금지 클릭, 과장 표현, 저품질 콘텐츠처럼 운영 중 문제가 될 수 있는 기준을 먼저 점검합니다.</p>
                    <ul class="wordfriends-guide-list">
                        <li>콘텐츠 주제 정리</li>
                        <li>정책 리스크 점검</li>
                        <li>발행 후 관리 기준 안내</li>
                    </ul>
                </article>
                <article class="wordfriends-guide-card">
                    <small>CASE 05</small>
                    <strong>진행 상황을 보고 싶은 고객</strong>
                    <p>작업을 맡긴 뒤에도 내 사이트, 문의 답변, 전자계약, 정산 참고, 알림을 포털에서 확인할 수 있게 정리합니다.</p>
                    <ul class="wordfriends-guide-list">
                        <li>고객 포털 안내</li>
                        <li>알림센터 공유</li>
                        <li>문의·계약 흐름 연결</li>
                    </ul>
                </article>
                <article class="wordfriends-guide-card">
                    <small>CASE 06</small>
                    <strong>장기 운영을 준비하는 고객</strong>
                    <p>단기 작업보다 꾸준한 관리 기준이 중요합니다. Wordfriends는 글로벌 운영 관점에서 콘텐츠, 기술, 계정 상태를 함께 봅니다.</p>
                    <ul class="wordfriends-guide-list">
                        <li>운영 루틴 정리</li>
                        <li>계정·보안 기준 확인</li>
                        <li>장기 관리 방향 제안</li>
                    </ul>
                </article>
            </div>
        </div>

        <div class="wordfriends-guide-section">
            <h3>Wordfriends가 정리하는 범위</h3>
            <div class="wordfriends-cases-map-grid">
                <article><small>DATA</small><strong>상태 정리</strong><span>도메인, 계정, 사이트, 문의, 계약 상태를 고객이 이해하기 쉬운 기준으로 정리합니다.</span></article>
                <article><small>CONTENT</small><strong>콘텐츠 운영</strong><span>글 주제, 발행 기준, 금지 소재, 품질 점검 기준을 운영 흐름에 맞게 안내합니다.</span></article>
                <article><small>TECH</small><strong>기술 지원</strong><span>WordPress, 플러그인, 사이트맵, 검색 도구, 보안 기준을 점검합니다.</span></article>
            </div>
        </div>

        <div class="wordfriends-guide-section">
            <h3>고객이 편해지는 지점</h3>
            <p>고객은 계정과 도메인을 직접 소유하고, Wordfriends는 운영 대행과 기술 지원을 통해 복잡한 절차를 한 흐름으로 정리합니다.</p>
            <div class="wordfriends-cases-map-grid">
                <article><small>1</small><strong>설명보다 실행</strong><span>무엇을 해야 하는지 흩어진 정보를 찾는 대신, 필요한 작업 순서를 안내받습니다.</span></article>
                <article><small>2</small><strong>고객 포털 확인</strong><span>사이트 상태와 문의 답변, 계약, 알림을 한곳에서 확인합니다.</span></article>
                <article><small>3</small><strong>정책 기준 운영</strong><span>금지 클릭, 복사 콘텐츠, 과장 표현처럼 위험한 운영 방식을 피하도록 안내합니다.</span></article>
            </div>
        </div>

        <div class="wordfriends-guide-section">
            <h3>사례를 읽는 기준</h3>
            <div class="wordfriends-guide-faq">
                <details open>
                    <summary>사례가 실제 수익을 의미하나요?</summary>
                    <p>아니요. 사례는 운영 유형과 작업 범위를 설명하기 위한 예시이며 수익, 트래픽, 승인, 검색 순위를 보장하지 않습니다. 다만 고객이 직접 관리하기 어려운 콘텐츠 발행, 정책 점검, 사이트 운영을 Wordfriends가 정리해 장기적으로 안정적인 운영 기반을 만드는 데 집중합니다.</p>
                </details>
                <details>
                    <summary>내 상황과 비슷한 사례를 상담할 수 있나요?</summary>
                    <p>가능합니다. 문의 페이지에서 도메인 준비 상태, 운영 목적, 궁금한 점을 남기면 담당자가 확인 후 안내합니다.</p>
                </details>
                <details>
                    <summary>고객 정보가 공개되나요?</summary>
                    <p>공개 사례는 고객명, 도메인, 계정 정보를 노출하지 않는 유형 중심으로 정리합니다.</p>
                </details>
            </div>
        </div>

        <div class="wordfriends-guide-callout">사례는 의사결정을 돕는 참고 자료입니다. AdSense 승인, 수익, 트래픽, 검색 순위는 보장하지 않으며 결과는 고객 계정 상태, 도메인 이력, 콘텐츠 품질, 플랫폼 정책, 운영 기간에 따라 달라질 수 있습니다.</div>
        <div class="wordfriends-service-cta">
            <strong>내 상황과 비슷한 사례가 있다면 상담으로 이어가세요</strong>
            <span>도메인 준비 상태와 운영 목적을 남겨주시면 어떤 범위부터 정리하면 좋을지 안내드립니다.</span>
            <div class="wordfriends-guide-actions">
                <a class="wordfriends-button" href="<?php echo esc_url(wordfriends_siteops_question_page_url()); ?>">상담 문의</a>
                <a class="wordfriends-button wordfriends-button-secondary" href="<?php echo esc_url(wordfriends_siteops_start_guide_page_url()); ?>">구축절차 보기</a>
            </div>
        </div>
    </section>
    <?php
    return ob_get_clean();
}
add_shortcode('wordfriends_cases', 'wordfriends_siteops_cases_shortcode');

function wordfriends_siteops_signup_shortcode($atts = []) {
    $atts = shortcode_atts([
        'redirect' => '',
        'title' => '고객 계정 만들기',
        'subtitle' => '계약 후 내 사이트, 문의 답변, 전자계약, 알림 상태를 확인하기 위한 Wordfriends 고객 계정입니다.',
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
            $phone = wordfriends_siteops_normalize_phone(wp_unslash($_POST['wordfriends_phone'] ?? ''));
            $password = (string) ($_POST['wordfriends_password'] ?? '');
            $agree = isset($_POST['wordfriends_agree']);

            if (!$name || !$email || !$phone || !$password) {
                $error = '이름, 이메일, 전화번호, 비밀번호를 모두 입력해 주세요.';
            } elseif (!wordfriends_siteops_is_valid_phone($phone, true)) {
                $error = '전화번호 형식을 확인해 주세요.';
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
                    update_user_meta($user_id, 'wordfriends_phone', $phone);
                    update_user_meta($user_id, 'billing_phone', $phone);
                    update_user_meta($user_id, 'wordfriends_signup_source', 'shortcode');

                    wordfriends_siteops_send('/api/wordfriends/events', [
                        'eventType' => 'signup_completed',
                        'customerCode' => $customer_code,
                        'name' => $name,
                        'email' => $email,
                        'phone' => $phone,
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
      <div class="wordfriends-question-guide">
        <article>
          <strong>고객 포털에서 확인할 수 있습니다</strong>
          <span>내 사이트 현황, 문의 답변, 전자계약 상태, 알림센터, 정산·추천 참고 정보를 한곳에서 확인합니다.</span>
        </article>
        <article>
          <strong>계정 소유 원칙을 유지합니다</strong>
          <span>Google, AdSense, 도메인, 호스팅 계정은 고객 소유를 기준으로 안내합니다.</span>
        </article>
      </div>
      <?php if ($message) : ?>
        <div class="wordfriends-auth-notice"><?php echo esc_html($message); ?></div>
        <div class="wordfriends-inline-actions">
          <a class="wordfriends-button" href="<?php echo esc_url(wordfriends_siteops_login_page_url()); ?>">로그인하기</a>
          <a class="wordfriends-button wordfriends-button-secondary" href="<?php echo esc_url(wordfriends_siteops_question_page_url()); ?>">문의하기</a>
        </div>
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
            전화번호
            <input type="tel" name="wordfriends_phone" autocomplete="tel" inputmode="tel" maxlength="30" pattern="[0-9+\-\s().]{8,30}" placeholder="010-0000-0000" required />
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
      <div class="wordfriends-inline-actions">
        <a class="wordfriends-button wordfriends-button-secondary" href="<?php echo esc_url(wordfriends_siteops_login_page_url()); ?>">이미 계정이 있어요</a>
        <a class="wordfriends-button wordfriends-button-secondary" href="<?php echo esc_url(wordfriends_siteops_question_page_url()); ?>">가입 전 문의</a>
      </div>
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
        'subtitle' => '내 사이트 현황, 문의 답변, 전자계약, 알림 상태를 확인하기 위한 고객 로그인입니다.',
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
      <div class="wordfriends-question-guide">
        <article>
          <strong>계약 후 진행 상태 확인</strong>
          <span>사이트 세팅, 문의 답변, 계약 상태, 알림을 고객 포털에서 확인합니다.</span>
        </article>
        <article>
          <strong>비밀번호와 키는 공유하지 않습니다</strong>
          <span>민감정보는 문의창이나 이메일에 남기지 않고, 필요한 권한만 별도 안내합니다.</span>
        </article>
      </div>
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
      <div class="wordfriends-inline-actions">
        <a class="wordfriends-button wordfriends-button-secondary" href="<?php echo esc_url(wordfriends_siteops_signup_page_url()); ?>">회원가입</a>
        <a class="wordfriends-button wordfriends-button-secondary" href="<?php echo esc_url(wordfriends_siteops_question_page_url()); ?>">로그인 문의</a>
      </div>
      <p class="wordfriends-auth-small">로그인 후 고객 포털에서 내 사이트, 문의 답변, 전자계약, 알림센터, 정산·추천 참고 정보를 확인할 수 있습니다.</p>
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
        'title' => '상담 문의',
        'subtitle' => '도메인 준비, WordPress 구축, AdSense 점검, 계약, 고객 포털 관련 문의를 남겨 주세요. 담당자가 확인 후 안내드립니다.',
        'category' => 'general',
    ], $atts, 'wordfriends_question');

    $message = $GLOBALS['wordfriends_question_message'] ?? '';
    $error = $GLOBALS['wordfriends_question_error'] ?? '';
    $selected_category = sanitize_key($atts['category']);
    $categories = [
        'general' => '일반 문의',
        'setup' => '구축 상담',
        'contract' => '계약',
        'settlement' => '정산',
        'adsense' => '애드센스',
        'domain' => '도메인/호스팅',
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
      <div class="wordfriends-question-guide">
        <article>
          <strong>빠른 상담을 위해 알려 주세요</strong>
          <span>도메인 보유 여부, 희망 도메인 수, 운영 목적, 현재 막힌 지점을 함께 남겨주시면 확인이 빨라집니다.</span>
        </article>
        <article>
          <strong>민감정보는 입력하지 마세요</strong>
          <span>계정 비밀번호, AdSense 로그인 정보, API 키, DB 비밀번호는 문의창에 남기지 않습니다.</span>
        </article>
      </div>
      <?php if ($user && $user->ID) : ?>
        <?php echo wordfriends_siteops_render_customer_nav('questions'); ?>
      <?php endif; ?>
      <?php if ($message) : ?>
        <div class="wordfriends-auth-success"><?php echo esc_html($message); ?></div>
        <?php if ($user && $user->ID) : ?>
          <div class="wordfriends-inline-actions">
            <a class="wordfriends-button wordfriends-button-secondary" href="<?php echo esc_url(wordfriends_siteops_my_questions_page_url()); ?>">내 문의 보기</a>
            <a class="wordfriends-button" href="<?php echo esc_url(wordfriends_siteops_dashboard_page_url()); ?>">고객포털</a>
          </div>
        <?php endif; ?>
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
              <input type="tel" name="wordfriends_question_phone" autocomplete="tel" inputmode="tel" maxlength="30" pattern="[0-9+\-\s().]{8,30}" placeholder="010-0000-0000" />
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
            <textarea name="wordfriends_question_body" required placeholder="예: 도메인 2개 준비됨 / WordPress 구축 상담 희망 / 현재 막힌 부분은 네임서버 연결입니다."></textarea>
          </label>
        </div>
        <button class="wordfriends-button" type="submit">문의 접수</button>
        <p class="wordfriends-auth-small wordfriends-question-form-note">문의 접수 후 담당자가 확인하여 답변을 등록합니다. 로그인 고객은 내 문의에서 답변 상태를 확인할 수 있습니다.</p>
        <p class="wordfriends-auth-small wordfriends-question-form-note">수익, 애드센스 승인, 트래픽은 보장하지 않으며 운영 현황과 검토 결과를 기준으로 안내됩니다.</p>
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
      <?php if ($user && $user->ID) : ?>
        <?php echo wordfriends_siteops_render_customer_nav('contract'); ?>
      <?php endif; ?>
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
      <?php elseif ($user && $user->ID && !$message && !$error) : ?>
        <div class="wordfriends-empty">
          <strong>아직 접수된 계약 요청이 없습니다.</strong>
          <p class="wordfriends-auth-small">계약 요청 후 진행 안내는 알림센터에서 확인할 수 있습니다. 계약 관련 질문은 문의 메뉴에 남겨 주세요.</p>
          <p>
            <a class="wordfriends-button wordfriends-button-secondary" href="<?php echo esc_url(wordfriends_siteops_timeline_page_url()); ?>">알림센터</a>
            <a class="wordfriends-button wordfriends-button-secondary" href="<?php echo esc_url(wordfriends_siteops_question_page_url()); ?>">문의</a>
          </p>
        </div>
      <?php endif; ?>

      <div class="wordfriends-question-guide">
        <article>
          <strong>계약 요청 후 확인 방법</strong>
          <span>계약 진행 안내는 알림센터에서 확인할 수 있습니다. 계약 관련 질문은 문의 메뉴에 남겨 주세요.</span>
        </article>
        <article>
          <strong>도메인 수는 작업 범위 기준입니다</strong>
          <span>도메인 수는 승인이나 수익을 의미하지 않고, 구축 범위와 운영 준비 항목을 확인하기 위한 기준입니다.</span>
        </article>
      </div>

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
              <input type="tel" name="wordfriends_contract_phone" autocomplete="tel" inputmode="tel" maxlength="30" pattern="[0-9+\-\s().]{8,30}" placeholder="010-0000-0000" />
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
        'setup' => '구축 상담',
        'contract' => '계약',
        'settlement' => '정산',
        'adsense' => '애드센스',
        'domain' => '도메인/호스팅',
        'tax' => '세금',
        'policy' => '정책/약관',
        'technical' => '기술 지원',
    ];

    return $labels[$category] ?? '일반 문의';
}

function wordfriends_siteops_render_customer_nav($active = '') {
    $links = [
        'dashboard' => ['label' => '고객포털', 'url' => wordfriends_siteops_dashboard_page_url()],
        'sites' => ['label' => '내 사이트', 'url' => wordfriends_siteops_my_sites_page_url()],
        'questions' => ['label' => '내 문의', 'url' => wordfriends_siteops_my_questions_page_url()],
        'contract' => ['label' => '전자계약', 'url' => wordfriends_siteops_contract_guide_page_url()],
        'settlement' => ['label' => '정산·추천', 'url' => wordfriends_siteops_settlement_referrals_page_url()],
        'timeline' => ['label' => '알림센터', 'url' => wordfriends_siteops_timeline_page_url()],
    ];

    ob_start();
    ?>
    <nav class="wordfriends-portal-nav" aria-label="고객 포털 내부 이동">
      <?php foreach ($links as $key => $link) : ?>
        <a class="<?php echo $active === $key ? 'is-active' : ''; ?>" href="<?php echo esc_url($link['url']); ?>"><?php echo esc_html($link['label']); ?></a>
      <?php endforeach; ?>
    </nav>
    <?php
    return ob_get_clean();
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
    $answered_questions = array_filter($questions, function ($question) {
        return in_array($question['status'] ?? '', ['answered', 'closed'], true);
    });
    $active_sites = array_filter($sites, function ($site) {
        return in_array($site['status'] ?? '', ['active', 'ACTIVE'], true) || ($site['statusLabel'] ?? '') === '운영 중';
    });
    $site_badge = count($sites) > 0 ? count($active_sites) . '개 운영' : '연결 대기';
    $site_badge_class = count($sites) > 0 ? '' : ' neutral';
    $question_badge = count($open_questions) > 0 ? '확인 필요' : '답변 완료';
    $question_badge_class = count($open_questions) > 0 ? ' warn' : '';
    $settlement_badge = $latest_settlement ? ($latest_settlement['statusLabel'] ?? '업데이트') : '준비 중';
    $settlement_badge_class = $latest_settlement ? '' : ' neutral';
    $notice_badge = count($timeline) > 0 ? '새 소식' : '대기';
    $notice_badge_class = count($timeline) > 0 ? '' : ' neutral';
    $site_detail = $latest_site
        ? (($latest_site['domain'] ?? '사이트') . ' · ' . ($latest_site['contentStatus'] ?? '운영 현황 확인'))
        : 'SiteOps 연결 후 도메인 운영 현황이 표시됩니다.';
    $question_detail = $latest_question
        ? (($latest_question['categoryLabel'] ?? '문의') . ' · ' . ($latest_question['statusLabel'] ?? '접수'))
        : '새 문의와 답변 상태를 확인합니다.';
    $settlement_detail = $latest_settlement
        ? (($latest_settlement['month'] ?? '최근') . ' · ' . ($latest_settlement['agencyFee'] ?? '정산 참고'))
        : ($referral_code ? ('추천 코드 ' . ($referral_code['code'] ?? '확인 중')) : '정산 참고와 추천 보상을 확인합니다.');
    $notice_detail = $latest_notice
        ? (($latest_notice['title'] ?? '알림') . ' · ' . ($latest_notice['statusLabel'] ?? '안내'))
        : '새 알림이 이곳에 표시됩니다.';

    ob_start();
    ?>
    <section class="wordfriends-auth">
      <h2><?php echo esc_html($atts['title']); ?></h2>
      <p><?php echo esc_html($atts['subtitle']); ?></p>
      <?php echo wordfriends_siteops_render_customer_nav('dashboard'); ?>
      <div class="wordfriends-question-guide">
        <article>
          <strong>진행 상황을 한곳에 모읍니다</strong>
          <span>내 사이트 현황, 문의 답변, 전자계약, 알림, 정산 참고 정보를 고객 포털에서 확인합니다.</span>
        </article>
        <article>
          <strong>중요한 확인은 고객 기준으로 진행합니다</strong>
          <span>계정 소유권, 계약 조건, 정산 참고 정보는 고객 확인을 기준으로 안내합니다.</span>
        </article>
      </div>
      <div class="wordfriends-dashboard-grid">
        <a class="wordfriends-dashboard-card" href="<?php echo esc_url(wordfriends_siteops_my_sites_page_url()); ?>">
          <div class="wordfriends-dashboard-card-head">
            <small>내 사이트</small>
            <em class="wordfriends-dashboard-badge<?php echo esc_attr($site_badge_class); ?>"><?php echo esc_html($site_badge); ?></em>
          </div>
          <strong><?php echo esc_html(count($sites)); ?>개</strong>
          <span><?php echo esc_html(count($sites) > 0 ? '연결된 사이트 운영 상태를 확인합니다.' : '연결된 사이트가 표시됩니다.'); ?></span>
          <span class="wordfriends-dashboard-detail"><?php echo esc_html($site_detail); ?></span>
          <em class="wordfriends-card-action">현황 보기</em>
        </a>
        <a class="wordfriends-dashboard-card" href="<?php echo esc_url(wordfriends_siteops_my_questions_page_url()); ?>">
          <div class="wordfriends-dashboard-card-head">
            <small>내 문의</small>
            <em class="wordfriends-dashboard-badge<?php echo esc_attr($question_badge_class); ?>"><?php echo esc_html($question_badge); ?></em>
          </div>
          <strong><?php echo esc_html(count($open_questions)); ?>건 확인 중</strong>
          <span>답변 완료 <?php echo esc_html(count($answered_questions)); ?>건</span>
          <span class="wordfriends-dashboard-detail"><?php echo esc_html($question_detail); ?></span>
          <em class="wordfriends-card-action">문의 보기</em>
        </a>
        <a class="wordfriends-dashboard-card" href="<?php echo esc_url(wordfriends_siteops_settlement_referrals_page_url()); ?>">
          <div class="wordfriends-dashboard-card-head">
            <small>정산/추천</small>
            <em class="wordfriends-dashboard-badge<?php echo esc_attr($settlement_badge_class); ?>"><?php echo esc_html($settlement_badge); ?></em>
          </div>
          <strong><?php echo esc_html($latest_settlement['statusLabel'] ?? '준비 중'); ?></strong>
          <span><?php echo esc_html($referral_code ? ('추천 코드 ' . ($referral_code['code'] ?? '확인 중')) : '정산 참고와 추천 보상을 확인합니다.'); ?></span>
          <span class="wordfriends-dashboard-detail"><?php echo esc_html($settlement_detail); ?></span>
          <em class="wordfriends-card-action">정산 보기</em>
        </a>
        <a class="wordfriends-dashboard-card" href="<?php echo esc_url(wordfriends_siteops_timeline_page_url()); ?>">
          <div class="wordfriends-dashboard-card-head">
            <small>알림센터</small>
            <em class="wordfriends-dashboard-badge<?php echo esc_attr($notice_badge_class); ?>"><?php echo esc_html($notice_badge); ?></em>
          </div>
          <strong><?php echo esc_html(count($timeline)); ?>건</strong>
          <span>계약, 문의, 정산 관련 안내를 모아봅니다.</span>
          <span class="wordfriends-dashboard-detail"><?php echo esc_html($notice_detail); ?></span>
          <em class="wordfriends-card-action">알림 보기</em>
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

    $question_query = sanitize_text_field(wp_unslash($_GET['wfq_q'] ?? ''));
    $question_status = sanitize_text_field(wp_unslash($_GET['wfq_status'] ?? 'all'));
    $question_per_page = absint($_GET['wfq_per_page'] ?? 5);
    $question_per_page = in_array($question_per_page, [5, 10, 20], true) ? $question_per_page : 5;
    $all_question_count = count($questions);
    $question_status_options = [
        'all' => '전체',
        'answered' => '답변 완료',
        'human_review' => '사람 검토',
        'received' => '접수',
        'draft' => '초안',
    ];
    if (!array_key_exists($question_status, $question_status_options)) {
        $question_status = 'all';
    }

    if ($question_query !== '') {
        $needle = strtolower($question_query);
        $questions = array_values(array_filter($questions, function ($question) use ($needle) {
            $haystack = implode(' ', [
                wordfriends_siteops_question_category_label($question['category'] ?? 'general'),
                $question['category'] ?? '',
                $question['statusLabel'] ?? '',
                $question['status'] ?? '',
                $question['question'] ?? '',
                $question['responseMessage'] ?? '',
            ]);
            return stripos($haystack, $needle) !== false;
        }));
    }

    if ($question_status !== 'all') {
        $questions = array_values(array_filter($questions, function ($question) use ($question_status) {
            return ($question['status'] ?? '') === $question_status
                || ($question['responseStatus'] ?? '') === $question_status;
        }));
    }

    $filtered_question_count = count($questions);
    $question_pagination = wordfriends_siteops_paginate_items($questions, 'wfq_page', $question_per_page);
    $questions = $question_pagination['items'];

    ob_start();
    ?>
    <section class="wordfriends-auth">
      <h2><?php echo esc_html($atts['title']); ?></h2>
      <p><?php echo esc_html($atts['subtitle']); ?></p>
      <?php echo wordfriends_siteops_render_customer_nav('questions'); ?>
      <div class="wordfriends-inline-actions">
        <a class="wordfriends-button" href="<?php echo esc_url(wordfriends_siteops_question_page_url()); ?>">새 문의 접수</a>
      </div>
      <?php if ($error) : ?>
        <div class="wordfriends-auth-error"><?php echo esc_html($error); ?></div>
      <?php else : ?>
        <form class="wordfriends-question-filters" method="get">
          <label>
            문의 검색
            <input type="search" name="wfq_q" value="<?php echo esc_attr($question_query); ?>" placeholder="분류, 문의 내용, 답변">
          </label>
          <label>
            상태
            <select name="wfq_status">
              <?php foreach ($question_status_options as $value => $label) : ?>
                <option value="<?php echo esc_attr($value); ?>" <?php selected($question_status, $value); ?>><?php echo esc_html($label); ?></option>
              <?php endforeach; ?>
            </select>
          </label>
          <label>
            표시
            <select name="wfq_per_page">
              <?php foreach ([5, 10, 20] as $count) : ?>
                <option value="<?php echo esc_attr((string) $count); ?>" <?php selected($question_per_page, $count); ?>><?php echo esc_html((string) $count); ?>개</option>
              <?php endforeach; ?>
            </select>
          </label>
          <button type="submit">적용</button>
        </form>
        <p class="wordfriends-question-filter-summary">전체 <?php echo esc_html((string) $all_question_count); ?>건 중 <?php echo esc_html((string) $filtered_question_count); ?>건 표시</p>
      <?php endif; ?>
      <?php if (!$error && !$questions) : ?>
        <div class="wordfriends-empty">
          <strong><?php echo $all_question_count ? '조건에 맞는 문의가 없습니다.' : '아직 접수된 문의가 없습니다.'; ?></strong>
          <p class="wordfriends-auth-small"><?php echo $all_question_count ? '검색어 또는 상태 필터를 조정해 주세요.' : '문의 페이지에서 남긴 내용은 이곳에 표시됩니다.'; ?></p>
          <?php if (!$all_question_count) : ?>
            <p><a class="wordfriends-button" href="<?php echo esc_url(wordfriends_siteops_question_page_url()); ?>">새 문의 접수</a></p>
          <?php endif; ?>
        </div>
      <?php elseif (!$error) : ?>
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

    $site_query = sanitize_text_field(wp_unslash($_GET['wfsites_q'] ?? ''));
    $site_status = sanitize_text_field(wp_unslash($_GET['wfsites_status'] ?? 'all'));
    $site_per_page = absint($_GET['wfsites_per_page'] ?? 4);
    $site_per_page = in_array($site_per_page, [4, 8, 12], true) ? $site_per_page : 4;
    $all_site_count = count($sites);
    $status_options = [
        'all' => '전체',
        '세팅 준비' => '세팅 준비',
        '운영 준비' => '운영 준비',
        '운영 안정' => '운영 안정',
        '확인 필요' => '확인 필요',
    ];
    if (!array_key_exists($site_status, $status_options)) {
        $site_status = 'all';
    }

    if ($site_query !== '') {
        $needle = strtolower($site_query);
        $sites = array_values(array_filter($sites, function ($site) use ($needle) {
            $haystack = implode(' ', [
                $site['domain'] ?? '',
                $site['siteName'] ?? '',
                $site['siteKey'] ?? '',
                $site['statusLabel'] ?? '',
                $site['healthSummary'] ?? '',
                $site['contentStatus'] ?? '',
                $site['nextAction'] ?? '',
            ]);
            return stripos($haystack, $needle) !== false;
        }));
    }

    if ($site_status !== 'all') {
        $sites = array_values(array_filter($sites, function ($site) use ($site_status) {
            return ($site['healthSummary'] ?? '') === $site_status;
        }));
    }

    $filtered_site_count = count($sites);
    $site_pagination = wordfriends_siteops_paginate_items($sites, 'wfsites_page', $site_per_page);
    $sites = $site_pagination['items'];

    ob_start();
    ?>
    <section class="wordfriends-auth">
      <h2><?php echo esc_html($atts['title']); ?></h2>
      <p><?php echo esc_html($atts['subtitle']); ?></p>
      <?php echo wordfriends_siteops_render_customer_nav('sites'); ?>
      <div class="wordfriends-question-guide">
        <article>
          <strong>무엇을 확인하나요?</strong>
          <span>도메인별 세팅 상태, 콘텐츠 준비, 사이트맵, 애드센스 점검 상태를 한 화면에서 확인합니다.</span>
        </article>
        <article>
          <strong>다음 행동만 먼저 봐도 됩니다</strong>
          <span>카드의 다음 안내를 기준으로 진행 상황을 확인하고, 궁금한 점은 문의 메뉴에 남겨 주세요.</span>
        </article>
      </div>
      <?php if ($error) : ?>
        <div class="wordfriends-auth-error"><?php echo esc_html($error); ?></div>
      <?php else : ?>
        <form class="wordfriends-site-filters" method="get">
          <label>
            사이트 검색
            <input type="search" name="wfsites_q" value="<?php echo esc_attr($site_query); ?>" placeholder="도메인, 상태, 다음 안내">
          </label>
          <label>
            상태
            <select name="wfsites_status">
              <?php foreach ($status_options as $value => $label) : ?>
                <option value="<?php echo esc_attr($value); ?>" <?php selected($site_status, $value); ?>><?php echo esc_html($label); ?></option>
              <?php endforeach; ?>
            </select>
          </label>
          <label>
            표시
            <select name="wfsites_per_page">
              <?php foreach ([4, 8, 12] as $count) : ?>
                <option value="<?php echo esc_attr((string) $count); ?>" <?php selected($site_per_page, $count); ?>><?php echo esc_html((string) $count); ?>개</option>
              <?php endforeach; ?>
            </select>
          </label>
          <button type="submit">적용</button>
        </form>
        <p class="wordfriends-site-filter-summary">전체 <?php echo esc_html((string) $all_site_count); ?>개 중 <?php echo esc_html((string) $filtered_site_count); ?>개 표시</p>
      <?php endif; ?>
      <?php if (!$error && !$sites) : ?>
        <div class="wordfriends-empty">
          <strong><?php echo $all_site_count ? '조건에 맞는 사이트가 없습니다.' : '연결된 사이트가 아직 없습니다.'; ?></strong>
          <p class="wordfriends-auth-small"><?php echo $all_site_count ? '검색어 또는 상태 필터를 조정해 주세요.' : '계약과 세팅이 진행되고 SiteOps에서 고객 연결이 완료되면 이곳에 사이트 현황이 표시됩니다.'; ?></p>
          <?php if (!$all_site_count) : ?>
            <p>
              <a class="wordfriends-button wordfriends-button-secondary" href="<?php echo esc_url(wordfriends_siteops_contract_guide_page_url()); ?>">전자계약 안내</a>
              <a class="wordfriends-button wordfriends-button-secondary" href="<?php echo esc_url(wordfriends_siteops_question_page_url()); ?>">문의하기</a>
            </p>
          <?php endif; ?>
        </div>
      <?php elseif (!$error) : ?>
        <div class="wordfriends-site-grid">
          <?php foreach ($sites as $site) : ?>
            <?php
              $progress = max(0, min(100, intval($site['progressPercent'] ?? 0)));
              $content = is_array($site['content'] ?? null) ? $site['content'] : [];
              $sitemap = is_array($site['sitemap'] ?? null) ? $site['sitemap'] : [];
              $seo = is_array($site['seo'] ?? null) ? $site['seo'] : [];
              $prepared_count = intval($content['approvedCount'] ?? 0) + intval($content['inProgressCount'] ?? 0);
            ?>
            <article class="wordfriends-site-card">
              <header>
                <h3><?php echo esc_html($site['domain'] ?? $site['siteName'] ?? 'Wordfriends 사이트'); ?></h3>
                <span class="wordfriends-question-status"><?php echo esc_html($site['healthSummary'] ?? $site['statusLabel'] ?? '준비 중'); ?></span>
              </header>
              <?php if (!empty($site['websiteUrl'])) : ?>
                <p class="wordfriends-auth-small"><a class="wordfriends-site-link" href="<?php echo esc_url($site['websiteUrl']); ?>" target="_blank" rel="noopener noreferrer">사이트 열기</a></p>
              <?php endif; ?>
              <div class="wordfriends-site-next">
                <small>다음 안내</small>
                <strong><?php echo esc_html($site['nextAction'] ?? '운영 상태를 확인 중입니다.'); ?></strong>
                <?php if (!empty($site['lastActivityAt'])) : ?>
                  <span>최근 갱신: <?php echo esc_html($site['lastActivityAt']); ?></span>
                <?php endif; ?>
              </div>
              <div class="wordfriends-inline-actions wordfriends-site-actions">
                <a class="wordfriends-button wordfriends-button-secondary" href="<?php echo esc_url(wordfriends_siteops_timeline_page_url()); ?>">진행 알림 보기</a>
                <a class="wordfriends-button wordfriends-button-secondary" href="<?php echo esc_url(wordfriends_siteops_question_page_url()); ?>">문의하기</a>
              </div>
              <div class="wordfriends-site-meta">
                <span><small>콘텐츠</small><?php echo esc_html($site['contentStatus'] ?? '콘텐츠 준비 중'); ?></span>
                <span><small>사이트맵</small><?php echo esc_html($sitemap['statusLabel'] ?? '준비 중'); ?></span>
                <span><small>애드센스</small><?php echo esc_html($seo['adsenseStatusLabel'] ?? '준비 중'); ?></span>
                <span><small>정산 참고</small><?php echo esc_html($site['settlementStatus'] ?? '정산 준비 중'); ?></span>
              </div>
              <div class="wordfriends-site-progress">
                <div class="wordfriends-site-progress-track" aria-label="콘텐츠 진행률">
                  <span class="wordfriends-site-progress-fill" style="width: <?php echo esc_attr($progress); ?>%;"></span>
                </div>
                <p class="wordfriends-auth-small">
                  콘텐츠 진행률 <?php echo esc_html($progress); ?>%
                  · 발행 <?php echo esc_html(intval($content['publishedCount'] ?? 0)); ?>건
                  · 준비 <?php echo esc_html($prepared_count); ?>건
                  · 실패 <?php echo esc_html(intval($content['failedCount'] ?? 0)); ?>건
                </p>
              </div>
              <details class="wordfriends-site-details">
                <summary>세부 현황 보기</summary>
                <div class="wordfriends-site-meta">
                  <span><small>워드프레스</small><?php echo esc_html($site['wpStatusLabel'] ?? '연결 준비'); ?></span>
                  <span><small>운영 점검</small><?php echo esc_html($site['riskLabel'] ?? '기본 점검'); ?></span>
                  <span><small>ads.txt</small><?php echo esc_html($seo['adsTxtStatusLabel'] ?? '확인 전'); ?></span>
                  <span><small>검색엔진</small><?php echo esc_html($sitemap['searchEngineLabel'] ?? 'Google'); ?></span>
                  <span><small>사이트맵 제출</small><?php echo esc_html($sitemap['lastSubmittedAt'] ?? '제출 전'); ?></span>
                  <span><small>사이트맵 확인</small><?php echo esc_html($sitemap['lastCheckedAt'] ?? '확인 전'); ?></span>
                  <span><small>애드센스 확인</small><?php echo esc_html($seo['lastCheckedAt'] ?? '확인 전'); ?></span>
                  <span><small>최근 정산월</small><?php echo esc_html($site['settlementMonth'] ?? '준비 중'); ?></span>
                </div>
                <?php if (!empty($sitemap['sitemapUrl'])) : ?>
                  <p class="wordfriends-auth-small"><a class="wordfriends-site-link" href="<?php echo esc_url($sitemap['sitemapUrl']); ?>" target="_blank" rel="noopener noreferrer">사이트맵 보기</a></p>
                <?php endif; ?>
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
              </details>
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
      <?php echo wordfriends_siteops_render_customer_nav('settlement'); ?>
      <div class="wordfriends-question-guide">
        <article>
          <strong>정산은 참고 상태로 안내됩니다</strong>
          <span>표시 금액과 지급 상태는 계약 조건, 운영 내역, 검토 결과를 기준으로 확인합니다.</span>
        </article>
        <article>
          <strong>추천 보상은 1단계 기준입니다</strong>
          <span>추천 계약이 승인되고 검토가 완료된 건만 보상 상태에 표시됩니다.</span>
        </article>
      </div>
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
        <div class="wordfriends-inline-actions">
          <a class="wordfriends-button wordfriends-button-secondary" href="<?php echo esc_url(wordfriends_siteops_timeline_page_url()); ?>">정산 알림 보기</a>
          <a class="wordfriends-button wordfriends-button-secondary" href="<?php echo esc_url(wordfriends_siteops_question_page_url()); ?>">정산 문의</a>
        </div>

        <h3>정산 참고</h3>
        <?php if (!$settlements) : ?>
          <div class="wordfriends-empty">
            <strong>표시할 정산 내역이 아직 없습니다.</strong>
            <p class="wordfriends-auth-small">정산 대상이 확정되면 이곳에 상태가 표시됩니다. 정산 금액과 지급 방식은 계약과 검토 결과를 기준으로 안내됩니다.</p>
            <p>
              <a class="wordfriends-button wordfriends-button-secondary" href="<?php echo esc_url(wordfriends_siteops_timeline_page_url()); ?>">알림센터</a>
              <a class="wordfriends-button wordfriends-button-secondary" href="<?php echo esc_url(wordfriends_siteops_question_page_url()); ?>">문의하기</a>
            </p>
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
            <p class="wordfriends-auth-small">추천 계약이 승인되고 검토가 완료되면 1단계 보상 상태가 표시됩니다.</p>
            <p><a class="wordfriends-button wordfriends-button-secondary" href="<?php echo esc_url(wordfriends_siteops_question_page_url()); ?>">추천 문의</a></p>
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

function wordfriends_siteops_timeline_category_label($category) {
    $labels = [
        'contract' => '계약',
        'question' => '문의',
        'site' => '사이트',
        'settlement' => '정산',
        'referral' => '추천',
        'notice' => '공지',
        'general' => '일반',
    ];

    return $labels[$category] ?? '안내';
}

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

    $all_timeline_count = count($timeline);
    $timeline_pagination = wordfriends_siteops_paginate_items($timeline, 'wft_page', 5);
    $timeline = $timeline_pagination['items'];

    ob_start();
    ?>
    <section class="wordfriends-auth">
      <h2><?php echo esc_html($atts['title']); ?></h2>
      <p><?php echo esc_html($atts['subtitle']); ?></p>
      <?php echo wordfriends_siteops_render_customer_nav('timeline'); ?>
      <div class="wordfriends-question-guide">
        <article>
          <strong>진행 안내가 모이는 곳입니다</strong>
          <span>계약, 문의 답변, 사이트 운영, 정산 관련 안내를 한곳에서 확인합니다.</span>
        </article>
        <article>
          <strong>중요한 확인은 각 메뉴로 이어집니다</strong>
          <span>알림을 확인한 뒤 내 사이트, 내 문의, 전자계약, 정산·추천 화면에서 상세 내용을 볼 수 있습니다.</span>
        </article>
      </div>
      <?php if ($error) : ?>
        <div class="wordfriends-auth-error"><?php echo esc_html($error); ?></div>
      <?php elseif (!$timeline) : ?>
        <div class="wordfriends-empty">
          <strong>아직 표시할 알림이 없습니다.</strong>
          <p class="wordfriends-auth-small"><?php echo $all_timeline_count ? '다른 페이지의 알림을 확인해 주세요.' : '계약, 문의, 사이트 운영, 정산 상태가 갱신되면 이곳에 표시됩니다.'; ?></p>
          <p>
            <a class="wordfriends-button wordfriends-button-secondary" href="<?php echo esc_url(wordfriends_siteops_my_sites_page_url()); ?>">내 사이트</a>
            <a class="wordfriends-button wordfriends-button-secondary" href="<?php echo esc_url(wordfriends_siteops_question_page_url()); ?>">문의하기</a>
          </p>
        </div>
      <?php else : ?>
        <div class="wordfriends-inline-actions">
          <a class="wordfriends-button wordfriends-button-secondary" href="<?php echo esc_url(wordfriends_siteops_my_sites_page_url()); ?>">내 사이트</a>
          <a class="wordfriends-button wordfriends-button-secondary" href="<?php echo esc_url(wordfriends_siteops_my_questions_page_url()); ?>">내 문의</a>
          <a class="wordfriends-button wordfriends-button-secondary" href="<?php echo esc_url(wordfriends_siteops_contract_guide_page_url()); ?>">전자계약</a>
          <a class="wordfriends-button wordfriends-button-secondary" href="<?php echo esc_url(wordfriends_siteops_settlement_referrals_page_url()); ?>">정산·추천</a>
        </div>
        <div class="wordfriends-question-list">
          <?php foreach ($timeline as $item) : ?>
            <article class="wordfriends-question-card">
              <header>
                <h3><?php echo esc_html($item['title'] ?? '알림'); ?></h3>
                <span class="wordfriends-question-status"><?php echo esc_html($item['statusLabel'] ?? '안내'); ?></span>
              </header>
              <p><?php echo nl2br(esc_html($item['message'] ?? '')); ?></p>
              <p class="wordfriends-auth-small">
                <?php echo esc_html(wordfriends_siteops_timeline_category_label($item['category'] ?? 'general')); ?> · <?php echo esc_html($item['occurredAt'] ?? ''); ?>
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

function wordfriends_siteops_home_page_url() {
    return wordfriends_siteops_portal_page_url('wordfriends_home', '/', ['home']);
}

function wordfriends_siteops_signup_page_url() {
    return wordfriends_siteops_portal_page_url('wordfriends_signup', '/register/', ['register', 'signup']);
}

function wordfriends_siteops_services_page_url() {
    return wordfriends_siteops_portal_page_url('wordfriends_services', '/서비스/', ['서비스', 'services']);
}

function wordfriends_siteops_start_guide_page_url() {
    return wordfriends_siteops_portal_page_url('wordfriends_start_guide', '/구축절차/', ['구축절차', 'getting-started', 'start-guide']);
}

function wordfriends_siteops_cases_page_url() {
    return wordfriends_siteops_portal_page_url('wordfriends_cases', '/사례/', ['사례', 'cases']);
}

function wordfriends_siteops_guide_page_url() {
    return wordfriends_siteops_portal_page_url('wordfriends_guide', '/가이드-faq/', ['가이드-faq', 'guide', 'faq']);
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
