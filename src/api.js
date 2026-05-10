const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? 'http://127.0.0.1:8787' : '');

export async function fetchDashboardData() {
  const response = await fetch(`${API_BASE_URL}/api/dashboard`, {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || error.error || 'API request failed');
  }

  return response.json();
}
