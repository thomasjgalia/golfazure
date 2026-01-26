import { useEffect, useState } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import { useEvent } from '@/hooks/useEvents'
import { useTeams } from '@/hooks/useTeams'
import { useScores } from '@/hooks/useScores'
import { useAuth } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { colorForScore } from '@/utils/format'
import { toast } from 'sonner'

function haptic(ms = 20) {
  try { navigator.vibrate?.(ms) } catch {}
}

export default function ScoringPage() {
  const params = useParams()
  const eventId = Number(params.id)
  const { event } = useEvent(eventId)
  const { teams } = useTeams(eventId)
  const { claimedPlayer, isAdmin } = useAuth()
  const [search, setSearch] = useSearchParams()
  const teamId = Number(search.get('teamId') || 0) || undefined
  const team = teams?.find((t) => t.teamid === teamId)

  const { scores, upsertScore, clearScore, refresh } = useScores(eventId, teamId)

  // Check if claimed player can edit this team's scores
  const canEditScores = isAdmin || (team && claimedPlayer && (
    team.players.player1 === claimedPlayer.playerid ||
    team.players.player2 === claimedPlayer.playerid ||
    team.players.player3 === claimedPlayer.playerid ||
    team.players.player4 === claimedPlayer.playerid
  ))

  const par = event?.parperhole ?? []
  const holes = event?.numberofholes ?? par.length ?? 0
  const holeNumbers = Array.from({ length: holes }, (_, i) => i + 1)

  const [currentHole, setCurrentHole] = useState<number>(1)

  // restore last team and hole
  useEffect(() => {
    if (!teamId && eventId) {
      try {
        const t = localStorage.getItem(`scoring:lastTeam:${eventId}`)
        if (t) setSearch({ teamId: t })
      } catch {}
    }
  }, [eventId])

  useEffect(() => {
    if (!teamId || !eventId) return
    try {
      const h = localStorage.getItem(`scoring:lastHole:${eventId}:${teamId}`)
      if (h) setCurrentHole(Math.max(1, Math.min(holes || 1, Number(h) || 1)))
    } catch {}
  }, [teamId, eventId, holes])

  useEffect(() => {
    if (!teamId || !eventId) return
    try { localStorage.setItem(`scoring:lastHole:${eventId}:${teamId}`, String(currentHole)) } catch {}
  }, [currentHole, teamId, eventId])
  const [strokes, setStrokes] = useState<number | null>(null)

  useEffect(() => {
    // load existing score for team/hole
    if (!scores || !team) return
    const s = scores.find((s) => s.holenumber === currentHole && s.teamid === team.teamid)
    setStrokes(s?.strokes ?? null)
  }, [currentHole, scores, team])

  async function save() {
    if (!event || !team) return
    if (event.islocked) return toast.error('Event is locked')
    if (!canEditScores) return toast.error('You can only edit scores for your own team')
    const parVal = par[currentHole - 1] ?? 4
    await upsertScore({ eventid: event.eventid, teamid: team.teamid, playerid: null, holenumber: currentHole, strokes: strokes ?? parVal })
    await refresh()
  }

  async function clear() {
    if (!event || !team) return
    if (!canEditScores) return toast.error('You can only edit scores for your own team')
    await clearScore(event.eventid, team.teamid, currentHole, 'team')
    await refresh()
  }

  async function handleQuickSave(newValue: number) {
    setStrokes(newValue)
    haptic()
    if (!event || !team) return
    if (event.islocked) {
      toast.error('Event is locked')
      return
    }
    if (!canEditScores) {
      toast.error('You can only edit scores for your own team')
      return
    }
    try {
      await upsertScore({ eventid: event.eventid, teamid: team.teamid, playerid: null, holenumber: currentHole, strokes: newValue })
      await refresh()
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save score')
    }
  }

  async function handleSelectHole(nextHole: number) {
    if (!team || !event) {
      setCurrentHole(nextHole)
      return
    }
    try {
      if (!event.islocked) {
        const existing = scores?.find((s) => s.teamid === team.teamid && s.holenumber === currentHole)?.strokes ?? null
        if (strokes != null && strokes !== existing) {
          const parVal = par[currentHole - 1] ?? 4
          await upsertScore({ eventid: event.eventid, teamid: team.teamid, playerid: null, holenumber: currentHole, strokes: strokes ?? parVal })
          haptic()
          await refresh()
        }
      }
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save current hole')
    } finally {
      setCurrentHole(nextHole)
    }
  }

  // Totals for display (only count holes that have a recorded score)
  const teamScores = (scores ?? []).filter((s) => team && s.teamid === team.teamid)
  const byHole: Record<number, number> = {}
  for (const s of teamScores) if (s.strokes != null) byHole[s.holenumber] = s.strokes
  const frontIdx = Array.from({ length: Math.min(9, holes) }, (_, i) => i + 1)
  const backIdx = holes === 18 ? Array.from({ length: 9 }, (_, i) => i + 10) : []
  const holesPlayed = new Set(Object.keys(byHole).map((k) => Number(k)))
  const sumPlayedStrokes = (idx: number[]) => idx.reduce((a, h) => a + (holesPlayed.has(h) ? (byHole[h] ?? 0) : 0), 0)
  const sumPlayedPar = (idx: number[]) => idx.reduce((a, h) => a + (holesPlayed.has(h) ? (par[h - 1] ?? 4) : 0), 0)
  const frontStrokes = sumPlayedStrokes(frontIdx)
  const backStrokes = sumPlayedStrokes(backIdx)
  const totalStrokes = frontStrokes + backStrokes
  const frontPar = sumPlayedPar(frontIdx)
  const backPar = sumPlayedPar(backIdx)
  const totalPar = frontPar + backPar
  const frontToPar = frontPar > 0 ? frontStrokes - frontPar : 0
  const backToPar = backPar > 0 ? backStrokes - backPar : 0
  const totalToPar = totalPar > 0 ? totalStrokes - totalPar : 0

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Scoring</h1>
        {event && (
          <Button asChild variant="outline">
            <Link to={`/leaderboard?eventId=${event.eventid}`}>Leaderboard</Link>
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <label className="text-sm">Team:</label>
        <select
          className="border rounded px-2 py-1"
          value={teamId ?? ''}
          onChange={(e) => { setSearch({ teamId: e.target.value }); try { localStorage.setItem(`scoring:lastTeam:${eventId}`, String(e.target.value)) } catch {} }}
        >
          <option value="">Select team</option>
          {teams?.map((t) => (
            <option key={t.teamid} value={t.teamid}>{t.teamname}</option>
          ))}
        </select>
      </div>

      {team && (
        <>
          <div className="border sticky top-20 z-20 bg-white rounded p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-lg font-medium">Hole {currentHole} • Par {par[currentHole - 1] ?? 4}</div>
              <div className="text-sm">
                <span>Total: {totalStrokes}/{totalPar} ({totalToPar > 0 ? `+${totalToPar}` : totalToPar})</span>
              </div>
            </div>
            {!canEditScores && (
              <div className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded p-2">
                {isAdmin ? 'Select a team to edit scores' : 'You can only edit scores for teams you are on'}
              </div>
            )}
            <div className="flex flex-wrap gap-1">
              <Button size="sm" className="px-2" variant={strokes === ((par[currentHole - 1] ?? 4) - 2) ? 'default' : 'secondary'} onClick={() => handleQuickSave((par[currentHole - 1] ?? 4) - 2)} disabled={!canEditScores}>-2</Button>
              <Button size="sm" className="px-2" variant={strokes === ((par[currentHole - 1] ?? 4) - 1) ? 'default' : 'secondary'} onClick={() => handleQuickSave((par[currentHole - 1] ?? 4) - 1)} disabled={!canEditScores}>-1</Button>
              <Button size="sm" className="px-2" variant={strokes === (par[currentHole - 1] ?? 4) ? 'default' : 'secondary'} onClick={() => handleQuickSave((par[currentHole - 1] ?? 4))} disabled={!canEditScores}>Par</Button>
              <Button size="sm" className="px-2" variant={strokes === ((par[currentHole - 1] ?? 4) + 1) ? 'default' : 'secondary'} onClick={() => handleQuickSave((par[currentHole - 1] ?? 4) + 1)} disabled={!canEditScores}>+1</Button>
              <Button size="sm" className="px-2" variant={strokes === ((par[currentHole - 1] ?? 4) + 2) ? 'default' : 'secondary'} onClick={() => handleQuickSave((par[currentHole - 1] ?? 4) + 2)} disabled={!canEditScores}>+2</Button>
            </div>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="outline" onClick={() => handleQuickSave((strokes ?? (par[currentHole - 1] ?? 4)) - 1)} disabled={!canEditScores}>-</Button>
              <Input
                type="number"
                className="w-16 h-8 text-center"
                value={strokes ?? ''}
                onChange={(e) => setStrokes(e.target.value ? Number(e.target.value) : null)}
                onBlur={() => { if (strokes != null) handleQuickSave(strokes) }}
                onKeyDown={(e) => { if (e.key === 'Enter' && strokes != null) handleQuickSave(strokes) }}
                disabled={!canEditScores}
              />
              <Button size="sm" variant="outline" onClick={() => handleQuickSave((strokes ?? (par[currentHole - 1] ?? 4)) + 1)} disabled={!canEditScores}>+</Button>
            </div>

            <div className="fixed bottom-0 left-0 right-0 border-t bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/75">
              <div className="container py-2 grid grid-cols-4 gap-2">
                <Button variant="ghost" disabled={holes === 0} onClick={() => handleSelectHole(Math.max(1, currentHole - 1))}>Prev</Button>
                <Button variant="outline" onClick={() => { clear(); haptic() }} disabled={!!event?.islocked || !canEditScores}>Clear</Button>
                <Button onClick={() => { save(); haptic() }} disabled={!!event?.islocked || !canEditScores}>Save</Button>
                <Button variant="ghost" disabled={holes === 0} onClick={() => handleSelectHole(Math.min(holes || 1, currentHole + 1))}>Next</Button>
              </div>
            </div>
          </div>

          <div className="space-y-3">
          <div>
            <div className="flex items-baseline justify-between mb-1">
              <div className="text-sm font-medium">Front 9</div>
              <div className="text-xs text-muted-foreground">Front: {frontStrokes}/{frontPar} ({frontToPar > 0 ? `+${frontToPar}` : frontToPar})</div>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-9 gap-2">
              {frontIdx.map((h) => {
                const s = scores?.find((s) => s.holenumber === h && s.teamid === team.teamid)
                const parVal = par[h - 1] ?? 4
                const strokesVal = s?.strokes ?? null
                const toPar = strokesVal != null ? strokesVal - parVal : null
                const colorCls = toPar == null ? '' : toPar < 0 ? 'border-success bg-success/10' : toPar > 0 ? 'border-danger bg-danger/10' : 'border-info bg-info/10'
                return (
                  <button
                    key={h}
                    className={`relative border rounded p-2 text-sm ${colorCls} ${h === currentHole ? 'ring-2 ring-primary' : ''}`}
                    onClick={() => handleSelectHole(h)}
                    onContextMenu={(e) => { e.preventDefault(); if (s?.strokes != null && !event?.islocked) { clearScore(eventId, team.teamid, h, 'team'); toast.success(`Cleared hole ${h}`); haptic() } }}
                  >
                    <div className="font-medium">{h}</div>
                    <div className="text-[10px] text-muted-foreground">Par {parVal}</div>
                    {toPar != null && (
                      <div className={`text-xs font-semibold ${colorForScore(toPar)}`}>{toPar === 0 ? 'E' : toPar > 0 ? `+${toPar}` : toPar}</div>
                    )}
                    {strokesVal != null && (
                      <div className="absolute top-1 right-1 text-[10px] text-muted-foreground">{strokesVal} ({toPar === 0 ? 'E' : toPar! > 0 ? `+${toPar}` : toPar})</div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {backIdx.length > 0 && (
            <div>
                              <div className="flex items-baseline justify-between mb-1">
                  <div className="text-sm font-medium">Back 9</div>
                  <div className="text-xs text-muted-foreground">Back: {backStrokes}/{backPar} ({backToPar > 0 ? `+${backToPar}` : backToPar})</div>
                </div>
              <div className="grid grid-cols-3 sm:grid-cols-9 gap-2">
                                {backIdx.map((h) => {
                const s = scores?.find((s) => s.holenumber === h && s.teamid === team.teamid)
                const parVal = par[h - 1] ?? 4
                const strokesVal = s?.strokes ?? null
                const toPar = strokesVal != null ? strokesVal - parVal : null
                const colorCls = toPar == null ? '' : toPar < 0 ? 'border-success bg-success/10' : toPar > 0 ? 'border-danger bg-danger/10' : 'border-info bg-info/10'
                return (
                  <button
                    key={h}
                    className={`relative border rounded p-2 text-sm ${colorCls} ${h === currentHole ? 'ring-2 ring-primary' : ''}`}
                    onClick={() => handleSelectHole(h)}
                    onContextMenu={(e) => { e.preventDefault(); if (s?.strokes != null && !event?.islocked) { clearScore(eventId, team.teamid, h, 'team'); toast.success(`Cleared hole ${h}`); haptic() } }}
                  >
                    <div className="font-medium">{h}</div>
                    <div className="text-[10px] text-muted-foreground">Par {parVal}</div>
                    {toPar != null && (
                      <div className={`text-xs font-semibold ${colorForScore(toPar)}`}>{toPar === 0 ? 'E' : toPar > 0 ? `+${toPar}` : toPar}</div>
                    )}
                    {strokesVal != null && (
                      <div className="absolute top-1 right-1 text-[10px] text-muted-foreground">{strokesVal} ({toPar === 0 ? 'E' : toPar! > 0 ? `+${toPar}` : toPar})</div>
                    )}
                  </button>
                )
              })}

              </div>
            </div>
          )}
        </div>
        </>
      )}


    </div>
  )
}
