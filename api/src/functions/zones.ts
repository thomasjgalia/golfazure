import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { requireAuth, requireZoneMember, requireZoneAdmin } from '../lib/authz'
import { listZones, getZone, createZone } from '../lib/zonesTable'
import { listMembers, listZonesForPlayer, upsertMembership, deleteMembership, getMembership } from '../lib/zoneMembershipTable'
import { getPlayersByIds, createPlayer, PlayerRecord } from '../lib/playersTable'

function toPublicPlayer(p: PlayerRecord) {
  const { profile_secret: _omit, ...publicPlayer } = p
  return publicPlayer
}

// POST /api/zones - self-service, no approval: any signed-in player can
// create a zone and becomes its first admin.
app.http('zones-create', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'zones',
  handler: async (req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> => {
    const auth = requireAuth(req)
    if (auth.error) return auth.error
    try {
      const b = (await req.json()) as any
      const name = typeof b.name === 'string' ? b.name.trim() : ''
      if (!name) return { status: 400, jsonBody: { message: 'name required' } }

      const zone = await createZone({ name, createdBy: auth.session.playerid })
      await upsertMembership({ zoneid: zone.zoneid, playerid: auth.session.playerid, role: 'admin' })
      return { jsonBody: zone }
    } catch (err: any) {
      return { status: 500, jsonBody: { message: err.message } }
    }
  },
})

// GET /api/zones/mine - every zone the caller belongs to, with their role in each.
app.http('zones-mine', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'zones/mine',
  handler: async (req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> => {
    const auth = requireAuth(req)
    if (auth.error) return auth.error
    try {
      const [memberships, allZones] = await Promise.all([listZonesForPlayer(auth.session.playerid), listZones()])
      const zoneNameById = new Map(allZones.map((z) => [z.zoneid, z.name]))
      const zones = memberships.map((m) => ({ zoneid: m.zoneid, name: zoneNameById.get(m.zoneid) ?? `Zone ${m.zoneid}`, role: m.role }))
      return { jsonBody: zones }
    } catch (err: any) {
      return { status: 500, jsonBody: { message: err.message } }
    }
  },
})

// GET /api/zones/{id}/members - roster with public player fields, any member can view.
app.http('zones-members-list', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'zones/{id:int}/members',
  handler: async (req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> => {
    const zoneid = Number(req.params.id)
    const auth = await requireZoneMember(req, zoneid)
    if (auth.error) return auth.error
    try {
      const members = await listMembers(zoneid)
      const players = await getPlayersByIds(members.map((m) => m.playerid))
      const playerById = new Map(players.map((p) => [p.playerid, p]))
      const roster = members
        .map((m) => {
          const p = playerById.get(m.playerid)
          return p ? { ...toPublicPlayer(p), role: m.role, joined_at: m.joined_at } : null
        })
        .filter((r): r is NonNullable<typeof r> => r != null)
      return { jsonBody: roster }
    } catch (err: any) {
      return { status: 500, jsonBody: { message: err.message } }
    }
  },
})

// POST /api/zones/{id}/members - zone-admin-driven rostering. Body is either
// { playerid } to attach an existing player, or full new-player fields to
// create one from scratch and attach them in the same action. This is the
// single endpoint backing the search-existing-or-create UI flow.
app.http('zones-members-add', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'zones/{id:int}/members',
  handler: async (req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> => {
    const zoneid = Number(req.params.id)
    const auth = await requireZoneAdmin(req, zoneid)
    if (auth.error) return auth.error
    try {
      const zone = await getZone(zoneid)
      if (!zone) return { status: 404, jsonBody: { message: 'Zone not found' } }

      const b = (await req.json()) as any
      let playerid: number

      if (b.playerid) {
        playerid = Number(b.playerid)
        const existing = await getMembership(zoneid, playerid)
        if (existing) return { status: 409, jsonBody: { message: 'Player is already a member of this zone' } }
      } else {
        if (!b.firstname || !b.lastname) return { status: 400, jsonBody: { message: 'firstname and lastname required' } }
        const player = await createPlayer({
          firstname: b.firstname,
          lastname: b.lastname,
          phone: b.phone ?? null,
          email: b.email ?? null,
          handicap: b.handicap ?? null,
          profile_secret: b.profile_secret ?? null,
        })
        playerid = player.playerid
      }

      const membership = await upsertMembership({ zoneid, playerid, role: 'member' })
      return { jsonBody: membership }
    } catch (err: any) {
      return { status: 500, jsonBody: { message: err.message } }
    }
  },
})

// PUT /api/zones/{id}/members/{playerid} - change role. Guards against
// leaving a zone with zero admins.
app.http('zones-members-update-role', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'zones/{id:int}/members/{playerid:int}',
  handler: async (req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> => {
    const zoneid = Number(req.params.id)
    const playerid = Number(req.params.playerid)
    const auth = await requireZoneAdmin(req, zoneid)
    if (auth.error) return auth.error
    try {
      const b = (await req.json()) as any
      const role = b.role === 'admin' ? 'admin' : b.role === 'member' ? 'member' : null
      if (!role) return { status: 400, jsonBody: { message: "role must be 'admin' or 'member'" } }

      const current = await getMembership(zoneid, playerid)
      if (!current) return { status: 404, jsonBody: { message: 'Not a member of this zone' } }

      if (current.role === 'admin' && role === 'member') {
        const members = await listMembers(zoneid)
        const adminCount = members.filter((m) => m.role === 'admin').length
        if (adminCount <= 1) return { status: 409, jsonBody: { message: 'A zone must have at least one admin' } }
      }

      const membership = await upsertMembership({ zoneid, playerid, role })
      return { jsonBody: membership }
    } catch (err: any) {
      return { status: 500, jsonBody: { message: err.message } }
    }
  },
})

// DELETE /api/zones/{id}/members/{playerid} - removes membership only, never
// the underlying player record (see players-delete for the full-delete path).
app.http('zones-members-remove', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'zones/{id:int}/members/{playerid:int}',
  handler: async (req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> => {
    const zoneid = Number(req.params.id)
    const playerid = Number(req.params.playerid)
    const auth = await requireZoneAdmin(req, zoneid)
    if (auth.error) return auth.error
    try {
      const current = await getMembership(zoneid, playerid)
      if (!current) return { status: 404, jsonBody: { message: 'Not a member of this zone' } }

      if (current.role === 'admin') {
        const members = await listMembers(zoneid)
        const adminCount = members.filter((m) => m.role === 'admin').length
        if (adminCount <= 1) return { status: 409, jsonBody: { message: 'A zone must have at least one admin' } }
      }

      await deleteMembership(zoneid, playerid)
      return { jsonBody: { success: true } }
    } catch (err: any) {
      return { status: 500, jsonBody: { message: err.message } }
    }
  },
})
