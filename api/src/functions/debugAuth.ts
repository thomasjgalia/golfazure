import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { signSession, verifySession } from '../lib/token'

// TEMPORARY - diagnosing a 401 that shouldn't be happening. Remove once resolved.
// Reveals no secret values, only booleans/derived info.
app.http('debug-auth-check', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'debug/auth-check',
  handler: async (req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> => {
    const hasSecret = !!process.env.AUTH_SECRET

    let selfRoundTrip: string = 'skipped (no secret)'
    if (hasSecret) {
      try {
        const t = signSession(0, true)
        selfRoundTrip = verifySession(t) ? 'ok' : 'signed but failed to verify itself'
      } catch (e: any) {
        selfRoundTrip = `threw: ${e.message}`
      }
    }

    const token = req.headers.get('x-session-token') || ''
    const hasAuthHeader = !!token
    let providedTokenResult = 'no X-Session-Token header received'
    if (hasAuthHeader) {
      const payload = verifySession(token)
      providedTokenResult = payload
        ? `valid - playerid=${payload.playerid}, isAdmin=${payload.isAdmin}, expires=${new Date(payload.exp * 1000).toISOString()}`
        : `invalid signature or expired (token length received: ${token.length})`
    }

    return {
      jsonBody: { hasSecret, selfRoundTrip, hasAuthHeader, providedTokenResult },
    }
  },
})
