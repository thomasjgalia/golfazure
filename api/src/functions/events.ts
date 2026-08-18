import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { requireZoneMember, requireZoneAdmin } from '../lib/authz'
import { listEvents, getEvent, createEvent, updateEvent, deleteEvent } from '../lib/eventsTable'
import { deleteTeamsForEvent } from '../lib/teamsTable'
import { deleteScoresForEvent } from '../lib/scoresTable'

// Fields an event row may be created/updated with. zoneid is deliberately
// excluded - an event's zone is fixed at creation, not editable afterward.
const WRITABLE_FIELDS = [
  'eventname', 'eventdate', 'coursename', 'tees', 'format',
  'numberofholes', 'parperhole', 'islocked', 'status',
]

// GET /api/events?zoneId=N
app.http('events-list', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'events',
  handler: async (req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const zoneId = Number(req.query.get('zoneId'))
      if (!zoneId) return { status: 400, jsonBody: { message: 'zoneId required' } }
      const auth = await requireZoneMember(req, zoneId)
      if (auth.error) return auth.error
      const events = await listEvents()
      return { jsonBody: events.filter((e) => e.zoneid === zoneId) }
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
      const auth = await requireZoneMember(req, event.zoneid ?? -1)
      if (auth.error) return auth.error
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
    try {
      const b = (await req.json()) as any
      const zoneid = Number(b.zoneid)
      if (!zoneid) return { status: 400, jsonBody: { message: 'zoneid required' } }
      const auth = await requireZoneAdmin(req, zoneid)
      if (auth.error) return auth.error

      const event = await createEvent({
        eventname: b.eventname,
        eventdate: b.eventdate,
        coursename: b.coursename,
        tees: b.tees ?? null,
        format: b.format ?? null,
        numberofholes: b.numberofholes,
        parperhole: Array.isArray(b.parperhole) ? b.parperhole : JSON.parse(b.parperhole ?? '[]'),
        islocked: b.islocked ?? false,
        status: b.status ?? 'Upcoming',
        zoneid,
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
    try {
      const id = Number(req.params.id)
      const existing = await getEvent(id)
      if (!existing) return { status: 404, jsonBody: { message: 'Event not found' } }
      const auth = await requireZoneAdmin(req, existing.zoneid ?? -1)
      if (auth.error) return auth.error

      const b = (await req.json()) as any
      const patch: Record<string, any> = {}
      for (const key of WRITABLE_FIELDS) {
        if (!(key in b)) continue
        patch[key] = key === 'parperhole' && typeof b[key] === 'string' ? JSON.parse(b[key]) : b[key]
      }
      if (Object.keys(patch).length === 0) return { status: 400, jsonBody: { message: 'No fields to update' } }

      const event = await updateEvent(id, patch)
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
    try {
      const id = Number(req.params.id)
      const existing = await getEvent(id)
      if (!existing) return { status: 404, jsonBody: { message: 'Event not found' } }
      const auth = await requireZoneAdmin(req, existing.zoneid ?? -1)
      if (auth.error) return auth.error

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
