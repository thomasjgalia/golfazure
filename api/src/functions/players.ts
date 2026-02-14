import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { getPool } from '../db'

// GET /api/players
app.http('players-list', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'players',
  handler: async (_req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const pool = await getPool()
      const result = await pool.request().query('SELECT * FROM players ORDER BY CAST(lastname AS NVARCHAR(MAX)) ASC')
      return { jsonBody: result.recordset }
    } catch (err: any) {
      return { status: 500, jsonBody: { message: err.message } }
    }
  },
})

// GET /api/players/{id}
app.http('players-get', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'players/{id:int}',
  handler: async (req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const pool = await getPool()
      const result = await pool.request()
        .input('id', Number(req.params.id))
        .query('SELECT * FROM players WHERE playerid = @id')
      if (!result.recordset[0]) return { status: 404, jsonBody: { message: 'Player not found' } }
      return { jsonBody: result.recordset[0] }
    } catch (err: any) {
      return { status: 500, jsonBody: { message: err.message } }
    }
  },
})

// POST /api/players/byIds
app.http('players-by-ids', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'players/byIds',
  handler: async (req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const body = (await req.json()) as any
      const ids: number[] = body.ids
      if (!ids?.length) return { jsonBody: [] }
      const pool = await getPool()
      const request = pool.request()
      const params = ids.map((id, i) => {
        request.input(`id${i}`, id)
        return `@id${i}`
      })
      const result = await request.query(
        `SELECT playerid, firstname, lastname, handicap FROM players WHERE playerid IN (${params.join(',')})`
      )
      return { jsonBody: result.recordset }
    } catch (err: any) {
      return { status: 500, jsonBody: { message: err.message } }
    }
  },
})

// POST /api/players
app.http('players-create', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'players',
  handler: async (req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const pool = await getPool()
      const b = (await req.json()) as any
      const result = await pool.request()
        .input('firstname', b.firstname)
        .input('lastname', b.lastname)
        .input('phone', b.phone ?? null)
        .input('email', b.email ?? null)
        .input('handicap', b.handicap ?? null)
        .input('profile_secret', b.profile_secret ?? null)
        .input('is_admin', b.is_admin ?? false)
        .query(`INSERT INTO players (firstname, lastname, phone, email, handicap, profile_secret, is_admin)
                OUTPUT INSERTED.*
                VALUES (@firstname, @lastname, @phone, @email, @handicap, @profile_secret, @is_admin)`)
      return { jsonBody: result.recordset[0] }
    } catch (err: any) {
      return { status: 500, jsonBody: { message: err.message } }
    }
  },
})

// PUT /api/players/{id}
app.http('players-update', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'players/{id:int}',
  handler: async (req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const pool = await getPool()
      const b = (await req.json()) as any
      const sets: string[] = []
      const request = pool.request().input('id', Number(req.params.id))

      const fields: Record<string, any> = { ...b }
      delete fields.playerid
      delete fields.created_at
      delete fields.updated_at

      let i = 0
      for (const [key, val] of Object.entries(fields)) {
        const param = `p${i++}`
        sets.push(`${key} = @${param}`)
        request.input(param, val)
      }

      if (sets.length === 0) return { status: 400, jsonBody: { message: 'No fields to update' } }

      const result = await request.query(`UPDATE players SET ${sets.join(', ')} OUTPUT INSERTED.* WHERE playerid = @id`)
      if (!result.recordset[0]) return { status: 404, jsonBody: { message: 'Player not found' } }
      return { jsonBody: result.recordset[0] }
    } catch (err: any) {
      return { status: 500, jsonBody: { message: err.message } }
    }
  },
})

// DELETE /api/players/{id}
app.http('players-delete', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'players/{id:int}',
  handler: async (req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const pool = await getPool()
      await pool.request()
        .input('id', Number(req.params.id))
        .query('DELETE FROM players WHERE playerid = @id')
      return { jsonBody: { success: true } }
    } catch (err: any) {
      if (err.message?.includes('REFERENCE') || err.number === 547) {
        return { status: 409, jsonBody: { message: 'Cannot delete player - they are part of existing teams or events. Remove them from teams first.' } }
      }
      return { status: 500, jsonBody: { message: err.message } }
    }
  },
})
