import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { NewPlayer, PlayerRow } from '@/types'
import { toast } from 'sonner'

export function usePlayers() {
  const [players, setPlayers] = useState<PlayerRow[] | null>(null)
  const [loading, setLoading] = useState(true)

  async function fetchAll() {
    setLoading(true)
    const { data } = await supabase.from('players').select('*').order('lastname', { ascending: true })
    setPlayers(data as PlayerRow[])
    setLoading(false)
  }

  useEffect(() => {
    fetchAll()
  }, [])

  async function create(player: NewPlayer) {
    const { data, error } = await supabase.from('players').insert(player).select('*').single()
    if (error) throw error
    setPlayers((prev) => (prev ? [...prev, data as PlayerRow] : [data as PlayerRow]))
    toast.success('Player created')
    return data as PlayerRow
  }

  async function update(id: number, patch: Partial<PlayerRow>) {
    const { data, error } = await supabase.from('players').update(patch).eq('playerid', id).select('*').single()
    if (error) throw error
    setPlayers((prev) => prev?.map((p) => (p.playerid === id ? (data as PlayerRow) : p)) ?? null)
    toast.success('Player updated')
    return data as PlayerRow
  }

  async function remove(id: number) {
    const { error } = await supabase.from('players').delete().eq('playerid', id)
    if (error) {
      console.error('Delete error:', error)

      // Check if it's a foreign key constraint error
      if (error.code === '23503' || error.message.includes('foreign key constraint')) {
        toast.error('Cannot delete player - they are part of existing teams or events. Remove them from teams first.')
      } else {
        toast.error(`Failed to delete player: ${error.message}`)
      }
      throw error
    }
    setPlayers((prev) => prev?.filter((p) => p.playerid !== id) ?? null)
    toast.success('Player deleted')
  }

  return { players, loading, refresh: fetchAll, create, update, remove }
}
