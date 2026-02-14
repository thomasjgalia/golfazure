import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import type { NewTeam, TeamRow } from '@/types'
import { toast } from 'sonner'

export function useTeams(eventId?: number) {
  const [teams, setTeams] = useState<TeamRow[] | null>(null)
  const [loading, setLoading] = useState(true)

  async function fetchAll() {
    if (!eventId) return
    setLoading(true)
    try {
      const data = await api.get<TeamRow[]>(`/teams?eventId=${eventId}`)
      setTeams(data)
    } catch {
      setTeams(null)
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId])

  async function create(team: NewTeam) {
    const data = await api.post<TeamRow>('/teams', team)
    setTeams((prev) => (prev ? [...prev, data] : [data]))
    toast.success('Team created')
    return data
  }

  async function update(id: number, patch: Partial<TeamRow>) {
    const data = await api.put<TeamRow>(`/teams/${id}`, patch)
    setTeams((prev) => prev?.map((t) => (t.teamid === id ? data : t)) ?? null)
    toast.success('Team updated')
    return data
  }

  async function remove(id: number) {
    await api.del(`/teams/${id}`)
    setTeams((prev) => prev?.filter((t) => t.teamid !== id) ?? null)
    toast.success('Team deleted')
  }

  return { teams, loading, refresh: fetchAll, create, update, remove }
}
