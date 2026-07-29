import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { requireAdmin } from '../lib/authz'

// Thin server-side proxy for golfcourseapi.com - keeps the API key off the client
// and normalizes their (fairly quirky) response shape into what the event form needs.
const UPSTREAM_BASE = 'https://api.golfcourseapi.com'

type UpstreamHole = { par?: number; yardage?: number; handicap?: number }
type UpstreamTee = { tee_name?: string; number_of_holes?: number; holes?: UpstreamHole[] }
type UpstreamCourse = {
  id: number
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
      throw new UpstreamError(`Course lookup failed (${res.status})`, 502)
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
    for (const t of list ?? []) {
      const parPerHole = (t.holes ?? []).map((h) => Number(h.par) || 0)
      if (!t.tee_name || parPerHole.length === 0 || parPerHole.some((p) => !p)) continue
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

// GET /api/golf-courses/{id}
app.http('golf-courses-get', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'golf-courses/{id:int}',
  handler: async (req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> => {
    const auth = requireAdmin(req)
    if (auth.error) return auth.error
    try {
      const data: UpstreamCourse = await upstreamGet(`/v1/courses/${req.params.id}`)
      return {
        jsonBody: {
          id: data.id,
          name: data.course_name || data.club_name || 'Unknown course',
          tees: normalizeTees(data.tees),
        },
      }
    } catch (err: any) {
      return { status: err.status || 500, jsonBody: { message: err.message } }
    }
  },
})
