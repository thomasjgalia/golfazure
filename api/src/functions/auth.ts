import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { getPool } from '../db'
import { signSession } from '../lib/token'

// POST /api/auth/claim - verify a player's profile secret and issue a session token.
// The secret is only ever checked server-side; it is never returned to the client.
app.http('auth-claim', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'auth/claim',
  handler: async (req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const b = (await req.json()) as any
      const playerid = Number(b.playerid)
      const secret = typeof b.secret === 'string' ? b.secret.trim() : ''
      if (!playerid || !secret) return { status: 400, jsonBody: { message: 'playerid and secret are required' } }

      const pool = await getPool()
      const result = await pool.request()
        .input('id', playerid)
        .query(
          'SELECT playerid, firstname, lastname, phone, email, handicap, profile_secret, is_admin FROM players WHERE playerid = @id'
        )
      const player = result.recordset[0]

      if (!player || !player.profile_secret || player.profile_secret.toLowerCase() !== secret.toLowerCase()) {
        return { status: 401, jsonBody: { message: 'Invalid player or secret' } }
      }

      const token = signSession(player.playerid, !!player.is_admin)
      const { profile_secret: _omit, ...publicPlayer } = player

      return { jsonBody: { token, player: publicPlayer } }
    } catch (err: any) {
      return { status: 500, jsonBody: { message: err.message } }
    }
  },
})
