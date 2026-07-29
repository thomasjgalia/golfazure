import { HttpRequest, HttpResponseInit } from '@azure/functions'
import { verifySession, SessionPayload } from './token'

function bearerToken(req: HttpRequest): string | null {
  const header = req.headers.get('authorization') || ''
  return header.startsWith('Bearer ') ? header.slice(7) : null
}

export function getSession(req: HttpRequest): SessionPayload | null {
  return verifySession(bearerToken(req))
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
