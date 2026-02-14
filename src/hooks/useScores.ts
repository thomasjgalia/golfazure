import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import type { NewScore, ScoreRow } from '@/types'
import { toast } from 'sonner'

export function useScores(eventId?: number, teamId?: number) {
  const [scores, setScores] = useState<ScoreRow[] | null>(null)
  const [loading, setLoading] = useState(true)

  async function fetchAll() {
    if (!eventId) return
    setLoading(true)
    try {
      let path = `/scores?eventId=${eventId}`
      if (teamId) path += `&teamId=${teamId}`
      const data = await api.get<ScoreRow[]>(path)
      setScores(data)
    } catch {
      setScores(null)
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, teamId])

  async function upsertScore(score: NewScore) {
    const data = await api.post<ScoreRow>('/scores/upsert', {
      eventid: score.eventid,
      teamid: score.teamid ?? null,
      playerid: score.playerid ?? null,
      holenumber: score.holenumber,
      strokes: score.strokes,
    })
    toast.success('Score saved')
    await fetchAll()
    return data
  }

  async function clearScore(eventId: number, playerOrTeamId: number, hole: number, mode: 'player' | 'team' = 'player') {
    await api.post('/scores/delete', {
      eventid: eventId,
      playerOrTeamId,
      holenumber: hole,
      mode,
    })
    toast.success('Score cleared')
    await fetchAll()
  }

  return { scores, loading, refresh: fetchAll, upsertScore, clearScore }
}
