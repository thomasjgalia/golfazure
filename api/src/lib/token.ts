import { createHmac, timingSafeEqual } from 'crypto'

const SESSION_TTL_SECONDS = 90 * 24 * 60 * 60 // 90 days - claimed profile should stay claimed

export type SessionPayload = {
  playerid: number
  exp: number
}

function getSecret(): string {
  const secret = process.env.AUTH_SECRET
  if (!secret) throw new Error('AUTH_SECRET is not configured on the server')
  return secret
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url')
}

function sign(data: string): string {
  return createHmac('sha256', getSecret()).update(data).digest('base64url')
}

export function signSession(playerid: number): string {
  const payload: SessionPayload = { playerid, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS }
  const body = base64url(JSON.stringify(payload))
  return `${body}.${sign(body)}`
}

export function verifySession(token: string | null | undefined): SessionPayload | null {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [body, signature] = parts
  const expected = sign(body)

  const a = Buffer.from(signature)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload
    if (typeof payload.playerid !== 'number' || typeof payload.exp !== 'number') return null
    if (payload.exp < Math.floor(Date.now() / 1000)) return null
    return payload
  } catch {
    return null
  }
}
