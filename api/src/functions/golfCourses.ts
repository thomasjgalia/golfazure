import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { requireAdmin } from '../lib/authz'
import { getCachedCourse, upsertCachedCourse, listCachedCourses } from '../lib/courseCacheTable'

// Thin server-side proxy for golfcourseapi.com - keeps the API key off the client
// and normalizes their (fairly quirky) response shape into what the event form needs.
const UPSTREAM_BASE = 'https://api.golfcourseapi.com'

type UpstreamHole = { par?: number; yardage?: number; handicap?: number }
type UpstreamTee = { tee_name?: string; number_of_holes?: number; holes?: UpstreamHole[] }
type UpstreamCourse = {
  id: string | number
  club_name?: string
  course_name?: string
  location?: { address?: string; city?: string; state?: string; country?: string }
  tees?: { male?: UpstreamTee[]; female?: UpstreamTee[] }
}

class UpstreamError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function upstreamGet(path: string): Promise<any> {
  const key = process.env.GOLF_COURSE_API_KEY
  if (!key) throw new UpstreamError('Course lookup is not configured yet - add GOLF_COURSE_API_KEY', 501)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)
  try {
    const res = await fetch(`${UPSTREAM_BASE}${path}`, {
      headers: { Authorization: `Key ${key}` },
      signal: controller.signal,
    })
    if (!res.ok) {
      if (res.status === 401) throw new UpstreamError('Course lookup API key was rejected', 500)
      if (res.status === 429) throw new UpstreamError('Course lookup daily limit reached, try again tomorrow', 502)
      const detail = (await res.text().catch(() => '')).slice(0, 200)
      throw new UpstreamError(`Course lookup failed (${res.status})${detail ? `: ${detail}` : ''}`, 502)
    }
    return await res.json()
  } catch (err: any) {
    if (err instanceof UpstreamError) throw err
    throw new UpstreamError(err.name === 'AbortError' ? 'Course lookup timed out' : 'Course lookup failed', 502)
  } finally {
    clearTimeout(timeout)
  }
}

function courseLocation(loc?: UpstreamCourse['location']): string {
  if (!loc) return ''
  return [loc.address, loc.city, loc.state, loc.country].filter(Boolean).join(', ')
}

function normalizeTees(tees: UpstreamCourse['tees']): { label: string; numberOfHoles: number; parPerHole: number[] }[] {
  const groups: [string, UpstreamTee[] | undefined][] = [
    ['Men', tees?.male],
    ['Women', tees?.female],
  ]
  const out: { label: string; numberOfHoles: number; parPerHole: number[] }[] = []
  for (const [genderLabel, list] of groups) {
    if (!Array.isArray(list)) continue
    for (const t of list) {
      const holes = Array.isArray(t.holes) ? t.holes : []
      const parPerHole = holes.map((h) => Number(h?.par) || 0)
      if (!t.tee_name || parPerHole.length === 0 || parPerHole.some((p) => !Number.isFinite(p) || p <= 0)) continue
      out.push({ label: `${t.tee_name} (${genderLabel})`, numberOfHoles: t.number_of_holes || parPerHole.length, parPerHole })
    }
  }
  return out
}

// GET /api/golf-courses/search?q=
app.http('golf-courses-search', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'golf-courses/search',
  handler: async (req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> => {
    const auth = requireAdmin(req)
    if (auth.error) return auth.error
    try {
      const q = (req.query.get('q') || '').trim()
      if (q.length < 3) return { jsonBody: { courses: [] } }
      const data = await upstreamGet(`/v1/search?search_query=${encodeURIComponent(q)}`)
      const courses = (data.courses ?? []).slice(0, 15).map((c: UpstreamCourse) => ({
        id: c.id,
        name: c.course_name || c.club_name || 'Unknown course',
        location: courseLocation(c.location),
      }))
      return { jsonBody: { courses } }
    } catch (err: any) {
      return { status: err.status || 500, jsonBody: { message: err.message } }
    }
  },
})

// GET /api/golf-courses/course/{id}
// Note: golfcourseapi.com course ids are opaque alphanumeric strings, not integers,
// so this can't be constrained to :int - it lives under its own /course/ segment
// specifically so it can never collide with the /golf-courses/search route above
// (an unconstrained {id} would otherwise also match the literal word "search").
app.http('golf-courses-get', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'golf-courses/course/{id}',
  handler: async (req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> => {
    const auth = requireAdmin(req)
    if (auth.error) return auth.error
    try {
      const id = String(req.params.id)
      const cached = await getCachedCourse(id)
      if (cached) return { jsonBody: { id: cached.id, name: cached.name, tees: cached.tees } }

      const raw = await upstreamGet(`/v1/courses/${encodeURIComponent(id)}`)
      // Unlike /v1/search (which returns courses at the top level), /v1/courses/{id}
      // wraps the course object under a "course" key.
      const data: UpstreamCourse = raw?.course ?? raw
      const course = {
        id,
        name: data.course_name || data.club_name || 'Unknown course',
        tees: normalizeTees(data.tees),
      }
      // Cache it regardless of whether it ends up applied to an event - the
      // whole point is that the next lookup of this course (by anyone, for
      // any event) never has to hit the rate-limited upstream API again.
      await upsertCachedCourse(course)
      return { jsonBody: course }
    } catch (err: any) {
      return { status: err.status || 500, jsonBody: { message: err.message } }
    }
  },
})

// GET /api/golf-courses/saved - previously looked-up courses, served
// entirely from cache so picking one never touches the upstream API.
app.http('golf-courses-saved', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'golf-courses/saved',
  handler: async (req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> => {
    const auth = requireAdmin(req)
    if (auth.error) return auth.error
    try {
      const courses = await listCachedCourses()
      return { jsonBody: { courses } }
    } catch (err: any) {
      return { status: 500, jsonBody: { message: err.message } }
    }
  },
})
