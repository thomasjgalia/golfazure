import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { getPool } from '../db'
import { requireAdmin } from '../lib/authz'
import { PlayerRecord, listPlayers, getPlayer, getPlayersByIds, createPlayer, updatePlayer, deletePlayer } from '../lib/playersTable'

// Never send profile_secret to the client - that only ever leaves the server
// via /api/auth/claim, and only to the player who proved they know it.
function toPublic(p: PlayerRecord) {
  const { profile_secret: _omit, ...publicPlayer } = p
  return publicPlayer
}

// teams/scores haven't migrated off SQL yet, so this is the one place players.ts
// still needs a SQL connection - to preserve the same delete-protection that used
// to come from a foreign key constraint, now enforced in application code.
async function isPlayerReferenced(id: number): Promise<boolean> {
  const pool = await getPool()
  const scoreCheck = await pool.request().input('id', id).query('SELECT TOP 1 scoreid FROM scores WHERE playerid = @id')
  if (scoreCheck.recordset.length > 0) return true

  const teamCheck = await pool.request().query('SELECT players FROM teams')
  for (const row of teamCheck.recordset) {
    const players = typeof row.players === 'string' ? JSON.parse(row.players) : row.players ?? {}
    if (Object.values(players).includes(id)) return true
  }
  return false
}

// GET /api/players
app.http('players-list', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'players',
  handler: async (_req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const players = await listPlayers()
      return { jsonBody: players.map(toPublic) }
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
      const player = await getPlayer(Number(req.params.id))
      if (!player) return { status: 404, jsonBody: { message: 'Player not found' } }
      return { jsonBody: toPublic(player) }
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
      const players = await getPlayersByIds(ids)
      return { jsonBody: players.map((p) => ({ playerid: p.playerid, firstname: p.firstname, lastname: p.lastname, handicap: p.handicap })) }
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
      const b = (await req.json()) as any
      const player = await createPlayer({
        firstname: b.firstname,
        lastname: b.lastname,
        phone: b.phone ?? null,
        email: b.email ?? null,
        handicap: b.handicap ?? null,
        profile_secret: b.profile_secret ?? null,
      })
      return { jsonBody: toPublic(player) }
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
      const b = (await req.json()) as any
      const patch: Record<string, any> = {}
      for (const key of ['firstname', 'lastname', 'phone', 'email', 'handicap', 'profile_secret']) {
        if (key in b) patch[key] = b[key]
      }
      if (Object.keys(patch).length === 0) return { status: 400, jsonBody: { message: 'No fields to update' } }

      const player = await updatePlayer(Number(req.params.id), patch)
      if (!player) return { status: 404, jsonBody: { message: 'Player not found' } }
      return { jsonBody: toPublic(player) }
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
      const id = Number(req.params.id)
      if (await isPlayerReferenced(id)) {
        return { status: 409, jsonBody: { message: 'Cannot delete player - they are part of existing teams or events. Remove them from teams first.' } }
      }
      await deletePlayer(id)
      return { jsonBody: { success: true } }
    } catch (err: any) {
      return { status: 500, jsonBody: { message: err.message } }
    }
  },
})
