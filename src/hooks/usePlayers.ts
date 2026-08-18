import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import type { NewPlayer, PlayerRow } from '@/types'
import { toast } from 'sonner'

export function usePlayers() {
  const [players, setPlayers] = useState<PlayerRow[] | null>(null)
  const [loading, setLoading] = useState(true)

  async function fetchAll() {
    setLoading(true)
    try {
      const data = await api.get<PlayerRow[]>('/players')
      setPlayers(data)
    } catch {
      setPlayers(null)
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchAll()
  }, [])

  // Creating a player now always attaches them to a zone in the same action
  // (the API creates the membership row server-side).
  async function create(player: NewPlayer, zoneid: number) {
    const data = await api.post<PlayerRow>('/players', { ...player, zoneid })
    setPlayers((prev) => (prev ? [...prev, data] : [data]))
    toast.success('Player created')
    return data
  }

  async function update(id: number, patch: Partial<PlayerRow>) {
    const data = await api.put<PlayerRow>(`/players/${id}`, patch)
    setPlayers((prev) => prev?.map((p) => (p.playerid === id ? data : p)) ?? null)
    toast.success('Player updated')
    return data
  }

  // Removes the player from the given zone; only fully deletes their global
  // record if that was their last zone membership anywhere.
  async function remove(id: number, zoneid: number) {
    try {
      await api.del(`/players/${id}?zoneid=${zoneid}`)
      setPlayers((prev) => prev?.filter((p) => p.playerid !== id) ?? null)
      toast.success('Player removed')
    } catch (err: any) {
      console.error('Delete error:', err)
      toast.error(err.message || `Failed to remove player: ${err.message}`)
      throw err
    }
  }

  return { players, loading, refresh: fetchAll, create, update, remove }
}
