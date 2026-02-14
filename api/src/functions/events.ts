import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { getPool } from '../db'

// GET /api/events
app.http('events-list', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'events',
  handler: async (_req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const pool = await getPool()
      const result = await pool.request().query('SELECT * FROM events ORDER BY CAST(eventdate AS NVARCHAR(MAX)) DESC')
      return { jsonBody: result.recordset }
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
      const pool = await getPool()
      const result = await pool.request()
        .input('code', code)
        .query('SELECT * FROM events WHERE UPPER(CAST(sharecode AS NVARCHAR(MAX))) = @code')
      if (!result.recordset[0]) return { status: 404, jsonBody: { message: 'Event not found' } }
      return { jsonBody: result.recordset[0] }
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
      const pool = await getPool()
      const result = await pool.request()
        .input('id', Number(req.params.id))
        .query('SELECT * FROM events WHERE eventid = @id')
      if (!result.recordset[0]) return { status: 404, jsonBody: { message: 'Event not found' } }
      return { jsonBody: result.recordset[0] }
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
      const pool = await getPool()
      const b = (await req.json()) as any
      const parperhole = typeof b.parperhole === 'string' ? b.parperhole : JSON.stringify(b.parperhole)
      const result = await pool.request()
        .input('eventname', b.eventname)
        .input('eventdate', b.eventdate)
        .input('coursename', b.coursename)
        .input('tees', b.tees ?? null)
        .input('format', b.format ?? null)
        .input('numberofholes', b.numberofholes)
        .input('parperhole', parperhole)
        .input('islocked', b.islocked ?? false)
        .input('sharecode', b.sharecode)
        .input('status', b.status ?? 'Upcoming')
        .query(`INSERT INTO events (eventname, eventdate, coursename, tees, format, numberofholes, parperhole, islocked, sharecode, status)
                OUTPUT INSERTED.*
                VALUES (@eventname, @eventdate, @coursename, @tees, @format, @numberofholes, @parperhole, @islocked, @sharecode, @status)`)
      return { jsonBody: result.recordset[0] }
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
      const pool = await getPool()
      const b = (await req.json()) as any
      const sets: string[] = []
      const request = pool.request().input('id', Number(req.params.id))

      const fields: Record<string, any> = { ...b }
      delete fields.eventid
      delete fields.created_at
      delete fields.updated_at

      if (fields.parperhole !== undefined) {
        fields.parperhole = typeof fields.parperhole === 'string' ? fields.parperhole : JSON.stringify(fields.parperhole)
      }

      let i = 0
      for (const [key, val] of Object.entries(fields)) {
        const param = `p${i++}`
        sets.push(`${key} = @${param}`)
        request.input(param, val)
      }

      if (sets.length === 0) return { status: 400, jsonBody: { message: 'No fields to update' } }

      const result = await request.query(`UPDATE events SET ${sets.join(', ')} OUTPUT INSERTED.* WHERE eventid = @id`)
      if (!result.recordset[0]) return { status: 404, jsonBody: { message: 'Event not found' } }
      return { jsonBody: result.recordset[0] }
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
      const pool = await getPool()
      await pool.request()
        .input('id', Number(req.params.id))
        .query('DELETE FROM events WHERE eventid = @id')
      return { jsonBody: { success: true } }
    } catch (err: any) {
      return { status: 500, jsonBody: { message: err.message } }
    }
  },
})
