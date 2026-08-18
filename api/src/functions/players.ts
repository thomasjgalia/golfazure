import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { requireAuth, requireAnyZoneAdmin } from '../lib/authz'
import { PlayerRecord, listPlayers, getPlayer, getPlayersByIds, createPlayer, updatePlayer, deletePlayer } from '../lib/playersTable'
import { listAllTeams } from '../lib/teamsTable'
import { anyScoreReferencesPlayer, listAllScores } from '../lib/scoresTable'
import { listEvents } from '../lib/eventsTable'
import { listZonesForPlayer, upsertMembership, deleteMembership, getMembership } from '../lib/zoneMembershipTable'

// Standard Stableford points table - higher is better. Kept in sync with the
// frontend's copy in src/utils/format.ts (separate packages, no shared lib).
function stablefordPoints(strokes: number, par: number): number {
  const diff = strokes - par
  if (diff <= -3) return 5
  if (diff === -2) return 4
  if (diff === -1) return 3
  if (diff === 0) return 2
  if (diff === 1) return 1
  return 0
}

// Never send profile_secret to the client - that only ever leaves the server
// via /api/auth/claim, and only to the player who proved they know it.
function toPublic(p: PlayerRecord) {
  const { profile_secret: _omit, ...publicPlayer } = p
  return publicPlayer
}

// Replaces the delete-protection that used to come from a SQL foreign key -
// now that teams/scores have also moved to Table Storage, this is enforced
// entirely in application code with no SQL connection needed anywhere.
async function isPlayerReferenced(id: number): Promise<boolean> {
  if (await anyScoreReferencesPlayer(id)) return true
  const teams = await listAllTeams()
  return teams.some((t) => Object.values(t.players).includes(id))
}

// Does the caller admin at least one zone the target player also belongs
// to? Players are global/shared, so editing someone's shared identity
// fields (name/email/handicap/etc.) only requires a zone in common, not
// being an admin of every zone the target happens to be in.
async function sharesAdminZoneWith(callerPlayerId: number, targetPlayerId: number): Promise<boolean> {
  const [callerZones, targetZones] = await Promise.all([
    listZonesForPlayer(callerPlayerId),
    listZonesForPlayer(targetPlayerId),
  ])
  const adminZoneIds = new Set(callerZones.filter((z) => z.role === 'admin').map((z) => z.zoneid))
  return targetZones.some((z) => adminZoneIds.has(z.zoneid))
}

// GET /api/players - the full global directory. Deliberately not
// zone-filtered: adding a player to a zone requires seeing the whole
// directory first (search-existing-before-create), not just one zone's
// current roster.
app.http('players-list', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'players',
  handler: async (req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> => {
    const auth = requireAuth(req)
    if (auth.error) return auth.error
    try {
      const players = await listPlayers()
      return { jsonBody: players.map(toPublic) }
    } catch (err: any) {
      return { status: 500, jsonBody: { message: err.message } }
    }
  },
})

