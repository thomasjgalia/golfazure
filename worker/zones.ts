import { Hono } from 'hono';
import { requireAuth, requireZoneMember, requireZoneAdmin } from './authz';
import { mapZone, toPublicPlayer, type PlayerDbRow, type ZoneDbRow } from './db';

const zones = new Hono<{ Bindings: Env }>();

// POST /api/zones - self-service, no approval: any signed-in player can
// create a zone and becomes its first admin.
zones.post('/', async (c) => {
	const auth = await requireAuth(c);
	if (auth.error) return c.json(auth.error.body, auth.error.status);

	const b = await c.req.json<any>();
	const name = typeof b.name === 'string' ? b.name.trim() : '';
	if (!name) return c.json({ message: 'name required' }, 400);

	const zone = await c.env.DB.prepare('INSERT INTO zones (name, created_by) VALUES (?, ?) RETURNING *')
		.bind(name, auth.session.playerid)
		.first<ZoneDbRow>();
	await c.env.DB.prepare("INSERT INTO zone_membership (zone_id, player_id, role) VALUES (?, ?, 'admin')")
		.bind(zone!.id, auth.session.playerid)
		.run();
	return c.json(mapZone(zone!));
});

// GET /api/zones/mine - every zone the caller belongs to, with their role in each.
zones.get('/mine', async (c) => {
	const auth = await requireAuth(c);
	if (auth.error) return c.json(auth.error.body, auth.error.status);

	const { results } = await c.env.DB.prepare(
		'SELECT zm.zone_id, zm.role, z.name FROM zone_membership zm JOIN zones z ON z.id = zm.zone_id WHERE zm.player_id = ?',
	)
		.bind(auth.session.playerid)
		.all<{ zone_id: number; role: 'admin' | 'member'; name: string }>();
	return c.json(results.map((m) => ({ zoneid: m.zone_id, name: m.name, role: m.role })));
});

// GET /api/zones/:id/members - roster with public player fields, any member can view.
zones.get('/:id/members', async (c) => {
	const zoneid = Number(c.req.param('id'));
	const auth = await requireZoneMember(c, zoneid);
	if (auth.error) return c.json(auth.error.body, auth.error.status);

	const { results } = await c.env.DB.prepare(
		`SELECT p.*, zm.role, zm.joined_at FROM zone_membership zm JOIN players p ON p.id = zm.player_id WHERE zm.zone_id = ? ORDER BY p.lastname, p.firstname`,
	)
		.bind(zoneid)
		.all<PlayerDbRow & { role: 'admin' | 'member'; joined_at: string }>();
	return c.json(results.map((r) => ({ ...toPublicPlayer(r), role: r.role, joined_at: r.joined_at })));
});

// POST /api/zones/:id/members - zone-admin-driven rostering. Body is either
// { playerid } to attach an existing player, or full new-player fields to
// create one from scratch and attach them in the same action.
zones.post('/:id/members', async (c) => {
	const zoneid = Number(c.req.param('id'));
	const auth = await requireZoneAdmin(c, zoneid);
	if (auth.error) return c.json(auth.error.body, auth.error.status);

	const zone = await c.env.DB.prepare('SELECT id FROM zones WHERE id = ?').bind(zoneid).first();
	if (!zone) return c.json({ message: 'Zone not found' }, 404);

	const b = await c.req.json<any>();
	let playerid: number;

	if (b.playerid) {
		playerid = Number(b.playerid);
		const existing = await c.env.DB.prepare('SELECT 1 FROM zone_membership WHERE zone_id = ? AND player_id = ?')
			.bind(zoneid, playerid)
			.first();
		if (existing) return c.json({ message: 'Player is already a member of this zone' }, 409);
	} else {
		if (!b.firstname || !b.lastname) return c.json({ message: 'firstname and lastname required' }, 400);
		const player = await c.env.DB.prepare(
			'INSERT INTO players (firstname, lastname, phone, email, handicap, profile_secret) VALUES (?, ?, ?, ?, ?, ?) RETURNING id',
		)
			.bind(b.firstname, b.lastname, b.phone ?? null, b.email ?? null, b.handicap ?? null, b.profile_secret ?? null)
			.first<{ id: number }>();
		playerid = player!.id;
	}

	const membership = await c.env.DB.prepare(
		"INSERT INTO zone_membership (zone_id, player_id, role) VALUES (?, ?, 'member') RETURNING *",
	)
		.bind(zoneid, playerid)
		.first<{ zone_id: number; player_id: number; role: string; joined_at: string }>();
	return c.json({ zoneid: membership!.zone_id, playerid: membership!.player_id, role: membership!.role, joined_at: membership!.joined_at });
});

// PUT /api/zones/:id/members/:playerid - change role. Guards against
// leaving a zone with zero admins.
zones.put('/:id/members/:playerid', async (c) => {
	const zoneid = Number(c.req.param('id'));
	const playerid = Number(c.req.param('playerid'));
	const auth = await requireZoneAdmin(c, zoneid);
	if (auth.error) return c.json(auth.error.body, auth.error.status);

	const b = await c.req.json<any>();
	const role = b.role === 'admin' ? 'admin' : b.role === 'member' ? 'member' : null;
	if (!role) return c.json({ message: "role must be 'admin' or 'member'" }, 400);

	const current = await c.env.DB.prepare('SELECT role FROM zone_membership WHERE zone_id = ? AND player_id = ?')
		.bind(zoneid, playerid)
		.first<{ role: 'admin' | 'member' }>();
	if (!current) return c.json({ message: 'Not a member of this zone' }, 404);

	if (current.role === 'admin' && role === 'member') {
		const { results: admins } = await c.env.DB.prepare("SELECT 1 FROM zone_membership WHERE zone_id = ? AND role = 'admin'")
			.bind(zoneid)
			.all();
		if (admins.length <= 1) return c.json({ message: 'A zone must have at least one admin' }, 409);
	}

	await c.env.DB.prepare('UPDATE zone_membership SET role = ? WHERE zone_id = ? AND player_id = ?').bind(role, zoneid, playerid).run();
	return c.json({ zoneid, playerid, role });
});

// DELETE /api/zones/:id/members/:playerid - removes membership only, never
// the underlying player record (see players.ts DELETE for the full-delete path).
zones.delete('/:id/members/:playerid', async (c) => {
	const zoneid = Number(c.req.param('id'));
	const playerid = Number(c.req.param('playerid'));
	const auth = await requireZoneAdmin(c, zoneid);
	if (auth.error) return c.json(auth.error.body, auth.error.status);

	const current = await c.env.DB.prepare('SELECT role FROM zone_membership WHERE zone_id = ? AND player_id = ?')
		.bind(zoneid, playerid)
		.first<{ role: 'admin' | 'member' }>();
	if (!current) return c.json({ message: 'Not a member of this zone' }, 404);

	if (current.role === 'admin') {
		const { results: admins } = await c.env.DB.prepare("SELECT 1 FROM zone_membership WHERE zone_id = ? AND role = 'admin'")
			.bind(zoneid)
			.all();
		if (admins.length <= 1) return c.json({ message: 'A zone must have at least one admin' }, 409);
	}

	await c.env.DB.prepare('DELETE FROM zone_membership WHERE zone_id = ? AND player_id = ?').bind(zoneid, playerid).run();
	return c.json({ success: true });
});

export default zones;
