// Row <-> frontend-shape mapping, shared across route modules. Column names
// on the D1 side are snake_case/relational; the frontend's shapes (src/types.ts)
// predate this migration and are kept unchanged, so every read maps back into
// that exact contract.

export type PlayerDbRow = {
	id: number;
	firstname: string;
	lastname: string;
	email: string | null;
	phone: string | null;
	handicap: number | null;
	profile_secret: string | null;
	created_at: string;
	updated_at: string;
};

export function mapPlayer(row: PlayerDbRow) {
	return {
		playerid: row.id,
		firstname: row.firstname,
		lastname: row.lastname,
		email: row.email,
		phone: row.phone,
		handicap: row.handicap,
		profile_secret: row.profile_secret,
		created_at: row.created_at,
		updated_at: row.updated_at,
	};
}

// Never send profile_secret to the client - that only ever leaves the server
// via /api/auth/claim, and only to the player who proved they know it.
export function toPublicPlayer(row: PlayerDbRow) {
	const { profile_secret: _omit, ...rest } = mapPlayer(row);
	return rest;
}

export type ZoneDbRow = { id: number; name: string; created_by: number; created_at: string };

export function mapZone(row: ZoneDbRow) {
	return { zoneid: row.id, name: row.name, createdBy: row.created_by, created_at: row.created_at };
}

export type EventDbRow = {
	id: number;
	zone_id: number | null;
	eventname: string;
	eventdate: string;
	coursename: string;
	tees: string | null;
	format: string | null;
	numberofholes: number;
	parperhole: string;
	islocked: number;
	status: string;
	created_at: string;
	updated_at: string;
};

export function mapEvent(row: EventDbRow) {
	let parperhole: number[] = [];
	try {
		parperhole = JSON.parse(row.parperhole ?? '[]');
	} catch {
		parperhole = [];
	}
	return {
		eventid: row.id,
		zoneid: row.zone_id,
		eventname: row.eventname,
		eventdate: row.eventdate,
		coursename: row.coursename,
		tees: row.tees,
		format: row.format,
		numberofholes: row.numberofholes,
		parperhole,
		islocked: !!row.islocked,
		status: row.status,
		created_at: row.created_at,
		updated_at: row.updated_at,
	};
}

export type TeamDbRow = {
	id: number;
	event_id: number;
	teamname: string;
	players: string;
	startinghole: number | null;
	created_at: string;
	updated_at: string;
};

export type TeamPlayers = { player1?: number; player2?: number; player3?: number; player4?: number };

export function mapTeam(row: TeamDbRow) {
	let players: TeamPlayers = {};
	try {
		players = JSON.parse(row.players ?? '{}');
	} catch {
		players = {};
	}
	return {
		teamid: row.id,
		eventid: row.event_id,
		teamname: row.teamname,
		players,
		startinghole: row.startinghole,
		created_at: row.created_at,
		updated_at: row.updated_at,
	};
}

export type ScoreDbRow = {
	id: number;
	event_id: number;
	team_id: number | null;
	player_id: number | null;
	holenumber: number;
	strokes: number | null;
	created_at: string;
	updated_at: string;
};

export function mapScore(row: ScoreDbRow) {
	return {
		scoreid: row.id,
		eventid: row.event_id,
		teamid: row.team_id,
		playerid: row.player_id,
		holenumber: row.holenumber,
		strokes: row.strokes,
		created_at: row.created_at,
		updated_at: row.updated_at,
	};
}

// Reproduces the exact uniqueness the old Azure Table Storage RowKey gave for
// free (team-{id}-h{n} / player-{id}-h{n}) as a real UNIQUE column, so
// upserts stay correct even though SQL UNIQUE treats NULL columns as
// distinct from each other (a naive UNIQUE(event,team,player,hole) would NOT
// dedupe multiple team-scored rows, since player_id is NULL in all of them).
export function scoreKey(teamid: number | null, playerid: number | null, holenumber: number): string {
	return playerid == null ? `team-${teamid}-h${holenumber}` : `player-${playerid}-h${holenumber}`;
}
