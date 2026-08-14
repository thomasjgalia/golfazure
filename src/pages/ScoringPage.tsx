import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import { useEvent } from '@/hooks/useEvents'
import { useTeams } from '@/hooks/useTeams'
import { usePlayers } from '@/hooks/usePlayers'
import { useScores } from '@/hooks/useScores'
import { useAuth } from '@/lib/auth'
import { useBottomBar } from '@/lib/bottomBar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { colorForScore, stablefordPoints } from '@/utils/format'
import type { PlayerRow } from '@/types'
import { toast } from 'sonner'
import { Check } from 'lucide-react'

function haptic(ms = 20) {
  try { navigator.vibrate?.(ms) } catch {}
}

// One player's score entry for the current hole - used in Stroke Play events,
// where each player on the team is scored individually rather than as a team.
// Fully controlled: nothing here calls the server directly. Any interaction
// (check, +/-, or a keystroke) just registers a pending value with the
// parent, which turns the check green immediately and batches the actual
// save for every player on this hole into one request when the player
// navigates to the next hole - entering a foursome's scores no longer fires
// four separate saves (and four toasts) as you go.
function PlayerScoreRow({
  player, par, savedValue, pendingValue, canEdit, locked, onChange, onClear, showPoints,
}: {
  player: PlayerRow
  par: number
  savedValue: number | null
  pendingValue: number | undefined
  canEdit: boolean
  locked: boolean
  onChange: (strokes: number) => void
  onClear: () => void
  showPoints?: boolean
}) {
  const displayValue = pendingValue ?? savedValue ?? par
  const registered = pendingValue !== undefined
  const toPar = displayValue - par
  const disabled = locked || !canEdit

  function bump(delta: number) {
    haptic()
    onChange(displayValue + delta)
  }

  return (
    <div className="border rounded px-2 py-1.5 space-y-1">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium truncate">{player.firstname} {player.lastname}</div>
        <div className={`text-xs font-semibold ${colorForScore(toPar)}`}>
          {displayValue} ({toPar === 0 ? 'E' : toPar > 0 ? `+${toPar}` : toPar})
          {showPoints && ` · ${stablefordPoints(displayValue, par)} pts`}
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Button size="sm" variant="outline" className="h-7 w-7 px-0" disabled={disabled} onClick={() => bump(-1)}>-</Button>
        <Input
          type="number"
          className="w-12 h-7 text-center px-1"
          value={displayValue}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value ? Number(e.target.value) : par)}
        />
        <Button size="sm" variant="outline" className="h-7 w-7 px-0" disabled={disabled} onClick={() => bump(1)}>+</Button>
        <Button size="sm" variant={registered ? 'success' : 'default'} className="h-7 w-7 px-0" disabled={disabled} onClick={() => { haptic(); onChange(displayValue) }} title="Confirm this score">
          <Check className="h-3.5 w-3.5" />
        </Button>
        {savedValue != null && !disabled && (
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-danger ml-auto" onClick={onClear}>Clear</Button>
        )}
      </div>
    </div>
  )
}

