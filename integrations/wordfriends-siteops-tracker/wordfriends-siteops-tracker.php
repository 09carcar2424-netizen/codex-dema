<?php
/**
 * Plugin Name: Wordfriends SiteOps Tracker
 * Description: Sends Wordfriends portal activity and support questions to BOSS SiteOps without exposing the event token in the browser.
 * Version: 0.3.8
 * Author: BOSS SiteOps
 */

if (!defined('ABSPATH')) {
    exit;
}

const WORDFRIENDS_SITEOPS_OPTION_ENDPOINT = 'wordfriends_siteops_endpoint';
const WORDFRIENDS_SITEOPS_OPTION_TOKEN = 'wordfriends_siteops_token';
const WORDFRIENDS_SITEOPS_VERSION = '0.3.8';

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
        'loginUrl' => wordfriends_siteops_login_page_url(),
        'logoutUrl' => wordfriends_siteops_logout_page_url(),
        'inquiryUrl' => wordfriends_siteops_question_page_url(),
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
  if (!window.WordfriendsSiteOps || !WordfriendsSiteOps.inquiryUrl) return;

  function ensureInquiryLink() {
    var nav = document.querySelector('header nav, .wp-block-navigation, nav');
    if (!nav) return;

    var hasInquiry = Array.prototype.some.call(nav.querySelectorAll('a'), function (link) {
      return (link.textContent || '').replace(/\s+/g, '').trim() === '\ubb38\uc758';
    });
    if (hasInquiry) return;

    var lastLink = nav.querySelector('a:last-of-type');
    if (!lastLink || !lastLink.parentNode) return;

    var link = lastLink.cloneNode(false);
    link.href = WordfriendsSiteOps.inquiryUrl;
    link.textContent = '\ubb38\uc758';
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureInquiryLink);
  } else {
    ensureInquiryLink();
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

    return remove_query_arg(['wordfriends_signup', 'wordfriends_login']);
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

        if (mb_strlen($question) < 3) {
            $GLOBALS['wordfriends_question_error'] = '문의 내용을 입력해 주세요.';
            return;
        }

        if (!is_user_logged_in() && (!$name || !$email || !is_email($email))) {
            $GLOBALS['wordfriends_question_error'] = '답변을 받을 이름과 이메일을 입력해 주세요.';
            return;
        }

        $contact_note = '';

        if (!is_user_logged_in()) {
            $contact_lines = [
                "문의자: {$name}",
                "이메일: {$email}",
            ];

            if ($phone) {
                $contact_lines[] = "전화번호: {$phone}";
            }

            $contact_note = implode("\n", $contact_lines) . "\n\n";
        }

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
}
add_action('init', 'wordfriends_siteops_handle_auth_posts');

function wordfriends_siteops_signup_shortcode($atts = []) {
    $atts = shortcode_atts([
        'redirect' => '',
        'title' => 'Wordfriends 시작하기',
        'subtitle' => '고객 소유 사이트 운영대행 상담과 계약 진행을 위한 계정을 만듭니다.',
    ], $atts, 'wordfriends_signup');

    if (is_user_logged_in()) {
        return '<div class="wordfriends-auth"><h2>이미 로그인되어 있습니다.</h2><p>내 사이트 현황과 계약 진행 화면은 순차적으로 연결됩니다.</p></div>';
    }

    $message = $GLOBALS['wordfriends_signup_message'] ?? '';
    $error = $GLOBALS['wordfriends_signup_error'] ?? '';

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
            <span>서비스 이용약관과 개인정보처리방침에 동의합니다.</span>
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
        return '<div class="wordfriends-auth"><h2>로그인되어 있습니다.</h2><p>고객용 대시보드가 준비되는 대로 이 계정에 연결됩니다.</p></div>';
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

function wordfriends_siteops_customer_home_url() {
    return wordfriends_siteops_login_page_url();
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

function wordfriends_siteops_logout_page_url() {
    return wordfriends_siteops_portal_page_url('wordfriends_logout', '/logout/', ['logout', '로그아웃']);
}

function wordfriends_siteops_question_page_url() {
    return wordfriends_siteops_portal_page_url('wordfriends_question', '/contact/', ['contact', 'inquiry']);
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
