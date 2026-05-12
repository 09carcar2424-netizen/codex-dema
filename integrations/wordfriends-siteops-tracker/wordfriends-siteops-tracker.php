<?php
/**
 * Plugin Name: Wordfriends SiteOps Tracker
 * Description: Sends Wordfriends portal activity and support questions to BOSS SiteOps without exposing the event token in the browser.
 * Version: 0.1.0
 * Author: BOSS SiteOps
 */

if (!defined('ABSPATH')) {
    exit;
}

const WORDFRIENDS_SITEOPS_OPTION_ENDPOINT = 'wordfriends_siteops_endpoint';
const WORDFRIENDS_SITEOPS_OPTION_TOKEN = 'wordfriends_siteops_token';

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

    wp_register_script('wordfriends-siteops-tracker', false, [], '0.1.0', true);
    wp_enqueue_script('wordfriends-siteops-tracker');
    wp_localize_script('wordfriends-siteops-tracker', 'WordfriendsSiteOps', [
        'ajaxUrl' => admin_url('admin-ajax.php'),
        'nonce' => wp_create_nonce('wordfriends_siteops_event'),
        'sessionId' => sanitize_text_field(wp_unslash($_COOKIE['wordfriends_session_id'])),
        'customerCode' => wordfriends_siteops_customer_code(),
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

  document.addEventListener('submit', function (event) {
    var form = event.target;
    if (!form || !form.matches) return;

    if (form.matches('[data-siteops-event]')) {
      window.WordfriendsTrack.event(form.getAttribute('data-siteops-event') || 'page_view');
    }

    if (form.matches('[data-siteops-question-form]')) {
      var field = form.querySelector('[name="question"], textarea, input[type="text"]');
      var category = form.getAttribute('data-siteops-question-category') || 'general';
      if (field && field.value) {
        window.WordfriendsTrack.question(field.value, category);
      }
    }
  }, true);
})();
JS);
}
add_action('wp_enqueue_scripts', 'wordfriends_siteops_enqueue_tracker');

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
        'customerCode' => get_user_meta($user->ID, 'customer_code', true) ?: 'WP-' . $user->ID,
        'payload' => [
            'wpUserId' => $user->ID,
            'login' => $user_login,
        ],
    ]);
}
add_action('wp_login', 'wordfriends_siteops_track_login', 10, 2);
