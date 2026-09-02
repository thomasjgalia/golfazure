import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import { useEvent } from '@/hooks/useEvents'
import { useTeams } from '@/hooks/useTeams'
import { usePlayers } from '@/hooks/usePlayers'
import { useScores } from '@/hooks/useScores'
import { useAuth } from '@/lib/auth'
import { useBottomBar } from '@/lib/bottomBar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { stablefordPoints } from '@/utils/format'
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
  roundHolesCompleted, roundToPar, roundPoints,
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
  roundHolesCompleted: number
  roundToPar: number
  roundPoints: number
}) {
  const displayValue = pendingValue ?? savedValue ?? par
  const registered = pendingValue !== undefined
  const toPar = displayValue - par
  const disabled = locked || !canEdit

  function bump(delta: number) {
    haptic()
    onChange(displayValue + delta)
  }

  // Bright-sunlight readability: a filled background pill reads at a glance
  // far better than colored text alone, and every control here is sized for
  // a thumb (or a golf glove), not a mouse cursor.
  const scoreBgCls = toPar < 0 ? 'bg-success/15 text-success' : toPar > 0 ? 'bg-danger/15 text-danger' : 'bg-info/15 text-info'

  return (
    <div className="border rounded-lg px-3 py-3 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xl font-bold truncate">{player.firstname} {player.lastname}</div>
        <div className={`rounded-lg px-3 py-1 text-2xl font-bold whitespace-nowrap ${scoreBgCls}`}>
          {displayValue}
          <span className="text-lg font-semibold"> ({toPar === 0 ? 'E' : toPar > 0 ? `+${toPar}` : toPar})</span>
          {showPoints && <span className="text-lg font-semibold"> · {stablefordPoints(displayValue, par)}p</span>}
        </div>
      </div>
      {roundHolesCompleted > 0 && (
        <div className="text-sm text-muted-foreground">
          Round: {showPoints
            ? `${roundPoints} pts`
            : `${roundToPar === 0 ? 'E' : roundToPar > 0 ? `+${roundToPar}` : roundToPar}`} thru {roundHolesCompleted} hole{roundHolesCompleted === 1 ? '' : 's'}
        </div>
      )}
      <div className="flex items-center gap-2">
        <Button variant="outline" className="h-16 w-16 shrink-0 text-3xl px-0" disabled={disabled} onClick={() => bump(-1)}>−</Button>
        <Input
          type="number"
          className="h-16 min-w-0 flex-1 text-center text-3xl font-bold px-1"
          value={displayValue}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value ? Number(e.target.value) : par)}
        />
        <Button variant="outline" className="h-16 w-16 shrink-0 text-3xl px-0" disabled={disabled} onClick={() => bump(1)}>+</Button>
        <Button variant={registered ? 'success' : 'default'} className="h-16 w-16 shrink-0 px-0" disabled={disabled} onClick={() => { haptic(); onChange(displayValue) }} title="Confirm this score">
          <Check className="h-8 w-8" />
        </Button>
      </div>
      {savedValue != null && !disabled && (
        <Button variant="ghost" className="w-full h-10 text-danger" onClick={onClear}>Clear</Button>
      )}
    </div>
  )
}

