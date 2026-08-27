import { Hono } from 'hono';
import { requireAuth, requireAnyZoneAdmin } from './authz';
import { mapEvent, toPublicPlayer, type EventDbRow, type PlayerDbRow, type ScoreDbRow, type TeamDbRow } from './db';

const players = new Hono<{ Bindings: Env }>();

// Standard Stableford points table - higher is better. Kept in sync with the
// frontend's copy in src/utils/format.ts (separate build targets, no shared lib).
function stablefordPoints(strokes: number, par: number): number {
	const diff = strokes - par;
	if (diff <= -3) return 5;
	if (diff === -2) return 4;
	if (diff === -1) return 3;
	if (diff === 0) return 2;
	if (diff === 1) return 1;
	return 0;
}

// Replaces the delete-protection that used to come implicitly from having
// teams/scores in the same SQL database - explicit here since a player being
// "referenced" spans two tables with no FK from either to `players` on the
// team side (players live inside a JSON blob column, not a foreign key).
async function isPlayerReferenced(env: Env, id: number): Promise<boolean> {
	const scoreRef = await env.DB.prepare('SELECT 1 FROM scores WHERE player_id = ? LIMIT 1').bind(id).first();
	if (scoreRef) return true;
	const { results: teams } = await env.DB.prepare('SELECT players FROM teams').all<{ players: string }>();
	return teams.some((t) => {
		try {
			return Object.values(JSON.parse(t.players ?? '{}')).includes(id);
		} catch {
			return false;
		}
	});
}

// Does the caller admin at least one zone the target player also belongs
// to? Players are global/shared, so editing someone's shared identity
// fields only requires a zone in common, not being an admin of every zone
// the target happens to be in.
async function sharesAdminZoneWith(env: Env, callerPlayerId: number, targetPlayerId: number): Promise<boolean> {
	const row = await env.DB.prepare(
		`SELECT 1 FROM zone_membership caller
		 JOIN zone_membership target ON target.zone_id = caller.zone_id
		 WHERE caller.player_id = ? AND caller.role = 'admin' AND target.player_id = ?
		 LIMIT 1`,
	)
		.bind(callerPlayerId, targetPlayerId)
		.first();
	return !!row;
}

// GET /api/players - the full global directory. Deliberately not
// zone-filtered: adding a player to a zone requires seeing the whole
// directory first (search-existing-before-create), not just one zone's
// current roster.
players.get('/', async (c) => {
	const auth = await requireAuth(c);
	if (auth.error) return c.json(auth.error.body, auth.error.status);
	const { results } = await c.env.DB.prepare('SELECT * FROM players ORDER BY lastname, firstname').all<PlayerDbRow>();
	return c.json(results.map(toPublicPlayer));
});

// GET /api/players/claimable - anonymous, minimal fields only. Powers the
// claim-profile picker, which by definition runs before a session exists.
players.get('/claimable', async (c) => {
	const { results } = await c.env.DB.prepare('SELECT id, firstname, lastname FROM players ORDER BY lastname, firstname').all<{
		id: number;
		firstname: string;
		lastname: string;
	}>();
	return c.json(results.map((p) => ({ playerid: p.id, firstname: p.firstname, lastname: p.lastname })));
});

// GET /api/players/:id
players.get('/:id', async (c) => {
	const player = await c.env.DB.prepare('SELECT * FROM players WHERE id = ?').bind(Number(c.req.param('id'))).first<PlayerDbRow>();
	if (!player) return c.json({ message: 'Player not found' }, 404);
	return c.json(toPublicPlayer(player));
});

