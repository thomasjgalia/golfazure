import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { getPool } from '../db'
import { requireAdmin } from '../lib/authz'

// Public-safe column list - never includes profile_secret (that only ever leaves the
// server via /api/auth/claim, and only to the player who proved they know it).
const PUBLIC_COLUMNS = 'playerid, firstname, lastname, phone, email, handicap, is_admin, created_at, updated_at'

// Fields a player row may be created/updated with. is_admin is intentionally excluded -
// promoting admins is a direct-DB operation (see ADMIN_SETUP.md), not an API call.
const WRITABLE_FIELDS = ['firstname', 'lastname', 'phone', 'email', 'handicap', 'profile_secret']

// GET /api/players
app.http('players-list', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'players',
  handler: async (_req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const pool = await getPool()
      const result = await pool.request().query(`SELECT ${PUBLIC_COLUMNS} FROM players ORDER BY CAST(lastname AS NVARCHAR(MAX)) ASC`)
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
        .query(`SELECT ${PUBLIC_COLUMNS} FROM players WHERE playerid = @id`)
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
    const auth = requireAdmin(req)
    if (auth.error) return auth.error
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
        .query(`INSERT INTO players (firstname, lastname, phone, email, handicap, profile_secret, is_admin)
                OUTPUT ${PUBLIC_COLUMNS.split(', ').map((c) => `INSERTED.${c}`).join(', ')}
                VALUES (@firstname, @lastname, @phone, @email, @handicap, @profile_secret, 0)`)
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
        sets.push(`${key} = @${param}`)
        request.input(param, b[key])
      }

      if (sets.length === 0) return { status: 400, jsonBody: { message: 'No fields to update' } }

      const result = await request.query(
        `UPDATE players SET ${sets.join(', ')} OUTPUT ${PUBLIC_COLUMNS.split(', ').map((c) => `INSERTED.${c}`).join(', ')} WHERE playerid = @id`
      )
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
    const auth = requireAdmin(req)
    if (auth.error) return auth.error
    try {
      const pool = await getPool()
      await pool.request()
        .input('id', Number(req.params.id))
        .query('DELETE FROM players WHERE playerid = @id')
      return { jsonBody: { success: true } }
    } catch (err: any) {
      if (err.number === 547 || err.message?.includes('REFERENCE')) {
        return { status: 409, jsonBody: { message: 'Cannot delete player - they are part of existing teams or events. Remove them from teams first.' } }
      }
      return { status: 500, jsonBody: { message: err.message } }
    }
  },
})
