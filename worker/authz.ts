import type { Context } from 'hono';
import { verifySession, SessionPayload } from './token';

// Kept as a custom header (not Authorization) even though the Azure Static
// Web Apps constraint that originally required this no longer applies on
// Workers -- changing it would mean touching src/lib/api.ts for zero benefit
// on what was meant to be a backend-only port.
function sessionToken(c: Context<{ Bindings: Env }>): string | null {
	return c.req.header('x-session-token') || null;
}

export async function getSession(c: Context<{ Bindings: Env }>): Promise<SessionPayload | null> {
	return verifySession(c.env.AUTH_SECRET, sessionToken(c));
}

const UNAUTHORIZED = { message: 'Sign in required' } as const;
const FORBIDDEN = { message: 'Admin access required' } as const;
const NOT_A_MEMBER = { message: 'Not a member of this zone' } as const;

type AuthResult = { session: SessionPayload; error?: undefined } | { session?: undefined; error: { body: unknown; status: 401 | 403 } };

export async function requireAuth(c: Context<{ Bindings: Env }>): Promise<AuthResult> {
	const session = await getSession(c);
	if (!session) return { error: { body: UNAUTHORIZED, status: 401 } };
	return { session };
}

async function getMembershipRole(env: Env, zoneid: number, playerid: number): Promise<'admin' | 'member' | null> {
	const row = await env.DB.prepare('SELECT role FROM zone_membership WHERE zone_id = ? AND player_id = ?')
		.bind(zoneid, playerid)
		.first<{ role: 'admin' | 'member' }>();
	return row?.role ?? null;
}

// Role is never cached in the token - it's always a fresh lookup against
// zone_membership, so a role change (promote/demote/remove) takes effect on
// the very next request instead of waiting for a token to expire/reissue.

export async function requireZoneMember(c: Context<{ Bindings: Env }>, zoneid: number): Promise<AuthResult> {
	const session = await getSession(c);
	if (!session) return { error: { body: UNAUTHORIZED, status: 401 } };
	const role = await getMembershipRole(c.env, zoneid, session.playerid);
	if (!role) return { error: { body: NOT_A_MEMBER, status: 403 } };
	return { session };
}

export async function requireZoneAdmin(c: Context<{ Bindings: Env }>, zoneid: number): Promise<AuthResult> {
	const session = await getSession(c);
	if (!session) return { error: { body: UNAUTHORIZED, status: 401 } };
	const role = await getMembershipRole(c.env, zoneid, session.playerid);
	if (role !== 'admin') return { error: { body: FORBIDDEN, status: 403 } };
	return { session };
}

// For endpoints that touch shared, non-zone-specific data (course lookups) -
// the bar is "admin of at least one zone", not any particular zone.
export async function requireAnyZoneAdmin(c: Context<{ Bindings: Env }>): Promise<AuthResult> {
	const session = await getSession(c);
	if (!session) return { error: { body: UNAUTHORIZED, status: 401 } };
	const row = await c.env.DB.prepare("SELECT 1 FROM zone_membership WHERE player_id = ? AND role = 'admin' LIMIT 1")
		.bind(session.playerid)
		.first();
	if (!row) return { error: { body: FORBIDDEN, status: 403 } };
	return { session };
}