export default function ScoringPage() {
  const params = useParams()
  const eventId = Number(params.id)
  const { event } = useEvent(eventId)
  const { teams } = useTeams(eventId)
  const { players } = usePlayers()
  const { claimedPlayer, isZoneAdmin } = useAuth()
  const [search, setSearch] = useSearchParams()
  const teamId = Number(search.get('teamId') || 0) || undefined
  const team = teams?.find((t) => t.teamid === teamId)
  const isStableford = event?.format === 'Stableford'
  // Stableford is scored per-player like Stroke Play, just ranked by points instead of strokes.
  const isIndividual = event?.format === 'Stroke Play' || isStableford

  const { scores, upsertScore, clearScore, refresh } = useScores(eventId, teamId)

  // Check if claimed player can edit this team's scores
  const canEditScores = isZoneAdmin || (team && claimedPlayer && (
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

  // Default the team dropdown so a fresh arrival (e.g. tapping "Scoring" from
  // the Events list) doesn't land on an empty "Select team" state: prefer the
  // team the claimed player is actually on for this event, falling back to
  // whichever team was last viewed (useful for an admin scoring several
  // teams in turn).
  useEffect(() => {
    if (teamId || !eventId || !teams) return
    const myTeam = claimedPlayer && teams.find((t) =>
      t.players.player1 === claimedPlayer.playerid ||
      t.players.player2 === claimedPlayer.playerid ||
      t.players.player3 === claimedPlayer.playerid ||
      t.players.player4 === claimedPlayer.playerid
    )
    if (myTeam) {
      setSearch({ teamId: String(myTeam.teamid) })
      return
    }
    try {
      const t = localStorage.getItem(`scoring:lastTeam:${eventId}`)
      if (t) setSearch({ teamId: t })
    } catch {}
  }, [eventId, teams, claimedPlayer])

  // Whenever a team is (re)selected - arriving fresh from the Leaderboard,
  // Scorecard, or anywhere else - jump straight to the first hole that still
  // needs a score, rather than always hole 1 or wherever was last viewed.
  // Guarded by a ref so it only fires once per team selection, not on every
  // score update while the user is actively scoring.
  const autoNavTeamRef = useRef<number | undefined>(undefined)
  useEffect(() => {
    if (!teamId || !eventId || !scores || holes === 0) return
    if (autoNavTeamRef.current === teamId) return
    autoNavTeamRef.current = teamId
    let nextHole = holes
    for (const h of holeNumbers) {
      const complete = isIndividual
        ? teamPlayers.length > 0 && teamPlayers.every((p) =>
            scores.some((s) => s.playerid === p.playerid && s.holenumber === h && s.strokes != null)
          )
        : scores.some((s) => s.teamid === teamId && s.playerid == null && s.holenumber === h && s.strokes != null)
      if (!complete) { nextHole = h; break }
    }
    setCurrentHole(nextHole)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId, eventId, scores, holes, isIndividual, teamPlayers.length])

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

  // Individual mode's running total-to-par (or Stableford points) for one
  // player across the whole round so far. Includes the current hole's
  // pending (not-yet-saved) value so the total moves the instant a score is
  // registered, matching the check-goes-green-immediately feedback above.
  function playerRoundTotals(playerid: number) {
    const byHole: Record<number, number> = {}
    for (const s of scores ?? []) {
      if (s.playerid === playerid && s.strokes != null) byHole[s.holenumber] = s.strokes
    }
    const pending = pendingScores[playerid]
    if (pending !== undefined) byHole[currentHole] = pending
    let strokes = 0, parSum = 0, points = 0
    for (const [holeStr, v] of Object.entries(byHole)) {
      const parVal = par[Number(holeStr) - 1] ?? 4
      strokes += v
      parSum += parVal
      points += stablefordPoints(v, parVal)
    }
    const holesCompleted = Object.keys(byHole).length
    return { holesCompleted, toPar: strokes - parSum, points }
  }

  const individualBottomBar = useMemo(() => {
    if (!team || !isIndividual) return null
    return (
      <div className="grid grid-cols-2 gap-2">
        <Button variant="ghost" className="h-10 text-base" disabled={holes === 0} onClick={() => goToHoleIndividual(Math.max(1, currentHole - 1))}>Prev</Button>
        <Button variant="ghost" className="h-10 text-base" disabled={holes === 0} onClick={() => goToHoleIndividual(Math.min(holes || 1, currentHole + 1))}>Next</Button>
      </div>
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team, isIndividual, holes, currentHole, pendingScores, event, canEditScores])

  const teamBottomBar = useMemo(() => {
    if (!team || isIndividual) return null
    return (
      <div className="grid grid-cols-4 gap-2">
        <Button variant="ghost" className="h-10 text-sm" disabled={holes === 0} onClick={() => handleSelectHole(Math.max(1, currentHole - 1))}>Prev</Button>
        <Button variant="outline" className="h-10 text-sm" onClick={() => { clear(); haptic() }} disabled={!!event?.islocked || !canEditScores}>Clear</Button>
        <Button className="h-10 text-sm" onClick={() => { save(); haptic() }} disabled={!!event?.islocked || !canEditScores}>Save</Button>
        <Button variant="ghost" className="h-10 text-sm" disabled={holes === 0} onClick={() => handleSelectHole(Math.min(holes || 1, currentHole + 1))}>Next</Button>
      </div>
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team, isIndividual, holes, currentHole, event, canEditScores, scores, strokes])

  useBottomBar(isIndividual ? individualBottomBar : teamBottomBar)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Scoring</h1>
        <div className="flex flex-wrap gap-2">
          {event && team && (
            <Button asChild variant="outline" size="sm">
              <Link to={`/events/${event.eventid}/scorecard?teamId=${team.teamid}`}>Scorecard</Link>
            </Button>
          )}
          {event && (
            <Button asChild variant="outline" size="sm">
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
            <div className="text-center">
              <div className="text-4xl font-bold">Hole {currentHole}</div>
              <div className="text-sm text-muted-foreground">Par {par[currentHole - 1] ?? 4} · {enteredCount}/{teamPlayers.length} entered</div>
            </div>
            {!canEditScores && (
              <div className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded p-2">
                {isZoneAdmin ? 'Select a team to edit scores' : 'You can only edit scores for players on your team'}
              </div>
            )}
            <div className="space-y-1.5">
              {teamPlayers.map((p) => {
                const s = scores?.find((s) => s.playerid === p.playerid && s.holenumber === currentHole)
                const roundTotals = playerRoundTotals(p.playerid)
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
                    roundHolesCompleted={roundTotals.holesCompleted}
                    roundToPar={roundTotals.toPar}
                    roundPoints={roundTotals.points}
                  />
                )
              })}
              {teamPlayers.length === 0 && (
                <div className="text-sm text-muted-foreground">This team has no players assigned yet.</div>
              )}
            </div>
          </div>
        </>
      )}

      {team && !isIndividual && (() => {
        const parVal = par[currentHole - 1] ?? 4
        const hasValue = strokes != null
        // Only used as the +/- baseline when nothing's entered yet - never
        // shown, so tapping - or + from blank still starts near par without
        // the pill ever displaying a number nobody actually chose.
        const displayValue = strokes ?? parVal
        const displayToPar = displayValue - parVal
        const scoreBgCls = displayToPar < 0 ? 'bg-success/15 text-success' : displayToPar > 0 ? 'bg-danger/15 text-danger' : 'bg-info/15 text-info'
        const roundToParCls = totalToPar < 0 ? 'text-success' : totalToPar > 0 ? 'text-danger' : 'text-info'
        return (
        <>
          <div className="border sticky top-0 z-20 bg-white rounded p-3 space-y-2">
            <div className="text-center">
              <div className="text-4xl font-bold">Hole {currentHole}</div>
              {totalPar > 0 && (
                <div className={`text-sm font-semibold ${roundToParCls}`}>
                  Round: {totalToPar === 0 ? 'E' : totalToPar > 0 ? `+${totalToPar}` : totalToPar}
                </div>
              )}
            </div>
            {!canEditScores && (
              <div className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded p-2">
                {isZoneAdmin ? 'Select a team to edit scores' : 'You can only edit scores for teams you are on'}
              </div>
            )}
            {hasValue ? (
              <div className={`rounded-lg px-3 py-2 text-center text-3xl font-bold ${scoreBgCls}`}>
                {displayValue}
                <span className="text-xl font-semibold"> ({displayToPar === 0 ? 'E' : displayToPar > 0 ? `+${displayToPar}` : displayToPar})</span>
              </div>
            ) : (
              <div className="rounded-lg px-3 py-2 text-center text-2xl font-bold bg-muted text-muted-foreground">
                Par {parVal}
              </div>
            )}
            <div className="grid grid-cols-3 gap-2">
              <Button variant="outline" className="h-11 text-2xl px-0" onClick={() => handleQuickSave(displayValue - 1)} disabled={!canEditScores}>−</Button>
              <Button variant={hasValue && displayValue === parVal ? 'default' : 'secondary'} className="h-11 text-base px-1" onClick={() => handleQuickSave(parVal)} disabled={!canEditScores}>Par</Button>
              <Button variant="outline" className="h-11 text-2xl px-0" onClick={() => handleQuickSave(displayValue + 1)} disabled={!canEditScores}>+</Button>
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
                    className={`border rounded text-xs font-bold h-7 ${colorCls} ${h === currentHole ? 'ring-2 ring-primary' : ''}`}
                    onClick={() => handleSelectHole(h)}
                    onContextMenu={(e) => { e.preventDefault(); if (s?.strokes != null && !event?.islocked) { clearScore(eventId, team.teamid, h, 'team'); toast.success(`Cleared hole ${h}`); haptic() } }}
                  >
                    {h}
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
                    className={`border rounded text-xs font-bold h-7 ${colorCls} ${h === currentHole ? 'ring-2 ring-primary' : ''}`}
                    onClick={() => handleSelectHole(h)}
                    onContextMenu={(e) => { e.preventDefault(); if (s?.strokes != null && !event?.islocked) { clearScore(eventId, team.teamid, h, 'team'); toast.success(`Cleared hole ${h}`); haptic() } }}
                  >
                    {h}
                  </button>
                )
              })}

              </div>
            </div>
          )}
        </div>
        </>
        )
      })()}
    </div>
  )
}
