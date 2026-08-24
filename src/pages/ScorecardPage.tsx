import { useParams, useSearchParams, Link } from 'react-router-dom'
import { useEvent } from '@/hooks/useEvents'
import { useTeams } from '@/hooks/useTeams'
import { usePlayers } from '@/hooks/usePlayers'
import { useScores } from '@/hooks/useScores'
import { Button } from '@/components/ui/button'
import { colorForScore, formatDate, stablefordPoints } from '@/utils/format'
import type { PlayerRow } from '@/types'

type Row = { key: string; label: string; byHole: Record<number, number> }

// One 9-hole table (Front or Back), scoped to just those holes' columns and
// subtotal - mirrors how a physical scorecard splits OUT/IN before a TOTAL.
function NineTable({ title, holeSet, rows, par, isStableford }: {
  title: string
  holeSet: number[]
  rows: Row[]
  par: number[]
  isStableford: boolean
}) {
  const totalPar = holeSet.reduce((a, h) => a + (par[h - 1] ?? 4), 0)
  return (
    <div className="overflow-x-auto border rounded">
      <table className="text-sm">
        <thead>
          <tr className="bg-muted/50">
            <th className="p-2 text-left sticky left-0 bg-muted/50 whitespace-nowrap">{title}</th>
            {holeSet.map((h) => (
              <th key={h} className="p-2 text-center w-10">{h}</th>
            ))}
            <th className="p-2 text-center font-semibold">Tot</th>
            {isStableford && <th className="p-2 text-center font-semibold">Pts</th>}
          </tr>
          <tr className="text-muted-foreground">
            <th className="p-2 text-left sticky left-0 bg-white whitespace-nowrap">Par</th>
            {holeSet.map((h) => (
              <th key={h} className="p-2 text-center font-normal">{par[h - 1] ?? 4}</th>
            ))}
            <th className="p-2 text-center">{totalPar}</th>
            {isStableford && <th className="p-2 text-center" />}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const playedHoles = holeSet.filter((h) => r.byHole[h] != null)
            const playedCount = playedHoles.length
            const total = holeSet.reduce((a, h) => a + (r.byHole[h] ?? 0), 0)
            const parPlayed = playedHoles.reduce((a, h) => a + (par[h - 1] ?? 4), 0)
            const scoreToPar = playedCount > 0 ? total - parPlayed : null
            const totalPoints = playedHoles.reduce((a, h) => a + stablefordPoints(r.byHole[h] ?? 0, par[h - 1] ?? 4), 0)
            return (
              <tr key={r.key} className="border-t">
                <td className="p-2 font-medium sticky left-0 bg-white whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <span className="truncate">{r.label}</span>
                    {scoreToPar != null && (
                      <span className={`text-xs font-semibold ${colorForScore(scoreToPar)}`}>
                        {scoreToPar === 0 ? 'E' : scoreToPar > 0 ? `+${scoreToPar}` : scoreToPar}
                      </span>
                    )}
                  </div>
                </td>
                {holeSet.map((h) => {
                  const v = r.byHole[h]
                  const parVal = par[h - 1] ?? 4
                  const toPar = v != null ? v - parVal : null
                  return (
                    <td key={h} className={`p-2 text-center ${toPar == null ? '' : colorForScore(toPar)}`}>
                      {v ?? '-'}
                    </td>
                  )
                })}
                <td className="p-2 text-center font-semibold">{playedCount > 0 ? total : '-'}</td>
                {isStableford && (
                  <td className="p-2 text-center font-semibold">{playedCount > 0 ? totalPoints : '-'}</td>
                )}
              </tr>
            )
          })}
          {rows.length === 0 && (
            <tr>
              <td className="p-3 text-muted-foreground" colSpan={holeSet.length + 2}>No scores recorded yet.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

// Standalone, full-page scorecard - broken out of ScoringPage since a table
// wide enough to show every hole doesn't fit well squeezed under the score
// entry controls, especially on a phone.
export default function ScorecardPage() {
  const params = useParams()
  const eventId = Number(params.id)
  const [search, setSearch] = useSearchParams()
  const teamId = Number(search.get('teamId') || 0) || undefined

  const { event } = useEvent(eventId)
  const { teams } = useTeams(eventId)
  const { players } = usePlayers()
  const team = teams?.find((t) => t.teamid === teamId)
  // Stableford is scored per-player like Stroke Play, just ranked by points instead of strokes.
  const isIndividual = event?.format === 'Stroke Play' || event?.format === 'Stableford'
  const isStableford = event?.format === 'Stableford'

  const { scores } = useScores(eventId, teamId)

  const par = event?.parperhole ?? []
  const holes = event?.numberofholes ?? par.length ?? 0
  const holeNumbers = Array.from({ length: holes }, (_, i) => i + 1)
  const frontHoles = holeNumbers.filter((h) => h <= 9)
  const backHoles = holeNumbers.filter((h) => h > 9)

  const teamPlayers: PlayerRow[] = team
    ? ([team.players.player1, team.players.player2, team.players.player3, team.players.player4]
        .filter(Boolean) as number[])
        .map((id) => players?.find((p) => p.playerid === id))
        .filter(Boolean) as PlayerRow[]
    : []

  // Rows: one per player for Stroke Play, one for the team otherwise.
  const rows: Row[] = isIndividual
    ? teamPlayers.map((p) => {
        const byHole: Record<number, number> = {}
        for (const s of scores ?? []) if (s.playerid === p.playerid && s.strokes != null) byHole[s.holenumber] = s.strokes
        return { key: String(p.playerid), label: `${p.firstname} ${p.lastname}`, byHole }
      })
    : team
      ? [(() => {
          const byHole: Record<number, number> = {}
          for (const s of scores ?? []) if (s.playerid == null && s.strokes != null) byHole[s.holenumber] = s.strokes
          return { key: String(team.teamid), label: team.teamname, byHole }
        })()]
      : []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Scorecard</h1>
        {team && (
          <Button asChild variant="outline" size="sm">
            <Link to={`/events/${eventId}/scoring?teamId=${team.teamid}`}>Back to Scoring</Link>
          </Button>
        )}
      </div>

      {event && (
        <div className="text-sm text-muted-foreground">
          {event.eventname} • {formatDate(event.eventdate)} • {event.coursename}
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-center">
        <label className="text-sm">Team:</label>
        <select
          className="border rounded px-2 py-1"
          value={teamId ?? ''}
          onChange={(e) => setSearch({ teamId: e.target.value })}
        >
          <option value="">Select team</option>
          {teams?.map((t) => (
            <option key={t.teamid} value={t.teamid}>{t.teamname}</option>
          ))}
        </select>
      </div>

      {team && (
        <div className="space-y-4">
          <NineTable title={backHoles.length > 0 ? 'Front 9' : isIndividual ? 'Player' : 'Team'} holeSet={frontHoles} rows={rows} par={par} isStableford={isStableford} />

          {backHoles.length > 0 && (
            <>
              {/* Explicit line break between the two nines, matching a physical scorecard's OUT/IN split. */}
              <hr className="border-t-2" />
              <NineTable title="Back 9" holeSet={backHoles} rows={rows} par={par} isStableford={isStableford} />

              <div className="border rounded p-3 space-y-1.5">
                <div className="text-sm font-semibold text-muted-foreground">Round Total</div>
                {rows.map((r) => {
                  const playedHoles = holeNumbers.filter((h) => r.byHole[h] != null)
                  const playedCount = playedHoles.length
                  const total = holeNumbers.reduce((a, h) => a + (r.byHole[h] ?? 0), 0)
                  const parPlayed = playedHoles.reduce((a, h) => a + (par[h - 1] ?? 4), 0)
                  const scoreToPar = playedCount > 0 ? total - parPlayed : null
                  const totalPoints = playedHoles.reduce((a, h) => a + stablefordPoints(r.byHole[h] ?? 0, par[h - 1] ?? 4), 0)
                  return (
                    <div key={r.key} className="flex items-center justify-between gap-2 text-sm">
                      <span className="font-medium truncate">{r.label}</span>
                      {playedCount > 0 ? (
                        <span className="flex items-center gap-2 shrink-0">
                          <span>{total} strokes</span>
                          <span className={`font-semibold ${colorForScore(scoreToPar ?? 0)}`}>
                            {scoreToPar === 0 ? 'E' : (scoreToPar ?? 0) > 0 ? `+${scoreToPar}` : scoreToPar}
                          </span>
                          {isStableford && <span className="font-semibold">{totalPoints} pts</span>}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </div>
                  )
                })}
                {rows.length === 0 && <div className="text-sm text-muted-foreground">No scores recorded yet.</div>}
              </div>
            </>
          )}
        </div>
      )}

      {!team && (
        <div className="text-sm text-muted-foreground">Select a team to view its scorecard.</div>
      )}
    </div>
  )
}
