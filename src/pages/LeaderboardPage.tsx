import { useEffect, useMemo, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
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

export default function LeaderboardPage() {
  const [search] = useSearchParams()
  const location = useLocation() as any
  const eventId = Number(search.get('eventId') || location.state?.eventId || 0)
  const [event, setEvent] = useState<EventRow | null>(null)
  const [teams, setTeams] = useState<TeamRow[]>([])
  const [scores, setScores] = useState<ScoreRow[]>([])
  const [players, setPlayers] = useState<Record<number, PlayerRow>>({})
  const [mode, setMode] = useState<'actual' | 'net'>((search.get('mode') as 'actual' | 'net') || 'actual')

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
    const [{ data: ev }, { data: tm }, { data: sc }] = await Promise.all([
      supabase.from('events').select('*').eq('eventid', eventId).single(),
      supabase.from('teams').select('*').eq('eventid', eventId),
      supabase.from('scores').select('*').eq('eventid', eventId),
    ])
    setEvent(ev ? normalizeEvent(ev) : null)
    const tms = (tm ?? []) as TeamRow[]
    setTeams(tms)
    setScores((sc ?? []) as ScoreRow[])
    const ids = Array.from(new Set(tms.flatMap((t) => Object.values(t.players || {}).filter(Boolean) as number[])))
    if (ids.length) {
      const { data: pl } = await supabase.from('players').select('playerid,firstname,lastname,handicap').in('playerid', ids)
      const map: Record<number, PlayerRow> = {}
      for (const p of (pl ?? []) as PlayerRow[]) map[p.playerid] = p
      setPlayers(map)
    } else {
      setPlayers({})
    }
  }

  useEffect(() => {
    fetchData()
    const id = setInterval(fetchData, 30000)
    return () => clearInterval(id)
  }, [eventId])

  const rows = useMemo(() => {
    if (!event) return []
    const par = event.parperhole
    const holes = event.numberofholes ?? par.length ?? 0


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

    return teams.map((team) => {
      // team-level strokes per hole (only count recorded holes)
      const byHole: Record<number, number> = {}
      for (let hole = 1; hole <= holes; hole++) {
        const s = scores.find((s) => s.teamid === team.teamid && s.holenumber === hole && s.strokes != null)
        if (s && s.strokes != null) byHole[hole] = s.strokes
      }
      const frontIdx = [...Array(Math.min(9, holes)).keys()].map((i) => i + 1)
      const backIdx = holes === 18 ? [...Array(9).keys()].map((i) => i + 10) : []
      const holesPlayed = new Set(Object.keys(byHole).map((k) => Number(k)))
      const sumPlayedStrokes = (idx: number[]) => idx.reduce((a, h) => a + (holesPlayed.has(h) ? (byHole[h] ?? 0) : 0), 0)
      const sumPlayedPar = (idx: number[]) => idx.reduce((a, h) => a + (holesPlayed.has(h) ? (par[h - 1] ?? 4) : 0), 0)
      const frontStrokes = sumPlayedStrokes(frontIdx)
      const backStrokes = sumPlayedStrokes(backIdx)
      const totalStrokes = frontStrokes + backStrokes
      const frontPar = sumPlayedPar(frontIdx)
      const backPar = sumPlayedPar(backIdx)
      const totalPar = frontPar + backPar
      const scoreToPar = totalPar > 0 ? totalStrokes - totalPar : 0
      const teamHcp = teamHandicapFor(team)
      const netToPar = +(scoreToPar - teamHcp).toFixed(1)
      const last3Idx = par.length >= 3 ? [par.length - 2, par.length - 1, par.length].map((h) => h) : []
      const last3Strokes = last3Idx.reduce((a, h) => a + (byHole[h] ?? 0), 0)
      const holesCompleted = holesPlayed.size
      return { team, frontStrokes, backStrokes, totalStrokes, frontPar, backPar, totalPar, scoreToPar, teamHcp, netToPar, last3Strokes, holesCompleted }
    }).sort((a, b) => {
      const as = mode === 'net' ? a.netToPar : a.scoreToPar
      const bs = mode === 'net' ? b.netToPar : b.scoreToPar
      if (as !== bs) return as - bs
      // secondary and tertiary tiebreakers
      const back = a.backStrokes - b.backStrokes
      if (back) return back
      const last3 = a.last3Strokes - b.last3Strokes
      if (last3) return last3
      // final stable fallback (prevents flicker)
      return a.team.teamname.localeCompare(b.team.teamname)
    })
  }, [teams, scores, event, players, mode])

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
              <th className="p-2">Team</th>
              <th className="p-2">Players</th>
              <th className="p-2">Score</th>
              <th className="p-2">HCP</th>
              <th className="p-2">Holes</th>
              <th className="p-2">Strokes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const shown = mode === 'net' ? r.netToPar : r.scoreToPar
              return (
                <tr key={r.team.teamid} className="border-t">
                  <td className="p-2">{i + 1}</td>
                  <td className="p-2">{r.team.teamname}</td>
                  <td className="p-2">{teamMembersInitials(r.team)}</td>
                  <td className={`p-2 font-semibold ${colorForScore(shown)}`}>{shown > 0 ? `+${shown}` : shown}</td>
                  <td className="p-2">{r.teamHcp?.toFixed?.(1) ?? r.teamHcp}</td>
                  <td className="p-2">{r.holesCompleted}/{event?.numberofholes}</td>
                  <td className="p-2">{r.totalStrokes}</td>
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
            <div key={r.team.teamid} className="border rounded p-3">
              <div className="flex justify-between">
                <div className="font-medium">#{i + 1} {r.team.teamname}</div>
                <div className={`font-semibold ${colorForScore(shown)}`}>{shown > 0 ? `+${shown}` : shown}</div>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Players: {teamMembersInitials(r.team)}
              </div>
              <div className="text-xs text-muted-foreground flex gap-4 mt-1">
                <div>HCP {r.teamHcp?.toFixed?.(1) ?? r.teamHcp}</div>
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

