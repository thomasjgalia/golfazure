import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { getPool } from '../db'

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
    try {
      const pool = await getPool()
      const b = (await req.json()) as any
      const sets: string[] = []
      const request = pool.request().input('id', Number(req.params.id))

      const fields: Record<string, any> = { ...b }
      delete fields.teamid
      delete fields.created_at
      delete fields.updated_at

      if (fields.players !== undefined) {
        fields.players = typeof fields.players === 'string' ? fields.players : JSON.stringify(fields.players)
      }

      let i = 0
      for (const [key, val] of Object.entries(fields)) {
        const param = `p${i++}`
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
