const BASE = (import.meta as any).env?.VITE_API_BASE_URL ?? '/api';

const AUTH_TOKEN_KEY = 'auth_token';

export function getToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

function shouldClearToken(status: number, body: any): boolean {
  if (status !== 401) return false;
  const code = String(body?.code ?? '');
  const message = String(body?.message ?? '').toLowerCase();
  const error = String(body?.error ?? '').toLowerCase();
  return (
    code.startsWith('FST_JWT_') ||
    message.includes('token signature is invalid') ||
    message.includes('authorization token is invalid') ||
    error.includes('authorization token is invalid')
  );
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
    if (shouldClearToken(res.status, data)) {
      clearToken();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('auth:expired'));
      }
    }
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
