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
