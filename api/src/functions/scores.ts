import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { requireAuth } from '../lib/authz'
import { SessionPayload } from '../lib/token'
import { listScores, upsertScore as upsertScoreRecord, deleteScore } from '../lib/scoresTable'
import { getTeam } from '../lib/teamsTable'

const FORBIDDEN: HttpResponseInit = { status: 403, jsonBody: { message: 'You can only edit scores for your own team' } }

// A claimed player may only write scores for a team they belong to (or their own
// player-level scores); admins may write anything.
async function canEditTeam(eventid: number, teamid: number, session: SessionPayload): Promise<boolean> {
  if (session.isAdmin) return true
  const team = await getTeam(teamid)
  if (!team || team.eventid !== eventid) return false
  return Object.values(team.players).includes(session.playerid)
}

function canEditPlayer(playerid: number, session: SessionPayload): boolean {
  return session.isAdmin || session.playerid === playerid
}

// GET /api/scores?eventId=N&teamId=N
app.http('scores-list', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'scores',
  handler: async (req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const eventId = Number(req.query.get('eventId'))
      if (!eventId) return { status: 400, jsonBody: { message: 'eventId required' } }
      const teamIdParam = req.query.get('teamId')
      const scores = await listScores(eventId, teamIdParam ? Number(teamIdParam) : undefined)
      return { jsonBody: scores }
    } catch (err: any) {
      return { status: 500, jsonBody: { message: err.message } }
    }
  },
})

// POST /api/scores/upsert
app.http('scores-upsert', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'scores/upsert',
  handler: async (req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> => {
    const auth = requireAuth(req)
    if (auth.error) return auth.error
    try {
      const b = (await req.json()) as any
      const useTeam = b.playerid == null

      const allowed = useTeam
        ? await canEditTeam(Number(b.eventid), Number(b.teamid), auth.session)
        : canEditPlayer(Number(b.playerid), auth.session)
      if (!allowed) return FORBIDDEN

      const score = await upsertScoreRecord({
        eventid: Number(b.eventid),
        playerid: b.playerid ?? null,
        teamid: b.teamid ?? null,
        holenumber: Number(b.holenumber),
        strokes: b.strokes ?? null,
      })
      return { jsonBody: score }
    } catch (err: any) {
      return { status: 500, jsonBody: { message: err.message } }
    }
  },
})

// POST /api/scores/delete
app.http('scores-delete', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'scores/delete',
  handler: async (req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> => {
    const auth = requireAuth(req)
    if (auth.error) return auth.error
    try {
      const b = (await req.json()) as any
      const isTeamMode = b.mode === 'team'

      const allowed = isTeamMode
        ? await canEditTeam(Number(b.eventid), Number(b.playerOrTeamId), auth.session)
        : canEditPlayer(Number(b.playerOrTeamId), auth.session)
      if (!allowed) return FORBIDDEN

      await deleteScore(Number(b.eventid), isTeamMode ? 'team' : 'player', Number(b.playerOrTeamId), Number(b.holenumber))
      return { jsonBody: { success: true } }
    } catch (err: any) {
      return { status: 500, jsonBody: { message: err.message } }
    }
  },
})
