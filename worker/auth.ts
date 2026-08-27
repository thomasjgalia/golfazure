import { Hono } from 'hono';
import { signSession } from './token';
import { toPublicPlayer, type PlayerDbRow } from './db';

const auth = new Hono<{ Bindings: Env }>();

// POST /api/auth/claim - verify a player's profile secret and issue a session
// token. The secret is only ever checked server-side; it is never returned
// to the client. Also returns the player's zone memberships inline, so the
// frontend doesn't need a second round-trip immediately after claiming.
auth.post('/claim', async (c) => {
	const b = await c.req.json<any>();
	const playerid = Number(b.playerid);
	const secret = typeof b.secret === 'string' ? b.secret.trim() : '';
	if (!playerid || !secret) return c.json({ message: 'playerid and secret are required' }, 400);

	const player = await c.env.DB.prepare('SELECT * FROM players WHERE id = ?').bind(playerid).first<PlayerDbRow>();
	if (!player || !player.profile_secret || player.profile_secret.toLowerCase() !== secret.toLowerCase()) {
		return c.json({ message: 'Invalid player or secret' }, 401);
	}

	const token = await signSession(c.env.AUTH_SECRET, player.id);

	const { results: memberships } = await c.env.DB.prepare(
		`SELECT zm.zone_id, zm.role, z.name FROM zone_membership zm JOIN zones z ON z.id = zm.zone_id WHERE zm.player_id = ?`,
	)
		.bind(player.id)
		.all<{ zone_id: number; role: 'admin' | 'member'; name: string }>();
	const zones = memberships.map((m) => ({ zoneid: m.zone_id, name: m.name, role: m.role }));

	return c.json({ token, player: toPublicPlayer(player), zones });
});

export default auth;
