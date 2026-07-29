import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { PlayerRow } from '@/types'
import { loadSession, saveSession, clearSession, onSessionCleared } from './session'

interface AuthContextType {
  claimedPlayer: PlayerRow | null
  claimProfile: (token: string, player: PlayerRow) => void
  releaseProfile: () => void
  isProfileClaimed: boolean
  isAdmin: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [claimedPlayer, setClaimedPlayer] = useState<PlayerRow | null>(null)

  // Load claimed profile from localStorage on mount, and stay in sync if api.ts
  // clears the session out from under us (e.g. an expired token got a 401).
  useEffect(() => {
    setClaimedPlayer(loadSession()?.player ?? null)
    return onSessionCleared(() => setClaimedPlayer(null))
  }, [])

  const claimProfile = (token: string, player: PlayerRow) => {
    saveSession({ token, player })
    setClaimedPlayer(player)
  }

  const releaseProfile = () => {
    clearSession()
    setClaimedPlayer(null)
  }

  return (
    <AuthContext.Provider
      value={{
        claimedPlayer,
        claimProfile,
        releaseProfile,
        isProfileClaimed: !!claimedPlayer,
        isAdmin: !!claimedPlayer?.is_admin,
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
