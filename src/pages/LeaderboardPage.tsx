import { useEffect, useMemo, useState } from 'react'
import { useLocation, useSearchParams, Link } from 'react-router-dom'
import { api } from '@/lib/api'
import type { EventRow, ScoreRow, TeamRow, PlayerRow } from '@/types'
import { initials } from '@/types'
import { colorForScore, formatDate } from '@/utils/format'
import { Button } from '@/components/ui/button'

function normalizeEvent(raw: any): EventRow {
  const holes = Number(raw?.numberofholes) || 18
  let par = raw?.parperhole
  if (typeof par === 'string') {
    try { par = JSON.parse(par) } catch { par = [] }
  }
  if (!Array.isArray(par)) par = []
  par = par.map((n: any) => Number(n) || 4)
  if (par.length !== holes) {
    par = Array.from({ length: holes }, (_, i) => par[i] ?? 4)
  }
  return { ...raw, parperhole: par } as EventRow
}

type Row = {
  key: string
  name: string
  subtext: string
  hcp: number
  netToPar: number
  scoreToPar: number
  totalStrokes: number
  backStrokes: number
  last3Strokes: number
  holesCompleted: number
  teamIdForScore: number
}

export default function LeaderboardPage() {
  const [search] = useSearchParams()
  const location = useLocation() as any
  const eventId = Number(search.get('eventId') || location.state?.eventId || 0)
  const [event, setEvent] = useState<EventRow | null>(null)
  const [teams, setTeams] = useState<TeamRow[]>([])
  const [scores, setScores] = useState<ScoreRow[]>([])
  const [players, setPlayers] = useState<Record<number, PlayerRow>>({})
  const [mode, setMode] = useState<'actual' | 'net'>((search.get('mode') as 'actual' | 'net') || 'actual')
  const isIndividual = event?.format === 'Stroke Play'

  // Build initials string in component scope so it can be used in render
  function teamMembersInitials(team: TeamRow) {
    const order = ['player1', 'player2', 'player3', 'player4'] as const
    const ids = order.map((k) => (team.players as any)?.[k]).filter(Boolean) as number[]
    const ins = ids
      .map((id) => (players[id] ? initials(players[id]) : ''))
      .filter(Boolean)
    return ins.join(', ')
  }

  async function fetchData() {
    if (!eventId) return
    try {
      const [ev, tms, sc] = await Promise.all([
        api.get<any>(`/events/${eventId}`),
        api.get<TeamRow[]>(`/teams?eventId=${eventId}`),
        api.get<ScoreRow[]>(`/scores?eventId=${eventId}`),
      ])
      setEvent(ev ? normalizeEvent(ev) : null)
      setTeams(tms ?? [])
      setScores(sc ?? [])
      const ids = Array.from(new Set((tms ?? []).flatMap((t) => Object.values(t.players || {}).filter(Boolean) as number[])))
      if (ids.length) {
        const pl = await api.post<PlayerRow[]>('/players/byIds', { ids })
        const map: Record<number, PlayerRow> = {}
        for (const p of pl ?? []) map[p.playerid] = p
        setPlayers(map)
      } else {
        setPlayers({})
      }
    } catch {
      // silently fail on fetch errors (e.g. network issues during polling)
    }
  }

  useEffect(() => {
    fetchData()
    const id = setInterval(fetchData, 30000)
    return () => clearInterval(id)
  }, [eventId])

  const rows = useMemo<Row[]>(() => {
    if (!event) return []
    const par = event.parperhole
    const holes = event.numberofholes ?? par.length ?? 0
    const frontIdx = [...Array(Math.min(9, holes)).keys()].map((i) => i + 1)
    const backIdx = holes === 18 ? [...Array(9).keys()].map((i) => i + 10) : []
    const last3Idx = par.length >= 3 ? [par.length - 2, par.length - 1, par.length] : []

    function computeTotals(byHole: Record<number, number>) {
      const holesPlayed = new Set(Object.keys(byHole).map(Number))
      const sumStrokes = (idx: number[]) => idx.reduce((a, h) => a + (holesPlayed.has(h) ? (byHole[h] ?? 0) : 0), 0)
      const sumPar = (idx: number[]) => idx.reduce((a, h) => a + (holesPlayed.has(h) ? (par[h - 1] ?? 4) : 0), 0)
      const totalStrokes = sumStrokes(frontIdx) + sumStrokes(backIdx)
      const totalPar = sumPar(frontIdx) + sumPar(backIdx)
      const scoreToPar = totalPar > 0 ? totalStrokes - totalPar : 0
      const backStrokes = sumStrokes(backIdx)
      const last3Strokes = last3Idx.reduce((a, h) => a + (byHole[h] ?? 0), 0)
      return { totalStrokes, scoreToPar, backStrokes, last3Strokes, holesCompleted: holesPlayed.size }
    }

    function teamHandicapFor(team: TeamRow) {
      const ids = (Object.values(team.players || {}) as Array<number | undefined>).filter(Boolean) as number[]
      const hcp = ids.map((id) => players[id]?.handicap ?? 0).sort((a, b) => a - b)
      const n = hcp.length
      if (n === 0) return 0
      if (n === 1) return +(0.75 * (hcp[0] ?? 0)).toFixed(1)
      if (n === 2) return +((0.35 * (hcp[0] ?? 0)) + (0.15 * (hcp[1] ?? 0))).toFixed(1)
      if (n === 3) return +((0.25 * (hcp[0] ?? 0)) + (0.15 * (hcp[1] ?? 0)) + (0.10 * (hcp[2] ?? 0))).toFixed(1)
      // 4 or more
      return +((0.20 * (hcp[0] ?? 0)) + (0.15 * (hcp[1] ?? 0)) + (0.10 * (hcp[2] ?? 0)) + (0.05 * (hcp[3] ?? 0))).toFixed(1)
    }

    let built: Row[]

    if (isIndividual) {
      // Stroke Play: teams are just playing groups - each player is ranked individually.
      built = teams.flatMap((team) => {
        const ids = (Object.values(team.players || {}) as Array<number | undefined>).filter(Boolean) as number[]
        return ids.map((id) => {
          const p = players[id]
          const byHole: Record<number, number> = {}
          for (const s of scores) if (s.playerid === id && s.strokes != null) byHole[s.holenumber] = s.strokes
          const totals = computeTotals(byHole)
          const hcp = p?.handicap ?? 0
          const netToPar = +(totals.scoreToPar - hcp).toFixed(1)
          return {
            key: `p-${id}`,
            name: p ? `${p.lastname}, ${p.firstname}` : `#${id}`,
            subtext: team.teamname,
            hcp,
            netToPar,
            teamIdForScore: team.teamid,
            ...totals,
          }
        })
      })
    } else {
      built = teams.map((team) => {
        const byHole: Record<number, number> = {}
        for (const s of scores) if (s.teamid === team.teamid && s.playerid == null && s.strokes != null) byHole[s.holenumber] = s.strokes
        const totals = computeTotals(byHole)
        const hcp = teamHandicapFor(team)
        const netToPar = +(totals.scoreToPar - hcp).toFixed(1)
        return {
          key: `t-${team.teamid}`,
          name: team.teamname,
          subtext: teamMembersInitials(team),
          hcp,
          netToPar,
          teamIdForScore: team.teamid,
          ...totals,
        }
      })
    }

    return built.sort((a, b) => {
      const as = mode === 'net' ? a.netToPar : a.scoreToPar
      const bs = mode === 'net' ? b.netToPar : b.scoreToPar
      if (as !== bs) return as - bs
      // secondary and tertiary tiebreakers
      const back = a.backStrokes - b.backStrokes
      if (back) return back
      const last3 = a.last3Strokes - b.last3Strokes
      if (last3) return last3
      // final stable fallback (prevents flicker)
      return a.name.localeCompare(b.name)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teams, scores, event, players, mode, isIndividual])

  const nameHeader = isIndividual ? 'Player' : 'Team'
  const subtextHeader = isIndividual ? 'Team' : 'Players'

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Leaderboard</h1>
        {event && <div className="text-sm text-muted-foreground">{event.eventname} • {formatDate(event.eventdate)} • {event.coursename}</div>}
      </div>

      <div className="hidden md:block">
        <div className="flex justify-end mb-2 gap-2">
          <Button variant={mode === 'actual' ? 'default' : 'outline'} onClick={() => (window.history.replaceState(null, '', `?eventId=${eventId}&mode=actual`), setMode('actual'))}>Actual</Button>
          <Button variant={mode === 'net' ? 'default' : 'outline'} onClick={() => (window.history.replaceState(null, '', `?eventId=${eventId}&mode=net`), setMode('net'))}>Net</Button>
        </div>
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="p-2">Rank</th>
              <th className="p-2">{nameHeader}</th>
              <th className="p-2">{subtextHeader}</th>
              <th className="p-2">Score</th>
              <th className="p-2">HCP</th>
              <th className="p-2">Holes</th>
              <th className="p-2">Strokes</th>
              <th className="p-2">Scoring</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const shown = mode === 'net' ? r.netToPar : r.scoreToPar
              return (
                <tr key={r.key} className="border-t">
                  <td className="p-2">{i + 1}</td>
                  <td className="p-2">{r.name}</td>
                  <td className="p-2">{r.subtext}</td>
                  <td className={`p-2 font-semibold ${colorForScore(shown)}`}>{shown > 0 ? `+${shown}` : shown}</td>
                  <td className="p-2">{r.hcp?.toFixed?.(1) ?? r.hcp}</td>
                  <td className="p-2">{r.holesCompleted}/{event?.numberofholes}</td>
                  <td className="p-2">{r.totalStrokes}</td>
                  <td className="p-2">
                    <Button size="sm" asChild>
                      <Link to={`/events/${eventId}/scoring?teamId=${r.teamIdForScore}`}>Score</Link>
                    </Button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="grid gap-2 md:hidden">
        <div className="flex justify-end mb-2 gap-2">
          <Button size="sm" variant={mode === 'actual' ? 'default' : 'outline'} onClick={() => (window.history.replaceState(null, '', `?eventId=${eventId}&mode=actual`), setMode('actual'))}>Actual</Button>
          <Button size="sm" variant={mode === 'net' ? 'default' : 'outline'} onClick={() => (window.history.replaceState(null, '', `?eventId=${eventId}&mode=net`), setMode('net'))}>Net</Button>
        </div>
        {rows.map((r, i) => {
          const shown = mode === 'net' ? r.netToPar : r.scoreToPar
          return (
            <div key={r.key} className="border rounded p-3">
              <div className="flex justify-between items-center gap-2">
                <div className="font-medium">#{i + 1} {r.name}</div>
                <div className="flex items-center gap-2">
                  <div className={`font-semibold ${colorForScore(shown)}`}>{shown > 0 ? `+${shown}` : shown}</div>
                  <Button size="sm" variant="default" asChild>
                    <Link to={`/events/${eventId}/scoring?teamId=${r.teamIdForScore}`}>Score</Link>
                  </Button>
                </div>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {subtextHeader}: {r.subtext}
              </div>
              <div className="text-xs text-muted-foreground flex gap-4 mt-1">
                <div>HCP {r.hcp?.toFixed?.(1) ?? r.hcp}</div>
                <div>Holes {r.holesCompleted}/{event?.numberofholes}</div>
                <div>Strokes {r.totalStrokes}</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
