import { HttpRequest, HttpResponseInit } from '@azure/functions'
import { verifySession, SessionPayload } from './token'

// Azure Static Web Apps reserves the standard Authorization header for its own
// proxy-to-Functions auth (it overwrites client-set values), so the session token
// travels under this custom header instead - see src/lib/api.ts.
function sessionToken(req: HttpRequest): string | null {
  return req.headers.get('x-session-token') || null
}

export function getSession(req: HttpRequest): SessionPayload | null {
  return verifySession(sessionToken(req))
}

const UNAUTHORIZED: HttpResponseInit = { status: 401, jsonBody: { message: 'Sign in required' } }
const FORBIDDEN: HttpResponseInit = { status: 403, jsonBody: { message: 'Admin access required' } }

export function requireAuth(req: HttpRequest): { session: SessionPayload; error?: undefined } | { session?: undefined; error: HttpResponseInit } {
  const session = getSession(req)
  if (!session) return { error: UNAUTHORIZED }
  return { session }
}

export function requireAdmin(req: HttpRequest): { session: SessionPayload; error?: undefined } | { session?: undefined; error: HttpResponseInit } {
  const session = getSession(req)
  if (!session) return { error: UNAUTHORIZED }
  if (!session.isAdmin) return { error: FORBIDDEN }
  return { session }
}
