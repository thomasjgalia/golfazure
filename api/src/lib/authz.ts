import { HttpRequest, HttpResponseInit } from '@azure/functions'
import { verifySession, SessionPayload } from './token'
import { getMembership, isAdminOfAnyZone } from './zoneMembershipTable'

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
const NOT_A_MEMBER: HttpResponseInit = { status: 403, jsonBody: { message: 'Not a member of this zone' } }

type AuthResult = { session: SessionPayload; error?: undefined } | { session?: undefined; error: HttpResponseInit }

export function requireAuth(req: HttpRequest): AuthResult {
  const session = getSession(req)
  if (!session) return { error: UNAUTHORIZED }
  return { session }
}

// Role is never cached in the token - it's always a fresh lookup against
// ZoneMembership, so a role change (promote/demote/remove) takes effect on
// the very next request instead of waiting for a token to expire/reissue.

export async function requireZoneMember(req: HttpRequest, zoneid: number): Promise<AuthResult> {
  const session = getSession(req)
  if (!session) return { error: UNAUTHORIZED }
  const membership = await getMembership(zoneid, session.playerid)
  if (!membership) return { error: NOT_A_MEMBER }
  return { session }
}

export async function requireZoneAdmin(req: HttpRequest, zoneid: number): Promise<AuthResult> {
  const session = getSession(req)
  if (!session) return { error: UNAUTHORIZED }
  const membership = await getMembership(zoneid, session.playerid)
  if (!membership || membership.role !== 'admin') return { error: FORBIDDEN }
  return { session }
}

// For endpoints that touch shared, non-zone-specific data (course lookups) -
// the bar is "admin of at least one zone", not any particular zone.
export async function requireAnyZoneAdmin(req: HttpRequest): Promise<AuthResult> {
  const session = getSession(req)
  if (!session) return { error: UNAUTHORIZED }
  if (!(await isAdminOfAnyZone(session.playerid))) return { error: FORBIDDEN }
  return { session }
}
