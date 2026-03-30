const BASE = (import.meta as any).env?.VITE_API_BASE_URL ?? '/api';

const AUTH_TOKEN_KEY = 'auth_token';

/** Resolve stored audio URLs for `<audio src>` when API is on another origin (e.g. api.gilloai.com). */
export function resolveMediaUrl(pathOrUrl: string | undefined): string | undefined {
  if (!pathOrUrl) return undefined;
  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) return pathOrUrl;
  const base = (import.meta as any).env?.VITE_API_BASE_URL ?? '/api';
  if (pathOrUrl.startsWith('/api')) {
    if (base.startsWith('http')) {
      return `${base.replace(/\/$/, '')}${pathOrUrl.slice('/api'.length)}`;
    }
    return pathOrUrl;
  }
  if (base.startsWith('http')) {
    return `${base.replace(/\/$/, '')}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;
  }
  return pathOrUrl;
}

export function getToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

export async function request<T>(
  path: string,
  options: RequestInit & { token?: string | null } = {}
): Promise<T> {
  const { token = getToken(), ...init } = options;
  const url = path.startsWith('http') ? path : `${BASE}${path}`;
  const headers: HeadersInit = {
    ...(init.headers as Record<string, string>),
  };
  const isFormData =
    typeof FormData !== 'undefined' && init.body instanceof FormData;
  if (init.body !== undefined && init.body !== null && !isFormData) {
    (headers as Record<string, string>)['Content-Type'] = 'application/json';
  }
  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(url, { ...init, headers });

  if (res.status === 204) {
    return undefined as T;
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError(res.status, data?.error ?? res.statusText, data);
  }
  return data as T;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
