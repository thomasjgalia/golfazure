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

  async function create(player: NewPlayer) {
    const data = await api.post<PlayerRow>('/players', player)
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

  async function remove(id: number) {
    try {
      await api.del(`/players/${id}`)
      setPlayers((prev) => prev?.filter((p) => p.playerid !== id) ?? null)
      toast.success('Player deleted')
    } catch (err: any) {
      console.error('Delete error:', err)
      if (err.message?.includes('Cannot delete player')) {
        toast.error(err.message)
      } else {
        toast.error(`Failed to delete player: ${err.message}`)
      }
      throw err
    }
  }

  return { players, loading, refresh: fetchAll, create, update, remove }
}
