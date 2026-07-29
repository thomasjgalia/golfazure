import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { ConnectionPool } from 'mssql'
import { getPool } from '../db'
import { requireAuth } from '../lib/authz'
import { SessionPayload } from '../lib/token'

const FORBIDDEN: HttpResponseInit = { status: 403, jsonBody: { message: 'You can only edit scores for your own team' } }

// A claimed player may only write scores for a team they belong to (or their own
// player-level scores); admins may write anything.
async function canEditTeam(pool: ConnectionPool, eventid: number, teamid: number, session: SessionPayload): Promise<boolean> {
  if (session.isAdmin) return true
  const result = await pool.request()
    .input('teamid', teamid)
    .input('eventid', eventid)
    .query('SELECT players FROM teams WHERE teamid = @teamid AND eventid = @eventid')
  const row = result.recordset[0]
  if (!row) return false
  const players = typeof row.players === 'string' ? JSON.parse(row.players) : row.players ?? {}
  return Object.values(players).includes(session.playerid)
}

function canEditPlayer(playerid: number, session: SessionPayload): boolean {
  return session.isAdmin || session.playerid === playerid
}

// GET /api/scores?eventId=N&teamId=N
app.http('scores-list', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'scores',
  handler: async (req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const eventId = Number(req.query.get('eventId'))
      if (!eventId) return { status: 400, jsonBody: { message: 'eventId required' } }
      const pool = await getPool()
      const request = pool.request().input('eventId', eventId)

      let sql = 'SELECT * FROM scores WHERE eventid = @eventId'
      const teamId = req.query.get('teamId')
      if (teamId) {
        request.input('teamId', Number(teamId))
        sql += ' AND teamid = @teamId'
      }
      sql += ' ORDER BY holenumber ASC'

      const result = await request.query(sql)
      return { jsonBody: result.recordset }
    } catch (err: any) {
      return { status: 500, jsonBody: { message: err.message } }
    }
  },
})

// POST /api/scores/upsert
app.http('scores-upsert', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'scores/upsert',
  handler: async (req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> => {
    const auth = requireAuth(req)
    if (auth.error) return auth.error
    try {
      const pool = await getPool()
      const b = (await req.json()) as any
      const useTeam = b.playerid == null

      const allowed = useTeam
        ? await canEditTeam(pool, Number(b.eventid), Number(b.teamid), auth.session)
        : canEditPlayer(Number(b.playerid), auth.session)
      if (!allowed) return FORBIDDEN

      const request = pool.request()
        .input('eventid', b.eventid)
        .input('playerid', b.playerid ?? null)
        .input('teamid', b.teamid ?? null)
        .input('holenumber', b.holenumber)
        .input('strokes', b.strokes)

      const matchCondition = useTeam
        ? 'target.eventid = source.eventid AND target.teamid = source.teamid AND target.holenumber = source.holenumber'
        : 'target.eventid = source.eventid AND target.playerid = source.playerid AND target.holenumber = source.holenumber'

      const sql = `
        MERGE scores AS target
        USING (SELECT @eventid AS eventid, @playerid AS playerid, @teamid AS teamid, @holenumber AS holenumber) AS source
        ON ${matchCondition}
        WHEN MATCHED THEN
          UPDATE SET strokes = @strokes, teamid = @teamid, playerid = @playerid
        WHEN NOT MATCHED THEN
          INSERT (eventid, playerid, teamid, holenumber, strokes)
          VALUES (@eventid, @playerid, @teamid, @holenumber, @strokes)
        OUTPUT INSERTED.*;
      `
      const result = await request.query(sql)
      return { jsonBody: result.recordset[0] }
    } catch (err: any) {
      return { status: 500, jsonBody: { message: err.message } }
    }
  },
})

// POST /api/scores/delete
app.http('scores-delete', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'scores/delete',
  handler: async (req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> => {
    const auth = requireAuth(req)
    if (auth.error) return auth.error
    try {
      const pool = await getPool()
      const b = (await req.json()) as any

      const isTeamMode = b.mode === 'team'
      const allowed = isTeamMode
        ? await canEditTeam(pool, Number(b.eventid), Number(b.playerOrTeamId), auth.session)
        : canEditPlayer(Number(b.playerOrTeamId), auth.session)
      if (!allowed) return FORBIDDEN

      const request = pool.request()
        .input('eventid', b.eventid)
        .input('holenumber', b.holenumber)

      let sql: string
      if (isTeamMode) {
        request.input('teamid', b.playerOrTeamId)
        sql = 'DELETE FROM scores WHERE eventid = @eventid AND teamid = @teamid AND holenumber = @holenumber'
      } else {
        request.input('playerid', b.playerOrTeamId)
        sql = 'DELETE FROM scores WHERE eventid = @eventid AND playerid = @playerid AND holenumber = @holenumber'
      }

      await request.query(sql)
      return { jsonBody: { success: true } }
    } catch (err: any) {
      return { status: 500, jsonBody: { message: err.message } }
    }
  },
})
