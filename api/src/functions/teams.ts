import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { getPool } from '../db'
import { requireAdmin } from '../lib/authz'

// Fields a team row may be updated with (eventid is set once at creation, not editable after).
const WRITABLE_FIELDS = ['teamname', 'players', 'startinghole']

// GET /api/teams?eventId=N
app.http('teams-list', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'teams',
  handler: async (req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const eventId = Number(req.query.get('eventId'))
      if (!eventId) return { status: 400, jsonBody: { message: 'eventId required' } }
      const pool = await getPool()
      const result = await pool.request()
        .input('eventId', eventId)
        .query('SELECT * FROM teams WHERE eventid = @eventId ORDER BY CAST(teamname AS NVARCHAR(MAX)) ASC')
      const rows = result.recordset.map((r: any) => ({
        ...r,
        players: typeof r.players === 'string' ? JSON.parse(r.players) : r.players ?? {},
      }))
      return { jsonBody: rows }
    } catch (err: any) {
      return { status: 500, jsonBody: { message: err.message } }
    }
  },
})

// POST /api/teams
app.http('teams-create', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'teams',
  handler: async (req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> => {
    const auth = requireAdmin(req)
    if (auth.error) return auth.error
    try {
      const pool = await getPool()
      const b = (await req.json()) as any
      const players = typeof b.players === 'string' ? b.players : JSON.stringify(b.players ?? {})
      const result = await pool.request()
        .input('eventid', b.eventid)
        .input('teamname', b.teamname)
        .input('players', players)
        .input('startinghole', b.startinghole ?? null)
        .query(`INSERT INTO teams (eventid, teamname, players, startinghole)
                OUTPUT INSERTED.*
                VALUES (@eventid, @teamname, @players, @startinghole)`)
      const row = result.recordset[0]
      row.players = typeof row.players === 'string' ? JSON.parse(row.players) : row.players ?? {}
      return { jsonBody: row }
    } catch (err: any) {
      return { status: 500, jsonBody: { message: err.message } }
    }
  },
})

// PUT /api/teams/{id}
app.http('teams-update', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'teams/{id:int}',
  handler: async (req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> => {
    const auth = requireAdmin(req)
    if (auth.error) return auth.error
    try {
      const pool = await getPool()
      const b = (await req.json()) as any
      const sets: string[] = []
      const request = pool.request().input('id', Number(req.params.id))

      let i = 0
      for (const key of WRITABLE_FIELDS) {
        if (!(key in b)) continue
        const param = `p${i++}`
        let val = b[key]
        if (key === 'players') val = typeof val === 'string' ? val : JSON.stringify(val)
        sets.push(`${key} = @${param}`)
        request.input(param, val)
      }

      if (sets.length === 0) return { status: 400, jsonBody: { message: 'No fields to update' } }

      const result = await request.query(`UPDATE teams SET ${sets.join(', ')} OUTPUT INSERTED.* WHERE teamid = @id`)
      if (!result.recordset[0]) return { status: 404, jsonBody: { message: 'Team not found' } }
      const row = result.recordset[0]
      row.players = typeof row.players === 'string' ? JSON.parse(row.players) : row.players ?? {}
      return { jsonBody: row }
    } catch (err: any) {
      return { status: 500, jsonBody: { message: err.message } }
    }
  },
})

// DELETE /api/teams/{id}
app.http('teams-delete', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'teams/{id:int}',
  handler: async (req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> => {
    const auth = requireAdmin(req)
    if (auth.error) return auth.error
    try {
      const pool = await getPool()
      await pool.request()
        .input('id', Number(req.params.id))
        .query('DELETE FROM teams WHERE teamid = @id')
      return { jsonBody: { success: true } }
    } catch (err: any) {
      return { status: 500, jsonBody: { message: err.message } }
    }
  },
})
