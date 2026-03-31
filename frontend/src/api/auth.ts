import { request, setToken, clearToken } from './client';

export interface User {
  id: string;
  email: string;
  display_name?: string | null;
  timezone?: string;
}

export async function register(email: string, password: string): Promise<{ token: string; user: User }> {
  const data = await request<{ token: string; user: User }>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
    token: null,
  });
  setToken(data.token);
  return data;
}

export async function login(email: string, password: string): Promise<{ token: string; user: User }> {
  const data = await request<{ token: string; user: User }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
    token: null,
  });
  setToken(data.token);
  return data;
}

export function logout(): void {
  clearToken();
}

export async function me(): Promise<{ user: User }> {
  return request<{ user: User }>('/auth/me');
}

export async function updateProfile(data: { display_name?: string | null; timezone?: string }): Promise<{ user: User }> {
  return request<{ user: User }>('/auth/me', {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}
