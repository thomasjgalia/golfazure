import { Hono } from 'hono';
import { requireAuth, requireZoneMember } from './authz';
import { SessionPayload } from './token';
import { mapScore, scoreKey, type EventDbRow, type ScoreDbRow, type TeamDbRow } from './db';

const scores = new Hono<{ Bindings: Env }>();

const FORBIDDEN = { message: 'You can only edit scores for your own team' };

// A claimed player may only write scores for a team they belong to (or their
// own player-level scores); an admin of the event's zone may write anything.
async function canEditTeam(env: Env, eventid: number, teamid: number, session: SessionPayload): Promise<boolean> {
	const event = await env.DB.prepare('SELECT zone_id FROM events WHERE id = ?').bind(eventid).first<{ zone_id: number | null }>();
	if (event?.zone_id != null) {
		const membership = await env.DB.prepare('SELECT role FROM zone_membership WHERE zone_id = ? AND player_id = ?')
			.bind(event.zone_id, session.playerid)
			.first<{ role: string }>();
		if (membership?.role === 'admin') return true;
	}
	const team = await env.DB.prepare('SELECT * FROM teams WHERE id = ?').bind(teamid).first<TeamDbRow>();
	if (!team || team.event_id !== eventid) return false;
	let players: Record<string, number> = {};
	try {
		players = JSON.parse(team.players ?? '{}');
	} catch {
		players = {};
	}
	return Object.values(players).includes(session.playerid);
}

async function canEditPlayer(env: Env, eventid: number, playerid: number, session: SessionPayload): Promise<boolean> {
	if (session.playerid === playerid) return true;
	const event = await env.DB.prepare('SELECT zone_id FROM events WHERE id = ?').bind(eventid).first<{ zone_id: number | null }>();
	if (event?.zone_id == null) return false;
	const membership = await env.DB.prepare('SELECT role FROM zone_membership WHERE zone_id = ? AND player_id = ?')
		.bind(event.zone_id, session.playerid)
		.first<{ role: string }>();
	return membership?.role === 'admin';
}

// GET /api/scores?eventId=N&teamId=N
scores.get('/', async (c) => {
	const eventId = Number(c.req.query('eventId'));
	if (!eventId) return c.json({ message: 'eventId required' }, 400);
	const event = await c.env.DB.prepare('SELECT * FROM events WHERE id = ?').bind(eventId).first<EventDbRow>();
	if (!event) return c.json({ message: 'Event not found' }, 404);

	const auth = await requireZoneMember(c, event.zone_id ?? -1);
	if (auth.error) return c.json(auth.error.body, auth.error.status);

	const teamIdParam = c.req.query('teamId');
	let query = 'SELECT * FROM scores WHERE event_id = ?';
	const params: unknown[] = [eventId];
	if (teamIdParam) {
		query += ' AND team_id = ?';
		params.push(Number(teamIdParam));
	}
	query += ' ORDER BY holenumber';
	const { results } = await c.env.DB.prepare(query)
		.bind(...params)
		.all<ScoreDbRow>();
	return c.json(results.map(mapScore));
});

// POST /api/scores/upsert
scores.post('/upsert', async (c) => {
	const auth = await requireAuth(c);
	if (auth.error) return c.json(auth.error.body, auth.error.status);

	const b = await c.req.json<any>();
	const useTeam = b.playerid == null;
	const eventid = Number(b.eventid);
	const teamid = b.teamid != null ? Number(b.teamid) : null;
	const playerid = b.playerid != null ? Number(b.playerid) : null;
	const holenumber = Number(b.holenumber);
	const strokes = b.strokes ?? null;

	const allowed = useTeam ? await canEditTeam(c.env, eventid, teamid!, auth.session) : await canEditPlayer(c.env, eventid, playerid!, auth.session);
	if (!allowed) return c.json(FORBIDDEN, 403);

	const key = scoreKey(teamid, playerid, holenumber);
	const score = await c.env.DB.prepare(
		`INSERT INTO scores (event_id, team_id, player_id, holenumber, strokes, score_key)
		 VALUES (?, ?, ?, ?, ?, ?)
		 ON CONFLICT(score_key) DO UPDATE SET strokes = excluded.strokes, updated_at = datetime('now')
		 RETURNING *`,
	)
		.bind(eventid, teamid, playerid, holenumber, strokes, key)
		.first<ScoreDbRow>();
	return c.json(mapScore(score!));
});

// POST /api/scores/delete
scores.post('/delete', async (c) => {
	const auth = await requireAuth(c);
	if (auth.error) return c.json(auth.error.body, auth.error.status);

	const b = await c.req.json<any>();
	const isTeamMode = b.mode === 'team';
	const eventid = Number(b.eventid);
	const playerOrTeamId = Number(b.playerOrTeamId);
	const holenumber = Number(b.holenumber);

	const allowed = isTeamMode
		? await canEditTeam(c.env, eventid, playerOrTeamId, auth.session)
		: await canEditPlayer(c.env, eventid, playerOrTeamId, auth.session);
	if (!allowed) return c.json(FORBIDDEN, 403);

	const key = isTeamMode ? scoreKey(playerOrTeamId, null, holenumber) : scoreKey(null, playerOrTeamId, holenumber);
	await c.env.DB.prepare('DELETE FROM scores WHERE event_id = ? AND score_key = ?').bind(eventid, key).run();
	return c.json({ success: true });
});

export default scores;
