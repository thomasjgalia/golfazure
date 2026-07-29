import { getToken, clearSession, notifySessionCleared } from './session'

const BASE = '/api'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  // Azure Static Web Apps reserves the standard Authorization header for its own
  // proxy-to-Functions auth and overwrites anything the client sets there, so our
  // session token has to travel under a custom header name instead.
  if (token) headers['X-Session-Token'] = token

  const res = await fetch(`${BASE}${path}`, {
    headers,
    ...options,
  })

  if (res.status === 401 && token) {
    // Session token was rejected (expired/invalid) - drop it so the UI prompts a re-claim.
    clearSession()
    notifySessionCleared()
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }))
    throw new Error(err.message || res.statusText)
  }
  return res.json()
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}
