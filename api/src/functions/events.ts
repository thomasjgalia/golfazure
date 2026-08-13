import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { requireAdmin } from '../lib/authz'
import { listEvents, getEvent, getEventBySharecode, createEvent, updateEvent, deleteEvent } from '../lib/eventsTable'
import { deleteTeamsForEvent } from '../lib/teamsTable'
import { deleteScoresForEvent } from '../lib/scoresTable'

// Fields an event row may be created/updated with.
const WRITABLE_FIELDS = [
  'eventname', 'eventdate', 'coursename', 'tees', 'format',
  'numberofholes', 'parperhole', 'islocked', 'sharecode', 'status',
]

// GET /api/events
app.http('events-list', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'events',
  handler: async (_req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const events = await listEvents()
      return { jsonBody: events }
    } catch (err: any) {
      return { status: 500, jsonBody: { message: err.message } }
    }
  },
})

// GET /api/events/sharecode/{code}
app.http('events-by-sharecode', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'events/sharecode/{code}',
  handler: async (req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const code = (req.params.code || '').toUpperCase()
      const event = await getEventBySharecode(code)
      if (!event) return { status: 404, jsonBody: { message: 'Event not found' } }
      return { jsonBody: event }
    } catch (err: any) {
      return { status: 500, jsonBody: { message: err.message } }
    }
  },
})

// GET /api/events/{id}
app.http('events-get', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'events/{id:int}',
  handler: async (req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const event = await getEvent(Number(req.params.id))
      if (!event) return { status: 404, jsonBody: { message: 'Event not found' } }
      return { jsonBody: event }
    } catch (err: any) {
      return { status: 500, jsonBody: { message: err.message } }
    }
  },
})

// POST /api/events
app.http('events-create', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'events',
  handler: async (req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> => {
    const auth = requireAdmin(req)
    if (auth.error) return auth.error
    try {
      const b = (await req.json()) as any
      const event = await createEvent({
        eventname: b.eventname,
        eventdate: b.eventdate,
        coursename: b.coursename,
        tees: b.tees ?? null,
        format: b.format ?? null,
        numberofholes: b.numberofholes,
        parperhole: Array.isArray(b.parperhole) ? b.parperhole : JSON.parse(b.parperhole ?? '[]'),
        islocked: b.islocked ?? false,
        sharecode: b.sharecode,
        status: b.status ?? 'Upcoming',
      })
      return { jsonBody: event }
    } catch (err: any) {
      return { status: 500, jsonBody: { message: err.message } }
    }
  },
})

// PUT /api/events/{id}
app.http('events-update', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'events/{id:int}',
  handler: async (req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> => {
    const auth = requireAdmin(req)
    if (auth.error) return auth.error
    try {
      const b = (await req.json()) as any
      const patch: Record<string, any> = {}
      for (const key of WRITABLE_FIELDS) {
        if (!(key in b)) continue
        patch[key] = key === 'parperhole' && typeof b[key] === 'string' ? JSON.parse(b[key]) : b[key]
      }
      if (Object.keys(patch).length === 0) return { status: 400, jsonBody: { message: 'No fields to update' } }

      const event = await updateEvent(Number(req.params.id), patch)
      if (!event) return { status: 404, jsonBody: { message: 'Event not found' } }
      return { jsonBody: event }
    } catch (err: any) {
      return { status: 500, jsonBody: { message: err.message } }
    }
  },
})

// DELETE /api/events/{id}
app.http('events-delete', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'events/{id:int}',
  handler: async (req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> => {
    const auth = requireAdmin(req)
    if (auth.error) return auth.error
    try {
      const id = Number(req.params.id)
      // Teams and scores live in their own tables now - clean those up too
      // rather than leaving them behind as orphaned, unreachable data.
      await deleteTeamsForEvent(id)
      await deleteScoresForEvent(id)
      await deleteEvent(id)
      return { jsonBody: { success: true } }
    } catch (err: any) {
      return { status: 500, jsonBody: { message: err.message } }
    }
  },
})
