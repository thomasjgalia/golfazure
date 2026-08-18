import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { PlayerRow, ZoneMembershipRow } from '@/types'
import { loadSession, saveSession, clearSession, onSessionCleared, loadCurrentZoneId, saveCurrentZoneId } from './session'
import { api } from './api'

interface AuthContextType {
  claimedPlayer: PlayerRow | null
  zones: ZoneMembershipRow[]
  currentZoneId: number | null
  setCurrentZone: (zoneid: number) => void
  claimProfile: (token: string, player: PlayerRow, zones: ZoneMembershipRow[]) => void
  releaseProfile: () => void
  // Re-fetches the caller's zone list from the server and, optionally,
  // switches straight to a specific one (e.g. right after creating it).
  refreshZones: (switchToZoneId?: number) => Promise<void>
  isProfileClaimed: boolean
  isZoneAdmin: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

// A player in exactly one zone never needs to think about zones at all - it's
// picked for them. A player in several keeps whatever they last chose
// (if it's still one of theirs), otherwise nothing is picked and the UI
// should prompt them to choose.
function pickInitialZoneId(zones: ZoneMembershipRow[]): number | null {
  if (zones.length === 1) return zones[0]!.zoneid
  const persisted = loadCurrentZoneId()
  if (persisted != null && zones.some((z) => z.zoneid === persisted)) return persisted
  return null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [claimedPlayer, setClaimedPlayer] = useState<PlayerRow | null>(null)
  const [zones, setZones] = useState<ZoneMembershipRow[]>([])
  const [currentZoneId, setCurrentZoneIdState] = useState<number | null>(null)

  // Load claimed profile from localStorage on mount, and stay in sync if api.ts
  // clears the session out from under us (e.g. an expired token got a 401).
  useEffect(() => {
    const session = loadSession()
    setClaimedPlayer(session?.player ?? null)
    const sessionZones = session?.zones ?? []
    setZones(sessionZones)
    setCurrentZoneIdState(pickInitialZoneId(sessionZones))
    return onSessionCleared(() => {
      setClaimedPlayer(null)
      setZones([])
      setCurrentZoneIdState(null)
    })
  }, [])

  const claimProfile = (token: string, player: PlayerRow, zoneMemberships: ZoneMembershipRow[]) => {
    saveSession({ token, player, zones: zoneMemberships })
    setClaimedPlayer(player)
    setZones(zoneMemberships)
    setCurrentZoneIdState(pickInitialZoneId(zoneMemberships))
  }

  const releaseProfile = () => {
    clearSession()
    setClaimedPlayer(null)
    setZones([])
    setCurrentZoneIdState(null)
  }

  const setCurrentZone = (zoneid: number) => {
    saveCurrentZoneId(zoneid)
    setCurrentZoneIdState(zoneid)
  }

  const refreshZones = async (switchToZoneId?: number) => {
    const fresh = await api.get<ZoneMembershipRow[]>('/zones/mine')
    setZones(fresh)
    const session = loadSession()
    if (session) saveSession({ ...session, zones: fresh })
    if (switchToZoneId != null) setCurrentZone(switchToZoneId)
  }

  const currentMembership = zones.find((z) => z.zoneid === currentZoneId)

  return (
    <AuthContext.Provider
      value={{
        claimedPlayer,
        zones,
        currentZoneId,
        setCurrentZone,
        claimProfile,
        releaseProfile,
        refreshZones,
        isProfileClaimed: !!claimedPlayer,
        isZoneAdmin: currentMembership?.role === 'admin',
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
