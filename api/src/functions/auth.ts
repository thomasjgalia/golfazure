import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { signSession } from '../lib/token'
import { getPlayer } from '../lib/playersTable'
import { listZonesForPlayer } from '../lib/zoneMembershipTable'
import { listZones } from '../lib/zonesTable'

// POST /api/auth/claim - verify a player's profile secret and issue a session token.
// The secret is only ever checked server-side; it is never returned to the client.
// Also returns the player's zone memberships inline, so the frontend doesn't
// need a second round-trip immediately after claiming just to know which
// zones it belongs to and what role it has in each.
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

      const player = await getPlayer(playerid)

      if (!player || !player.profile_secret || player.profile_secret.toLowerCase() !== secret.toLowerCase()) {
        return { status: 401, jsonBody: { message: 'Invalid player or secret' } }
      }

      const token = signSession(player.playerid)
      const { profile_secret: _omit, ...publicPlayer } = player

      const [memberships, allZones] = await Promise.all([listZonesForPlayer(player.playerid), listZones()])
      const zoneNameById = new Map(allZones.map((z) => [z.zoneid, z.name]))
      const zones = memberships.map((m) => ({ zoneid: m.zoneid, name: zoneNameById.get(m.zoneid) ?? `Zone ${m.zoneid}`, role: m.role }))

      return { jsonBody: { token, player: publicPlayer, zones } }
    } catch (err: any) {
      return { status: 500, jsonBody: { message: err.message } }
    }
  },
})
