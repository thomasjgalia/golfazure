import { Hono } from 'hono';
import { requireZoneMember, requireZoneAdmin } from './authz';
import { mapEvent, type EventDbRow } from './db';

const events = new Hono<{ Bindings: Env }>();

// Fields an event row may be created/updated with. zoneid is deliberately
// excluded from patches - an event's zone is fixed at creation.
const WRITABLE_FIELDS = ['eventname', 'eventdate', 'coursename', 'tees', 'format', 'numberofholes', 'parperhole', 'islocked', 'status'] as const;
const COLUMN_FOR: Record<(typeof WRITABLE_FIELDS)[number], string> = {
	eventname: 'eventname',
	eventdate: 'eventdate',
	coursename: 'coursename',
	tees: 'tees',
	format: 'format',
	numberofholes: 'numberofholes',
	parperhole: 'parperhole',
	islocked: 'islocked',
	status: 'status',
};

// GET /api/events?zoneId=N
events.get('/', async (c) => {
	const zoneId = Number(c.req.query('zoneId'));
	if (!zoneId) return c.json({ message: 'zoneId required' }, 400);
	const auth = await requireZoneMember(c, zoneId);
	if (auth.error) return c.json(auth.error.body, auth.error.status);

	const { results } = await c.env.DB.prepare('SELECT * FROM events WHERE zone_id = ? ORDER BY eventdate DESC').bind(zoneId).all<EventDbRow>();
	return c.json(results.map(mapEvent));
});

// GET /api/events/:id
events.get('/:id', async (c) => {
	const id = Number(c.req.param('id'));
	const event = await c.env.DB.prepare('SELECT * FROM events WHERE id = ?').bind(id).first<EventDbRow>();
	if (!event) return c.json({ message: 'Event not found' }, 404);
	const auth = await requireZoneMember(c, event.zone_id ?? -1);
	if (auth.error) return c.json(auth.error.body, auth.error.status);
	return c.json(mapEvent(event));
});

// POST /api/events
events.post('/', async (c) => {
	const b = await c.req.json<any>();
	const zoneid = Number(b.zoneid);
	if (!zoneid) return c.json({ message: 'zoneid required' }, 400);
	const auth = await requireZoneAdmin(c, zoneid);
	if (auth.error) return c.json(auth.error.body, auth.error.status);

	const parperhole = Array.isArray(b.parperhole) ? b.parperhole : JSON.parse(b.parperhole ?? '[]');
	const event = await c.env.DB.prepare(
		`INSERT INTO events (zone_id, eventname, eventdate, coursename, tees, format, numberofholes, parperhole, islocked, status)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
	)
		.bind(
			zoneid,
			b.eventname,
			b.eventdate,
			b.coursename,
			b.tees ?? null,
			b.format ?? null,
			b.numberofholes,
			JSON.stringify(parperhole),
			b.islocked ? 1 : 0,
			b.status ?? 'Upcoming',
		)
		.first<EventDbRow>();
	return c.json(mapEvent(event!));
});

// PUT /api/events/:id
events.put('/:id', async (c) => {
	const id = Number(c.req.param('id'));
	const existing = await c.env.DB.prepare('SELECT * FROM events WHERE id = ?').bind(id).first<EventDbRow>();
	if (!existing) return c.json({ message: 'Event not found' }, 404);
	const auth = await requireZoneAdmin(c, existing.zone_id ?? -1);
	if (auth.error) return c.json(auth.error.body, auth.error.status);

	const b = await c.req.json<any>();
	const sets: string[] = [];
	const values: unknown[] = [];
	for (const key of WRITABLE_FIELDS) {
		if (!(key in b)) continue;
		let value = b[key];
		if (key === 'parperhole') value = JSON.stringify(typeof value === 'string' ? JSON.parse(value) : value);
		if (key === 'islocked') value = value ? 1 : 0;
		sets.push(`${COLUMN_FOR[key]} = ?`);
		values.push(value);
	}
	if (sets.length === 0) return c.json({ message: 'No fields to update' }, 400);
	sets.push("updated_at = datetime('now')");

	await c.env.DB.prepare(`UPDATE events SET ${sets.join(', ')} WHERE id = ?`)
		.bind(...values, id)
		.run();
	const updated = await c.env.DB.prepare('SELECT * FROM events WHERE id = ?').bind(id).first<EventDbRow>();
	return c.json(mapEvent(updated!));
});

// DELETE /api/events/:id
events.delete('/:id', async (c) => {
	const id = Number(c.req.param('id'));
	const existing = await c.env.DB.prepare('SELECT * FROM events WHERE id = ?').bind(id).first<EventDbRow>();
	if (!existing) return c.json({ message: 'Event not found' }, 404);
	const auth = await requireZoneAdmin(c, existing.zone_id ?? -1);
	if (auth.error) return c.json(auth.error.body, auth.error.status);

	// Teams and scores get cleaned up in the same transaction so nothing is
	// left behind as orphaned, unreachable data.
	await c.env.DB.batch([
		c.env.DB.prepare('DELETE FROM scores WHERE event_id = ?').bind(id),
		c.env.DB.prepare('DELETE FROM teams WHERE event_id = ?').bind(id),
		c.env.DB.prepare('DELETE FROM events WHERE id = ?').bind(id),
	]);
	return c.json({ success: true });
});

export default events;
