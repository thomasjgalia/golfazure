import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { requireAdmin } from '../lib/authz'
import { listTeamsByEvent, createTeam, updateTeam, deleteTeam } from '../lib/teamsTable'

// GET /api/teams?eventId=N
app.http('teams-list', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'teams',
  handler: async (req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const eventId = Number(req.query.get('eventId'))
      if (!eventId) return { status: 400, jsonBody: { message: 'eventId required' } }
      const teams = await listTeamsByEvent(eventId)
      return { jsonBody: teams }
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
    const auth = requireAdmin(req)
    if (auth.error) return auth.error
    try {
      const b = (await req.json()) as any
      const team = await createTeam({
        eventid: Number(b.eventid),
        teamname: b.teamname,
        players: typeof b.players === 'string' ? JSON.parse(b.players) : b.players ?? {},
        startinghole: b.startinghole ?? null,
      })
      return { jsonBody: team }
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
    const auth = requireAdmin(req)
    if (auth.error) return auth.error
    try {
      const b = (await req.json()) as any
      const patch: Record<string, any> = {}
      if ('teamname' in b) patch.teamname = b.teamname
      if ('players' in b) patch.players = typeof b.players === 'string' ? JSON.parse(b.players) : b.players
      if ('startinghole' in b) patch.startinghole = b.startinghole

      const team = await updateTeam(Number(req.params.id), patch)
      if (!team) return { status: 404, jsonBody: { message: 'Team not found' } }
      return { jsonBody: team }
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
    const auth = requireAdmin(req)
    if (auth.error) return auth.error
    try {
      await deleteTeam(Number(req.params.id))
      return { jsonBody: { success: true } }
    } catch (err: any) {
      return { status: 500, jsonBody: { message: err.message } }
    }
  },
})
