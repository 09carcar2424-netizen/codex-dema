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

export async function updateNotificationStatus(notificationId, payload, apiBaseUrl = getApiBaseUrl()) {
  const normalizedBaseUrl = apiBaseUrl.trim().replace(/\/+$/, '');
  const notificationUrl = normalizedBaseUrl
    ? `${normalizedBaseUrl}/api/notifications/${notificationId}`
    : `/api/notifications/${notificationId}`;
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
    throw new Error(error.detail || error.error || 'Notification update failed');
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
    const requestError = new Error(error.detail || error.error || 'Question reply request failed');
    requestError.payload = error;
    throw requestError;
  }

  return response.json();
}

export async function archiveWordfriendsQuestions(questionIds, apiBaseUrl = getApiBaseUrl()) {
  const normalizedBaseUrl = apiBaseUrl.trim().replace(/\/+$/, '');
  const archiveUrl = normalizedBaseUrl
    ? `${normalizedBaseUrl}/api/wordfriends/questions/archive`
    : '/api/wordfriends/questions/archive';
  const response = await fetch(archiveUrl, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ questionIds }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    const requestError = new Error(error.detail || error.error || 'Question archive request failed');
    requestError.payload = error;
    throw requestError;
  }

  return response.json();
}

export async function saveWordfriendsContractRequest(contractRequestId, payload, apiBaseUrl = getApiBaseUrl()) {
  const normalizedBaseUrl = apiBaseUrl.trim().replace(/\/+$/, '');
  const requestUrl = normalizedBaseUrl
    ? `${normalizedBaseUrl}/api/wordfriends/contracts/${contractRequestId}`
    : `/api/wordfriends/contracts/${contractRequestId}`;
  const response = await fetch(requestUrl, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    const requestError = new Error(error.detail || error.error || 'Contract request update failed');
    requestError.payload = error;
    throw requestError;
  }

  return response.json();
}

export async function updateSiteCustomer(siteKey, payload, apiBaseUrl = getApiBaseUrl()) {
  const normalizedBaseUrl = apiBaseUrl.trim().replace(/\/+$/, '');
  const requestUrl = normalizedBaseUrl
    ? `${normalizedBaseUrl}/api/sites/${encodeURIComponent(siteKey)}/customer`
    : `/api/sites/${encodeURIComponent(siteKey)}/customer`;
  const response = await fetch(requestUrl, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    const requestError = new Error(error.detail || error.error || 'Site customer update failed');
    requestError.payload = error;
    throw requestError;
  }

  return response.json();
}

export async function saveCustomerOps(customerCode, payload, apiBaseUrl = getApiBaseUrl()) {
  const normalizedBaseUrl = apiBaseUrl.trim().replace(/\/+$/, '');
  const requestUrl = normalizedBaseUrl
    ? `${normalizedBaseUrl}/api/customers/${encodeURIComponent(customerCode)}/ops`
    : `/api/customers/${encodeURIComponent(customerCode)}/ops`;
  const response = await fetch(requestUrl, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    const requestError = new Error(error.detail || error.error || 'Customer ops save failed');
    requestError.payload = error;
    throw requestError;
  }

  return response.json();
}

export async function saveSettlementRecord(payload, apiBaseUrl = getApiBaseUrl()) {
  const normalizedBaseUrl = apiBaseUrl.trim().replace(/\/+$/, '');
  const requestUrl = normalizedBaseUrl ? `${normalizedBaseUrl}/api/settlements` : '/api/settlements';
  const response = await fetch(requestUrl, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    const requestError = new Error(error.detail || error.error || 'Settlement save failed');
    requestError.payload = error;
    throw requestError;
  }

  return response.json();
}

export async function saveReferralReward(payload, apiBaseUrl = getApiBaseUrl()) {
  const normalizedBaseUrl = apiBaseUrl.trim().replace(/\/+$/, '');
  const requestUrl = normalizedBaseUrl ? `${normalizedBaseUrl}/api/referral-rewards` : '/api/referral-rewards';
  const response = await fetch(requestUrl, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    const requestError = new Error(error.detail || error.error || 'Referral reward save failed');
    requestError.payload = error;
    throw requestError;
  }

  return response.json();
}
