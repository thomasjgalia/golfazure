import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { requireAdmin } from '../lib/authz'
import { PlayerRecord, listPlayers, getPlayer, getPlayersByIds, createPlayer, updatePlayer, deletePlayer } from '../lib/playersTable'
import { listAllTeams } from '../lib/teamsTable'
import { anyScoreReferencesPlayer, listAllScores } from '../lib/scoresTable'
import { listEvents } from '../lib/eventsTable'

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

// GET /api/players/{id}/history - cross-event results, aggregated server-side
// so the browser doesn't have to fetch every event's teams/scores itself.
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