export default function ScoringPage() {
  const params = useParams()
  const eventId = Number(params.id)
  const { event } = useEvent(eventId)
  const { teams } = useTeams(eventId)
  const { players } = usePlayers()
  const { claimedPlayer, isAdmin } = useAuth()
  const [search, setSearch] = useSearchParams()
  const teamId = Number(search.get('teamId') || 0) || undefined
  const team = teams?.find((t) => t.teamid === teamId)
  const isStableford = event?.format === 'Stableford'
  // Stableford is scored per-player like Stroke Play, just ranked by points instead of strokes.
  const isIndividual = event?.format === 'Stroke Play' || isStableford

  const { scores, upsertScore, clearScore, refresh } = useScores(eventId, teamId)

  // Check if claimed player can edit this team's scores
  const canEditScores = isAdmin || (team && claimedPlayer && (
    team.players.player1 === claimedPlayer.playerid ||
    team.players.player2 === claimedPlayer.playerid ||
    team.players.player3 === claimedPlayer.playerid ||
    team.players.player4 === claimedPlayer.playerid
  ))

  const teamPlayers: PlayerRow[] = team
    ? ([team.players.player1, team.players.player2, team.players.player3, team.players.player4]
        .filter(Boolean) as number[])
        .map((id) => players?.find((p) => p.playerid === id))
        .filter(Boolean) as PlayerRow[]
    : []

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
    const s = scores.find((s) => s.holenumber === currentHole && s.teamid === team.teamid && s.playerid == null)
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

  // Individual mode: registering a value (check/+/-/keystroke) only updates
  // local state - nothing hits the server until flushPendingScores runs, so
  // filling out a whole foursome doesn't fire a save per tap.
  const [pendingScores, setPendingScores] = useState<Record<number, number>>({})

  useEffect(() => {
    setPendingScores({})
  }, [currentHole, teamId])

  function registerPending(playerid: number, value: number) {
    setPendingScores((prev) => ({ ...prev, [playerid]: value }))
  }

  async function flushPendingScores() {
    const entries = Object.entries(pendingScores)
    if (entries.length === 0) return
    if (!event || !team) { setPendingScores({}); return }
    if (event.islocked) { toast.error('Event is locked'); setPendingScores({}); return }
    if (!canEditScores) { setPendingScores({}); return }
    try {
      await Promise.all(
        entries.map(([playeridStr, v]) =>
          upsertScore({ eventid: event.eventid, teamid: team.teamid, playerid: Number(playeridStr), holenumber: currentHole, strokes: v })
        )
      )
      setPendingScores({})
      await refresh()
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save scores')
    }
  }

  async function goToHoleIndividual(nextHole: number) {
    await flushPendingScores()
    setCurrentHole(nextHole)
  }

  async function clearPlayerScore(player: PlayerRow) {
    if (!event || !team) return
    if (!canEditScores) return toast.error('You can only edit scores for players on your team')
    setPendingScores((prev) => {
      const next = { ...prev }
      delete next[player.playerid]
      return next
    })
    try {
      await clearScore(event.eventid, player.playerid, currentHole, 'player')
      await refresh()
    } catch (e: any) {
      toast.error(e?.message || 'Failed to clear score')
    }
  }

  // Totals for display (only count holes that have a recorded score)
  const teamScores = (scores ?? []).filter((s) => team && s.teamid === team.teamid && s.playerid == null)
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

  const enteredCount = teamPlayers.filter((p) =>
    pendingScores[p.playerid] !== undefined ||
    (scores ?? []).some((s) => s.playerid === p.playerid && s.holenumber === currentHole && s.strokes != null)
  ).length

  const individualBottomBar = useMemo(() => {
    if (!team || !isIndividual) return null
    return (
      <div className="grid grid-cols-2 gap-2">
        <Button variant="ghost" disabled={holes === 0} onClick={() => goToHoleIndividual(Math.max(1, currentHole - 1))}>Prev</Button>
        <Button variant="ghost" disabled={holes === 0} onClick={() => goToHoleIndividual(Math.min(holes || 1, currentHole + 1))}>Next</Button>
      </div>
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team, isIndividual, holes, currentHole, pendingScores, event, canEditScores])

  const teamBottomBar = useMemo(() => {
    if (!team || isIndividual) return null
    return (
      <div className="grid grid-cols-4 gap-2">
        <Button variant="ghost" disabled={holes === 0} onClick={() => handleSelectHole(Math.max(1, currentHole - 1))}>Prev</Button>
        <Button variant="outline" onClick={() => { clear(); haptic() }} disabled={!!event?.islocked || !canEditScores}>Clear</Button>
        <Button onClick={() => { save(); haptic() }} disabled={!!event?.islocked || !canEditScores}>Save</Button>
        <Button variant="ghost" disabled={holes === 0} onClick={() => handleSelectHole(Math.min(holes || 1, currentHole + 1))}>Next</Button>
      </div>
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team, isIndividual, holes, currentHole, event, canEditScores, scores, strokes])

  useBottomBar(isIndividual ? individualBottomBar : teamBottomBar)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Scoring</h1>
        <div className="flex gap-2">
          {event && team && (
            <Button asChild variant="outline">
              <Link to={`/events/${event.eventid}/scorecard?teamId=${team.teamid}`}>Scorecard</Link>
            </Button>
          )}
          {event && (
            <Button asChild variant="outline">
              <Link to={`/leaderboard?eventId=${event.eventid}`}>Leaderboard</Link>
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <label className="text-sm">Team:</label>
        <select
          className="border rounded px-2 py-1"
          value={teamId ?? ''}
          onChange={async (e) => { await flushPendingScores(); setSearch({ teamId: e.target.value }); try { localStorage.setItem(`scoring:lastTeam:${eventId}`, String(e.target.value)) } catch {} }}
        >
          <option value="">Select team</option>
          {teams?.map((t) => (
            <option key={t.teamid} value={t.teamid}>{t.teamname}</option>
          ))}
        </select>
      </div>

      {team && isIndividual && (
        <>
          <div className="border sticky top-0 z-20 bg-white rounded p-2 space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2 px-1">
              <div className="text-lg font-medium">Hole {currentHole} • Par {par[currentHole - 1] ?? 4}</div>
              <div className="text-sm text-muted-foreground">{enteredCount}/{teamPlayers.length} entered</div>
            </div>
            {!canEditScores && (
              <div className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded p-2">
                {isAdmin ? 'Select a team to edit scores' : 'You can only edit scores for players on your team'}
              </div>
            )}
            <div className="space-y-1.5">
              {teamPlayers.map((p) => {
                const s = scores?.find((s) => s.playerid === p.playerid && s.holenumber === currentHole)
                return (
                  <PlayerScoreRow
                    key={p.playerid}
                    player={p}
                    par={par[currentHole - 1] ?? 4}
                    savedValue={s?.strokes ?? null}
                    pendingValue={pendingScores[p.playerid]}
                    canEdit={!!canEditScores}
                    locked={!!event?.islocked}
                    onChange={(v) => registerPending(p.playerid, v)}
                    onClear={() => clearPlayerScore(p)}
                    showPoints={isStableford}
                  />
                )
              })}
              {teamPlayers.length === 0 && (
                <div className="text-sm text-muted-foreground">This team has no players assigned yet.</div>
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <div className="text-sm font-medium">Scorecard</div>
              <Link to={`/events/${eventId}/scorecard?teamId=${team.teamid}`} className="text-xs text-primary">Open full view</Link>
            </div>
            <div className="overflow-x-auto border rounded">
              <table className="text-xs">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="p-1.5 text-left sticky left-0 bg-muted/50 whitespace-nowrap">Player</th>
                    {holeNumbers.map((h) => (
                      <th key={h} className="p-1.5 text-center w-8">{h}</th>
                    ))}
                    <th className="p-1.5 text-center font-semibold">Tot</th>
                  </tr>
                  <tr className="text-muted-foreground">
                    <th className="p-1.5 text-left sticky left-0 bg-white whitespace-nowrap">Par</th>
                    {holeNumbers.map((h) => (
                      <th key={h} className="p-1.5 text-center font-normal">{par[h - 1] ?? 4}</th>
                    ))}
                    <th className="p-1.5 text-center">{holeNumbers.reduce((a, h) => a + (par[h - 1] ?? 4), 0)}</th>
                  </tr>
                </thead>
                <tbody>
                  {teamPlayers.map((p) => {
                    const pByHole: Record<number, number> = {}
                    for (const s of scores ?? []) {
                      if (s.playerid === p.playerid && s.strokes != null) pByHole[s.holenumber] = s.strokes
                    }
                    const playedCount = Object.keys(pByHole).length
                    const total = holeNumbers.reduce((a, h) => a + (pByHole[h] ?? 0), 0)
                    return (
                      <tr key={p.playerid} className="border-t">
                        <td className="p-1.5 font-medium truncate sticky left-0 bg-white whitespace-nowrap">{p.firstname} {p.lastname[0]}.</td>
                        {holeNumbers.map((h) => {
                          const v = pByHole[h]
                          const parVal = par[h - 1] ?? 4
                          const toPar = v != null ? v - parVal : null
                          return (
                            <td
                              key={h}
                              className={`p-1.5 text-center cursor-pointer ${h === currentHole ? 'ring-2 ring-inset ring-primary' : ''} ${toPar == null ? '' : colorForScore(toPar)}`}
                              onClick={() => goToHoleIndividual(h)}
                            >
                              {v ?? '-'}
                            </td>
                          )
                        })}
                        <td className="p-1.5 text-center font-semibold">{playedCount > 0 ? total : '-'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {team && !isIndividual && (
        <>
          <div className="border sticky top-0 z-20 bg-white rounded p-3 space-y-2">
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
          </div>

          <div className="space-y-3">
          <div>
            <div className="flex items-baseline justify-between mb-1">
              <div className="text-sm font-medium">Front 9</div>
              <div className="text-xs text-muted-foreground">Front: {frontStrokes}/{frontPar} ({frontToPar > 0 ? `+${frontToPar}` : frontToPar})</div>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-9 gap-2">
              {frontIdx.map((h) => {
                const s = scores?.find((s) => s.holenumber === h && s.teamid === team.teamid && s.playerid == null)
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
                const s = scores?.find((s) => s.holenumber === h && s.teamid === team.teamid && s.playerid == null)
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