// GET /api/players/:id/history - cross-event results, aggregated server-side.
// Deliberately cross-zone: shows every zone the player belongs to, regardless
// of who's viewing.
players.get('/:id/history', async (c) => {
	const playerid = Number(c.req.param('id'));
	const player = await c.env.DB.prepare('SELECT * FROM players WHERE id = ?').bind(playerid).first<PlayerDbRow>();
	if (!player) return c.json({ message: 'Player not found' }, 404);

	const [{ results: eventRows }, { results: teamRows }, { results: scoreRows }] = await Promise.all([
		c.env.DB.prepare('SELECT * FROM events').all<EventDbRow>(),
		c.env.DB.prepare('SELECT * FROM teams').all<TeamDbRow>(),
		c.env.DB.prepare('SELECT * FROM scores').all<ScoreDbRow>(),
	]);
	const events = eventRows.map(mapEvent);
	const teams = teamRows.map((t) => {
		let teamPlayers: Record<string, number> = {};
		try {
			teamPlayers = JSON.parse(t.players ?? '{}');
		} catch {
			teamPlayers = {};
		}
		return { teamid: t.id, eventid: t.event_id, teamname: t.teamname, players: teamPlayers };
	});

	const historyEvents = [];
	for (const ev of events) {
		const isIndividual = ev.format === 'Stroke Play' || ev.format === 'Stableford';
		const team = teams.find((t) => t.eventid === ev.eventid && Object.values(t.players).includes(playerid));

		const byHole: Record<number, number> = {};
		if (isIndividual) {
			for (const s of scoreRows) {
				if (s.event_id === ev.eventid && s.player_id === playerid && s.strokes != null) byHole[s.holenumber] = s.strokes;
			}
		} else if (team) {
			for (const s of scoreRows) {
				if (s.event_id === ev.eventid && s.team_id === team.teamid && s.player_id == null && s.strokes != null) byHole[s.holenumber] = s.strokes;
			}
		}

		const holesCompleted = Object.keys(byHole).length;
		if (!team && holesCompleted === 0) continue; // player had no involvement in this event

		let totalStrokes: number | null = null;
		let totalPar: number | null = null;
		let scoreToPar: number | null = null;
		let totalPoints: number | null = null;
		if (holesCompleted > 0) {
			totalStrokes = 0;
			totalPar = 0;
			totalPoints = 0;
			for (const [holeStr, strokes] of Object.entries(byHole)) {
				const hole = Number(holeStr);
				const par = ev.parperhole[hole - 1] ?? 4;
				totalStrokes += strokes;
				totalPar += par;
				totalPoints += stablefordPoints(strokes, par);
			}
			scoreToPar = totalStrokes - totalPar;
		}

		const teammateIds = team ? (Object.values(team.players).filter((id) => id != null && id !== playerid) as number[]) : [];

		historyEvents.push({
			eventid: ev.eventid,
			eventname: ev.eventname,
			eventdate: ev.eventdate,
			coursename: ev.coursename,
			format: ev.format,
			numberofholes: ev.numberofholes,
			status: ev.status,
			teamid: team?.teamid ?? null,
			teamname: team?.teamname ?? null,
			teammateIds,
			holesCompleted,
			totalStrokes,
			totalPar,
			scoreToPar,
			totalPoints: ev.format === 'Stableford' ? totalPoints : null,
		});
	}

	historyEvents.sort((a, b) => (a.eventdate < b.eventdate ? 1 : a.eventdate > b.eventdate ? -1 : 0));

	const strokePlayRounds = historyEvents.filter((e) => e.format === 'Stroke Play' && e.scoreToPar != null);
	const strokePlayAverageToPar = strokePlayRounds.length
		? Math.round((strokePlayRounds.reduce((a, e) => a + (e.scoreToPar ?? 0), 0) / strokePlayRounds.length) * 10) / 10
		: null;

	const stablefordRounds = historyEvents.filter((e) => e.format === 'Stableford' && e.totalPoints != null);
	const stablefordAveragePoints = stablefordRounds.length
		? Math.round((stablefordRounds.reduce((a, e) => a + (e.totalPoints ?? 0), 0) / stablefordRounds.length) * 10) / 10
		: null;

	return c.json({
		playerid,
		firstname: player.firstname,
		lastname: player.lastname,
		strokePlayAverageToPar,
		stablefordAveragePoints,
		events: historyEvents,
	});
});

// POST /api/players/byIds
players.post('/byIds', async (c) => {
	const body = await c.req.json<any>();
	const ids: number[] = body.ids;
	if (!ids?.length) return c.json([]);
	const placeholders = ids.map(() => '?').join(',');
	const { results } = await c.env.DB.prepare(`SELECT * FROM players WHERE id IN (${placeholders})`)
		.bind(...ids)
		.all<PlayerDbRow>();
	return c.json(results.map((p) => ({ playerid: p.id, firstname: p.firstname, lastname: p.lastname, handicap: p.handicap })));
});