// GET /api/players/claimable - anonymous, minimal fields only. Powers the
// claim-profile picker, which by definition runs before a session exists.
app.http('players-claimable', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'players/claimable',
  handler: async (_req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const players = await listPlayers()
      return { jsonBody: players.map((p) => ({ playerid: p.playerid, firstname: p.firstname, lastname: p.lastname })) }
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

// GET /api/players/{id}/history - cross-event results, aggregated server-side
// so the browser doesn't have to fetch every event's teams/scores itself.
// Deliberately cross-zone: shows every zone the player belongs to, regardless
// of who's viewing.
app.http('players-history', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'players/{id:int}/history',
  handler: async (req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const playerid = Number(req.params.id)
      const player = await getPlayer(playerid)
      if (!player) return { status: 404, jsonBody: { message: 'Player not found' } }

      const [events, teams, scores] = await Promise.all([listEvents(), listAllTeams(), listAllScores()])

      const historyEvents = []
      for (const ev of events) {
        const isIndividual = ev.format === 'Stroke Play' || ev.format === 'Stableford'
        const team = teams.find((t) => t.eventid === ev.eventid && Object.values(t.players).includes(playerid))

        const byHole: Record<number, number> = {}
        if (isIndividual) {
          for (const s of scores) {
            if (s.eventid === ev.eventid && s.playerid === playerid && s.strokes != null) byHole[s.holenumber] = s.strokes
          }
        } else if (team) {
          for (const s of scores) {
            if (s.eventid === ev.eventid && s.teamid === team.teamid && s.playerid == null && s.strokes != null) byHole[s.holenumber] = s.strokes
          }
        }

        const holesCompleted = Object.keys(byHole).length
        if (!team && holesCompleted === 0) continue // player had no involvement in this event

        let totalStrokes: number | null = null
        let totalPar: number | null = null
        let scoreToPar: number | null = null
        let totalPoints: number | null = null
        if (holesCompleted > 0) {
          totalStrokes = 0
          totalPar = 0
          totalPoints = 0
          for (const [holeStr, strokes] of Object.entries(byHole)) {
            const hole = Number(holeStr)
            const par = ev.parperhole[hole - 1] ?? 4
            totalStrokes += strokes
            totalPar += par
            totalPoints += stablefordPoints(strokes, par)
          }
          scoreToPar = totalStrokes - totalPar
        }

        const teammateIds = team
          ? (Object.values(team.players).filter((id) => id != null && id !== playerid) as number[])
          : []

        historyEvents.push({
          eventid: ev.eventid,
          eventname: ev.eventname,
          eventdate: ev.eventdate,
          coursename: ev.coursename,
          format: ev.format,
          numberofholes: ev.numberofholes,
          status: ev.status,
          teamid: team?.teamid ?? null,
          teamname: team?.teamname ?? null,
          teammateIds,
          holesCompleted,
          totalStrokes,
          totalPar,
          scoreToPar,
          totalPoints: ev.format === 'Stableford' ? totalPoints : null,
        })
      }

      historyEvents.sort((a, b) => (a.eventdate < b.eventdate ? 1 : a.eventdate > b.eventdate ? -1 : 0))

      const strokePlayRounds = historyEvents.filter((e) => e.format === 'Stroke Play' && e.scoreToPar != null)
      const strokePlayAverageToPar = strokePlayRounds.length
        ? Math.round((strokePlayRounds.reduce((a, e) => a + (e.scoreToPar ?? 0), 0) / strokePlayRounds.length) * 10) / 10
        : null

      const stablefordRounds = historyEvents.filter((e) => e.format === 'Stableford' && e.totalPoints != null)
      const stablefordAveragePoints = stablefordRounds.length
        ? Math.round((stablefordRounds.reduce((a, e) => a + (e.totalPoints ?? 0), 0) / stablefordRounds.length) * 10) / 10
        : null

      return {
        jsonBody: {
          playerid,
          firstname: player.firstname,
          lastname: player.lastname,
          strokePlayAverageToPar,
          stablefordAveragePoints,
          events: historyEvents,
        },
      }
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

// POST /api/players - creates a player and immediately attaches them to the
// creating admin's zone as a member. This is the "create from scratch" half
// of the zone roster's search-existing-or-create flow.
app.http('players-create', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'players',
  handler: async (req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> => {
    const auth = await requireAnyZoneAdmin(req)
    if (auth.error) return auth.error
    try {
      const b = (await req.json()) as any
      const zoneid = Number(b.zoneid)
      if (!zoneid) return { status: 400, jsonBody: { message: 'zoneid required' } }
      const player = await createPlayer({
        firstname: b.firstname,
        lastname: b.lastname,
        phone: b.phone ?? null,
        email: b.email ?? null,
        handicap: b.handicap ?? null,
        profile_secret: b.profile_secret ?? null,
      })
      await upsertMembership({ zoneid, playerid: player.playerid, role: 'member' })
      return { jsonBody: toPublic(player) }
    } catch (err: any) {
      return { status: 500, jsonBody: { message: err.message } }
    }
  },
})

// PUT /api/players/{id} - editing a player's shared identity fields requires
// the caller to admin some zone the target also belongs to (not necessarily
// every zone they're in).
app.http('players-update', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'players/{id:int}',
  handler: async (req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> => {
    const auth = requireAuth(req)
    if (auth.error) return auth.error
    try {
      const id = Number(req.params.id)
      // A player can always edit their own profile; editing someone else's
      // requires admin in a zone the target also belongs to.
      const isSelf = auth.session.playerid === id
      if (!isSelf && !(await sharesAdminZoneWith(auth.session.playerid, id))) {
        return { status: 403, jsonBody: { message: 'Admin access required in a zone this player belongs to' } }
      }
      const b = (await req.json()) as any
      const patch: Record<string, any> = {}
      for (const key of ['firstname', 'lastname', 'phone', 'email', 'handicap', 'profile_secret']) {
        if (key in b) patch[key] = b[key]
      }
      if (Object.keys(patch).length === 0) return { status: 400, jsonBody: { message: 'No fields to update' } }

      const player = await updatePlayer(id, patch)
      if (!player) return { status: 404, jsonBody: { message: 'Player not found' } }
      return { jsonBody: toPublic(player) }
    } catch (err: any) {
      return { status: 500, jsonBody: { message: err.message } }
    }
  },
})

// DELETE /api/players/{id}?zoneid=N - removes the player from that specific
// zone (deletes the membership row). Only if that was their last remaining
// zone membership anywhere does this fall through to actually deleting the
// global player record (still gated by the existing reference check).
app.http('players-delete', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'players/{id:int}',
  handler: async (req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> => {
    const auth = requireAuth(req)
    if (auth.error) return auth.error
    try {
      const id = Number(req.params.id)
      const zoneid = Number(req.query.get('zoneid'))
      if (!zoneid) return { status: 400, jsonBody: { message: 'zoneid required' } }

      const callerMembership = await getMembership(zoneid, auth.session.playerid)
      if (!callerMembership || callerMembership.role !== 'admin') {
        return { status: 403, jsonBody: { message: 'Admin access required' } }
      }

      await deleteMembership(zoneid, id)

      const remaining = await listZonesForPlayer(id)
      if (remaining.length > 0) {
        return { jsonBody: { success: true, removedFromZone: true } }
      }

      if (await isPlayerReferenced(id)) {
        // Removal from the zone still succeeded - only the "also delete the
        // global record" cascade didn't apply, which isn't a failure.
        return { jsonBody: { success: true, removedFromZone: true, keptRecord: true } }
      }
      await deletePlayer(id)
      return { jsonBody: { success: true, deleted: true } }
    } catch (err: any) {
      return { status: 500, jsonBody: { message: err.message } }
    }
  },
})
