import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api } from '@/lib/api'
import { usePlayers } from '@/hooks/usePlayers'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { colorForScore, formatDate, statusBadgeClass } from '@/utils/format'

type HistoryEvent = {
  eventid: number
  eventname: string
  eventdate: string
  coursename: string
  format: string | null
  numberofholes: number
  status: string
  teamid: number | null
  teamname: string | null
  teammateIds: number[]
  holesCompleted: number
  totalStrokes: number | null
  totalPar: number | null
  scoreToPar: number | null
  totalPoints: number | null
}

type PlayerHistory = {
  playerid: number
  firstname: string
  lastname: string
  strokePlayAverageToPar: number | null
  stablefordAveragePoints: number | null
  events: HistoryEvent[]
}

export default function PlayerHistoryPage() {
  const params = useParams()
  const playerid = Number(params.id)
  const { players } = usePlayers()
  const [history, setHistory] = useState<PlayerHistory | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!playerid) return
    setLoading(true)
    api.get<PlayerHistory>(`/players/${playerid}/history`)
      .then(setHistory)
      .catch(() => setHistory(null))
      .finally(() => setLoading(false))
  }, [playerid])

  const playerMap: Record<number, { firstname: string; lastname: string }> = {}
  for (const p of players ?? []) playerMap[p.playerid] = p

  if (loading) return <div>Loading...</div>
  if (!history) return <div>Player not found</div>

  const teamEvents = history.events.filter((e) => e.teamid != null)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold truncate">{history.firstname} {history.lastname}</h1>
          <div className="text-sm text-muted-foreground">
            {history.events.length} event{history.events.length === 1 ? '' : 's'} played
          </div>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/players">Back to Players</Link>
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="border rounded p-3">
          <div className="text-xs text-muted-foreground">Stroke Play Avg</div>
          <div className="text-lg font-semibold">
            {history.strokePlayAverageToPar == null
              ? '-'
              : history.strokePlayAverageToPar === 0
                ? 'E'
                : history.strokePlayAverageToPar > 0
                  ? `+${history.strokePlayAverageToPar}`
                  : history.strokePlayAverageToPar}
          </div>
        </div>
        <div className="border rounded p-3">
          <div className="text-xs text-muted-foreground">Stableford Avg</div>
          <div className="text-lg font-semibold">{history.stablefordAveragePoints ?? '-'} pts</div>
        </div>
        <div className="border rounded p-3">
          <div className="text-xs text-muted-foreground">Teams Played On</div>
          <div className="text-lg font-semibold">{teamEvents.length}</div>
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Event History</h2>
        {history.events.length === 0 && (
          <div className="text-sm text-muted-foreground">No events recorded yet.</div>
        )}
        {history.events.map((e) => (
          <div key={e.eventid} className="border rounded p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <Link to={`/events/${e.eventid}`} className="font-medium truncate hover:underline">{e.eventname}</Link>
                <div className="text-xs text-muted-foreground">{formatDate(e.eventdate)} • {e.coursename} • {e.format ?? '-'}</div>
              </div>
              <Badge className={statusBadgeClass(e.status)}>{e.status}</Badge>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              {e.scoreToPar != null && e.totalStrokes != null && (
                <span className={`font-semibold ${colorForScore(e.scoreToPar)}`}>
                  {e.totalStrokes} strokes ({e.scoreToPar === 0 ? 'E' : e.scoreToPar > 0 ? `+${e.scoreToPar}` : e.scoreToPar}) · {e.holesCompleted}/{e.numberofholes} holes
                </span>
              )}
              {e.totalPoints != null && (
                <span className="font-semibold">{e.totalPoints} pts</span>
              )}
              {e.teamname && (
                <span className="text-muted-foreground">
                  Team: {e.teamname}
                  {e.teammateIds.length > 0 && (
                    <> with {e.teammateIds.map((id) => playerMap[id] ? `${playerMap[id].firstname} ${playerMap[id].lastname}` : `#${id}`).join(', ')}</>
                  )}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