// POST /api/players - creates a player and immediately attaches them to the
// creating admin's zone as a member. This is the "create from scratch" half
// of the zone roster's search-existing-or-create flow.
players.post('/', async (c) => {
	const auth = await requireAnyZoneAdmin(c);
	if (auth.error) return c.json(auth.error.body, auth.error.status);

	const b = await c.req.json<any>();
	const zoneid = Number(b.zoneid);
	if (!zoneid) return c.json({ message: 'zoneid required' }, 400);

	const player = await c.env.DB.prepare(
		'INSERT INTO players (firstname, lastname, phone, email, handicap, profile_secret) VALUES (?, ?, ?, ?, ?, ?) RETURNING *',
	)
		.bind(b.firstname, b.lastname, b.phone ?? null, b.email ?? null, b.handicap ?? null, b.profile_secret ?? null)
		.first<PlayerDbRow>();
	await c.env.DB.prepare("INSERT INTO zone_membership (zone_id, player_id, role) VALUES (?, ?, 'member')").bind(zoneid, player!.id).run();
	return c.json(toPublicPlayer(player!));
});

// PUT /api/players/:id - editing a player's shared identity fields requires
// the caller to admin some zone the target also belongs to (not necessarily
// every zone they're in).
players.put('/:id', async (c) => {
	const auth = await requireAuth(c);
	if (auth.error) return c.json(auth.error.body, auth.error.status);

	const id = Number(c.req.param('id'));
	const isSelf = auth.session.playerid === id;
	if (!isSelf && !(await sharesAdminZoneWith(c.env, auth.session.playerid, id))) {
		return c.json({ message: 'Admin access required in a zone this player belongs to' }, 403);
	}

	const b = await c.req.json<any>();
	const columnFor: Record<string, string> = {
		firstname: 'firstname',
		lastname: 'lastname',
		phone: 'phone',
		email: 'email',
		handicap: 'handicap',
		profile_secret: 'profile_secret',
	};
	const sets: string[] = [];
	const values: unknown[] = [];
	for (const key of Object.keys(columnFor)) {
		if (!(key in b)) continue;
		sets.push(`${columnFor[key]} = ?`);
		values.push(b[key]);
	}
	if (sets.length === 0) return c.json({ message: 'No fields to update' }, 400);
	sets.push("updated_at = datetime('now')");

	await c.env.DB.prepare(`UPDATE players SET ${sets.join(', ')} WHERE id = ?`)
		.bind(...values, id)
		.run();
	const updated = await c.env.DB.prepare('SELECT * FROM players WHERE id = ?').bind(id).first<PlayerDbRow>();
	if (!updated) return c.json({ message: 'Player not found' }, 404);
	return c.json(toPublicPlayer(updated));
});

// DELETE /api/players/:id?zoneid=N - removes the player from that specific
// zone (deletes the membership row). Only if that was their last remaining
// zone membership anywhere does this fall through to actually deleting the
// global player record (still gated by the existing reference check).
players.delete('/:id', async (c) => {
	const auth = await requireAuth(c);
	if (auth.error) return c.json(auth.error.body, auth.error.status);

	const id = Number(c.req.param('id'));
	const zoneid = Number(c.req.query('zoneid'));
	if (!zoneid) return c.json({ message: 'zoneid required' }, 400);

	const callerMembership = await c.env.DB.prepare('SELECT role FROM zone_membership WHERE zone_id = ? AND player_id = ?')
		.bind(zoneid, auth.session.playerid)
		.first<{ role: string }>();
	if (!callerMembership || callerMembership.role !== 'admin') {
		return c.json({ message: 'Admin access required' }, 403);
	}

	await c.env.DB.prepare('DELETE FROM zone_membership WHERE zone_id = ? AND player_id = ?').bind(zoneid, id).run();

	const remaining = await c.env.DB.prepare('SELECT 1 FROM zone_membership WHERE player_id = ? LIMIT 1').bind(id).first();
	if (remaining) {
		return c.json({ success: true, removedFromZone: true });
	}

	if (await isPlayerReferenced(c.env, id)) {
		// Removal from the zone still succeeded - only the "also delete the
		// global record" cascade didn't apply, which isn't a failure.
		return c.json({ success: true, removedFromZone: true, keptRecord: true });
	}
	await c.env.DB.prepare('DELETE FROM players WHERE id = ?').bind(id).run();
	return c.json({ success: true, deleted: true });
});

export default players;
