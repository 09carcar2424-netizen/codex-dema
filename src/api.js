const DEFAULT_API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? 'http://127.0.0.1:8787' : '');

const API_BASE_STORAGE_KEY = 'boss-siteops-api-base-url';

export function getApiBaseUrl() {
  if (typeof window === 'undefined') return DEFAULT_API_BASE_URL;
  return localStorage.getItem(API_BASE_STORAGE_KEY) || DEFAULT_API_BASE_URL;
}

export function saveApiBaseUrl(value) {
  const normalized = value.trim().replace(/\/+$/, '');
  if (normalized) {
    localStorage.setItem(API_BASE_STORAGE_KEY, normalized);
  } else {
    localStorage.removeItem(API_BASE_STORAGE_KEY);
  }
  return getApiBaseUrl();
}

export async function fetchDashboardData(apiBaseUrl = getApiBaseUrl()) {
  const normalizedBaseUrl = apiBaseUrl.trim().replace(/\/+$/, '');
  const dashboardUrl = normalizedBaseUrl ? `${normalizedBaseUrl}/api/dashboard` : '/api/dashboard';
  const response = await fetch(dashboardUrl, {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || error.error || 'API request failed');
  }

  return response.json();
}

export async function createNotificationDraft(payload, apiBaseUrl = getApiBaseUrl()) {
  const normalizedBaseUrl = apiBaseUrl.trim().replace(/\/+$/, '');
  const notificationUrl = normalizedBaseUrl ? `${normalizedBaseUrl}/api/notifications` : '/api/notifications';
  const response = await fetch(notificationUrl, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || error.error || 'Notification request failed');
  }

  return response.json();
}

export async function saveDomainCandidates(payload, apiBaseUrl = getApiBaseUrl()) {
  const normalizedBaseUrl = apiBaseUrl.trim().replace(/\/+$/, '');
  const candidateUrl = normalizedBaseUrl ? `${normalizedBaseUrl}/api/domain-candidates` : '/api/domain-candidates';
  const response = await fetch(candidateUrl, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || error.error || 'Domain candidate request failed');
  }

  return response.json();
}

export async function saveWordfriendsQuestionReply(questionId, payload, apiBaseUrl = getApiBaseUrl()) {
  const normalizedBaseUrl = apiBaseUrl.trim().replace(/\/+$/, '');
  const replyUrl = normalizedBaseUrl
    ? `${normalizedBaseUrl}/api/wordfriends/questions/${questionId}/reply`
    : `/api/wordfriends/questions/${questionId}/reply`;
  const response = await fetch(replyUrl, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || error.error || 'Question reply request failed');
  }

  return response.json();
}
