import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { PlayerRow } from '@/types'

interface AuthContextType {
  claimedPlayer: PlayerRow | null
  claimProfile: (player: PlayerRow) => void
  releaseProfile: () => void
  isProfileClaimed: boolean
  isAdmin: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const STORAGE_KEY = 'golf_claimed_profile'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [claimedPlayer, setClaimedPlayer] = useState<PlayerRow | null>(null)

  // Load claimed profile from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      try {
        const player = JSON.parse(stored) as PlayerRow
        setClaimedPlayer(player)
      } catch (error) {
        console.error('Failed to parse stored profile:', error)
        localStorage.removeItem(STORAGE_KEY)
      }
    }
  }, [])

  const claimProfile = (player: PlayerRow) => {
    setClaimedPlayer(player)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(player))
  }

  const releaseProfile = () => {
    setClaimedPlayer(null)
    localStorage.removeItem(STORAGE_KEY)
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
