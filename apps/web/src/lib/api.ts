const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

interface FetchOptions extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>;
}

export interface RefreshResult {
  accessToken: string;
  user: { id: string; name: string; role: string };
}

let isRefreshing = false;
let refreshPromise: Promise<RefreshResult | null> | null = null;

async function rawFetch<T>(url: string, headers: Record<string, string>, rest: RequestInit): Promise<T> {
  const response = await fetch(url, { ...rest, headers, credentials: 'include' });

  if (response.status === 204 || response.headers.get('content-length') === '0') {
    return undefined as T;
  }

  const data = await response.json();

  if (!data.ok) {
    throw new ApiError(data.error.code, data.error.message, data.error.details, response.status);
  }

  return data.data;
}

export async function apiFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const { params, headers: extraHeaders, ...rest } = options;

  // Build URL with query params
  let url = `${API_BASE}${path}`;
  if (params) {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) searchParams.set(key, String(value));
    }
    const qs = searchParams.toString();
    if (qs) url += `?${qs}`;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(extraHeaders as Record<string, string>),
  };

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  try {
    return await rawFetch<T>(url, headers, rest);
  } catch (err) {
    // On 401, attempt one silent refresh then retry
    if (err instanceof ApiError && err.status === 401 && accessToken && !path.includes('/auth/')) {
      if (!isRefreshing) {
        isRefreshing = true;
        refreshPromise = refreshToken().finally(() => {
          isRefreshing = false;
          refreshPromise = null;
        });
      }
      const result = await refreshPromise;
      if (result) {
        headers['Authorization'] = `Bearer ${result.accessToken}`;
        return rawFetch<T>(url, headers, rest);
      }
    }
    throw err;
  }
}

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: Record<string, unknown>,
    public status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// ─── Auth-specific helpers ───────────────────────────────────────

export async function login(email: string, password: string) {
  const data = await apiFetch<{ accessToken: string; user: { id: string; name: string; role: string } }>(
    '/auth/login',
    { method: 'POST', body: JSON.stringify({ email, password }) },
  );
  setAccessToken(data.accessToken);
  return data;
}

export async function refreshToken(): Promise<RefreshResult | null> {
  try {
    const data = await apiFetch<RefreshResult>('/auth/refresh', { method: 'POST' });
    setAccessToken(data.accessToken);
    return data;
  } catch {
    setAccessToken(null);
    return null;
  }
}

export async function logout() {
  try {
    await apiFetch('/auth/logout', { method: 'POST' });
  } finally {
    setAccessToken(null);
  }
}

// ─── Background silent refresh (every 13 min) ──────────────

const REFRESH_INTERVAL_MS = 13 * 60 * 1000;
let refreshIntervalId: ReturnType<typeof setInterval> | null = null;

export function startSilentRefresh() {
  stopSilentRefresh();
  refreshIntervalId = setInterval(() => {
    if (accessToken) refreshToken();
  }, REFRESH_INTERVAL_MS);
}

export function stopSilentRefresh() {
  if (refreshIntervalId) {
    clearInterval(refreshIntervalId);
    refreshIntervalId = null;
  }
}
