import type { PlayerRow, ZoneMembershipRow } from '@/types'

export type ClaimedSession = { token: string; player: PlayerRow; zones: ZoneMembershipRow[] }

const STORAGE_KEY = 'golf_claimed_profile'
const CURRENT_ZONE_KEY = 'golf_current_zone'
const SESSION_CLEARED_EVENT = 'golf-session-cleared'

export function loadSession(): ClaimedSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.token || !parsed?.player) return null
    return parsed as ClaimedSession
  } catch {
    return null
  }
}

export function saveSession(session: ClaimedSession) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
}

export function clearSession() {
  localStorage.removeItem(STORAGE_KEY)
}

export function getToken(): string | null {
  return loadSession()?.token ?? null
}

// Which zone the app is currently "in" - persisted so a reload doesn't drop
// back to a picker for a player who already chose one.
export function loadCurrentZoneId(): number | null {
  const raw = localStorage.getItem(CURRENT_ZONE_KEY)
  return raw ? Number(raw) : null
}

export function saveCurrentZoneId(zoneid: number) {
  localStorage.setItem(CURRENT_ZONE_KEY, String(zoneid))
}

// Lets api.ts (which has no React context) tell AuthProvider that the session
// it just cleared (e.g. after a 401) should be reflected in app state right away.
export function notifySessionCleared() {
  window.dispatchEvent(new Event(SESSION_CLEARED_EVENT))
}

export function onSessionCleared(cb: () => void) {
  window.addEventListener(SESSION_CLEARED_EVENT, cb)
  return () => window.removeEventListener(SESSION_CLEARED_EVENT, cb)
}
