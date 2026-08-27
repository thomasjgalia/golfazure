import { Hono } from 'hono';
import { requireZoneMember, requireZoneAdmin } from './authz';
import { mapTeam, type EventDbRow, type TeamDbRow } from './db';

const teams = new Hono<{ Bindings: Env }>();

// GET /api/teams?eventId=N
teams.get('/', async (c) => {
	const eventId = Number(c.req.query('eventId'));
	if (!eventId) return c.json({ message: 'eventId required' }, 400);
	const event = await c.env.DB.prepare('SELECT * FROM events WHERE id = ?').bind(eventId).first<EventDbRow>();
	if (!event) return c.json({ message: 'Event not found' }, 404);
	const auth = await requireZoneMember(c, event.zone_id ?? -1);
	if (auth.error) return c.json(auth.error.body, auth.error.status);

	const { results } = await c.env.DB.prepare('SELECT * FROM teams WHERE event_id = ? ORDER BY teamname').bind(eventId).all<TeamDbRow>();
	return c.json(results.map(mapTeam));
});

// POST /api/teams
teams.post('/', async (c) => {
	const b = await c.req.json<any>();
	const eventid = Number(b.eventid);
	const event = await c.env.DB.prepare('SELECT * FROM events WHERE id = ?').bind(eventid).first<EventDbRow>();
	if (!event) return c.json({ message: 'Event not found' }, 404);
	const auth = await requireZoneAdmin(c, event.zone_id ?? -1);
	if (auth.error) return c.json(auth.error.body, auth.error.status);

	const players = typeof b.players === 'string' ? JSON.parse(b.players) : b.players ?? {};
	const team = await c.env.DB.prepare(
		'INSERT INTO teams (event_id, teamname, players, startinghole) VALUES (?, ?, ?, ?) RETURNING *',
	)
		.bind(eventid, b.teamname, JSON.stringify(players), b.startinghole ?? null)
		.first<TeamDbRow>();
	return c.json(mapTeam(team!));
});

// PUT /api/teams/:id
teams.put('/:id', async (c) => {
	const id = Number(c.req.param('id'));
	const existing = await c.env.DB.prepare('SELECT * FROM teams WHERE id = ?').bind(id).first<TeamDbRow>();
	if (!existing) return c.json({ message: 'Team not found' }, 404);
	const event = await c.env.DB.prepare('SELECT * FROM events WHERE id = ?').bind(existing.event_id).first<EventDbRow>();
	const auth = await requireZoneAdmin(c, event?.zone_id ?? -1);
	if (auth.error) return c.json(auth.error.body, auth.error.status);

	const b = await c.req.json<any>();
	const sets: string[] = [];
	const values: unknown[] = [];
	if ('teamname' in b) {
		sets.push('teamname = ?');
		values.push(b.teamname);
	}
	if ('players' in b) {
		sets.push('players = ?');
		values.push(JSON.stringify(typeof b.players === 'string' ? JSON.parse(b.players) : b.players));
	}
	if ('startinghole' in b) {
		sets.push('startinghole = ?');
		values.push(b.startinghole);
	}
	if (sets.length === 0) return c.json({ message: 'No fields to update' }, 400);
	sets.push("updated_at = datetime('now')");

	await c.env.DB.prepare(`UPDATE teams SET ${sets.join(', ')} WHERE id = ?`)
		.bind(...values, id)
		.run();
	const updated = await c.env.DB.prepare('SELECT * FROM teams WHERE id = ?').bind(id).first<TeamDbRow>();
	return c.json(mapTeam(updated!));
});

// DELETE /api/teams/:id
teams.delete('/:id', async (c) => {
	const id = Number(c.req.param('id'));
	const existing = await c.env.DB.prepare('SELECT * FROM teams WHERE id = ?').bind(id).first<TeamDbRow>();
	if (!existing) return c.json({ message: 'Team not found' }, 404);
	const event = await c.env.DB.prepare('SELECT * FROM events WHERE id = ?').bind(existing.event_id).first<EventDbRow>();
	const auth = await requireZoneAdmin(c, event?.zone_id ?? -1);
	if (auth.error) return c.json(auth.error.body, auth.error.status);

	await c.env.DB.prepare('DELETE FROM teams WHERE id = ?').bind(id).run();
	return c.json({ success: true });
});

export default teams;
