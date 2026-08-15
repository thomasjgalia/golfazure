import { useParams, Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useEvent } from '@/hooks/useEvents'
import { useTeams } from '@/hooks/useTeams'
import { usePlayers } from '@/hooks/usePlayers'
import { useAuth } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogClose } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useEffect, useMemo, useState } from 'react'
import { shuffle, computeTeamSizes, pickAnimalNames } from '@/utils/teamShuffle'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { ScoreRow, TeamRow } from '@/types'

export default function TeamsPage() {
  const params = useParams()
  const eventId = Number(params.id)
  const { event } = useEvent(eventId)
  const { teams, loading, create, update, remove, refresh } = useTeams(eventId)
  const { players } = usePlayers()
  const { isAdmin } = useAuth()
  // Once an event is live (or done), team rosters are locked in - reshuffling
  // would scramble who a hole's already-recorded scores belong to.
  const eventIsLive = event?.status === 'In Progress' || event?.status === 'Completed'

  const [open, setOpen] = useState(false)
  const [teamname, setTeamname] = useState('')
  const [selected, setSelected] = useState<number[]>([])
  const [startinghole, setStartinghole] = useState<number | null>(null)

  const [openEdit, setOpenEdit] = useState(false)
  const [editingTeamId, setEditingTeamId] = useState<number | null>(null)

  const [openShuffle, setOpenShuffle] = useState(false)
  const [shuffleTeamSize, setShuffleTeamSize] = useState<3 | 4>(4)
  const [shuffleSelected, setShuffleSelected] = useState<Set<number>>(new Set())
  const [shuffleReshuffle, setShuffleReshuffle] = useState(false)
  const [shuffling, setShuffling] = useState(false)
  const [scoreWarningOpen, setScoreWarningOpen] = useState(false)
  const [pendingTeamsToDelete, setPendingTeamsToDelete] = useState<TeamRow[]>([])
  const [deleteTeamTarget, setDeleteTeamTarget] = useState<TeamRow | null>(null)

  const availablePlayers = useMemo(() => players ?? [], [players])
  const playerMap = useMemo(() => {
    const map: Record<number, any> = {}
    for (const p of availablePlayers) map[p.playerid] = p
    return map
  }, [availablePlayers])
  const assignedMap = useMemo(() => {
    const map: Record<number, number> = {}
    for (const t of teams ?? []) {
      const ids = (Object.values(t.players) as Array<number | undefined>).filter(Boolean) as number[]
      for (const id of ids) map[id] = t.teamid
    }
    return map
  }, [teams])
  const isTaken = (pid: number, forTeamId: number | null) => {
    const tid = assignedMap[pid]
    return tid != null && tid !== forTeamId
  }

  // House rule: Tom's team is always the Frogs.
  const frogsPlayerId = availablePlayers.find(
    (p) => p.firstname.trim().toLowerCase() === 'tom' && p.lastname.trim().toLowerCase() === 'marturano'
  )?.playerid

  const unassignedPlayers = useMemo(
    () => availablePlayers.filter((p) => assignedMap[p.playerid] == null),
    [availablePlayers, assignedMap]
  )

  useEffect(() => { refresh() }, [])

  // Reshuffle mode widens the player pool to everyone (not just unassigned)
  // and, by default, selects exactly the players who are already teamed up
  // for this event - that's "reshuffle the outing", with room to fold in a
  // late-arriving unassigned player if the admin checks them too.
  const shufflePool = shuffleReshuffle ? availablePlayers : unassignedPlayers

  function openAssignDialog() {
    setShuffleSelected(new Set(unassignedPlayers.map((p) => p.playerid)))
    setShuffleReshuffle(false)
    setOpenShuffle(true)
  }

  function openReshuffleDialog() {
    if (eventIsLive) {
      toast.error('Teams are locked in once the event is live')
      return
    }
    setShuffleSelected(new Set(availablePlayers.filter((p) => assignedMap[p.playerid] != null).map((p) => p.playerid)))
    setShuffleReshuffle(true)
    setOpenShuffle(true)
  }

  function toggleReshuffleMode() {
    if (eventIsLive) return
    setShuffleReshuffle((prev) => {
      const next = !prev
      setShuffleSelected(
        next
          ? new Set(availablePlayers.filter((p) => assignedMap[p.playerid] != null).map((p) => p.playerid))
          : new Set(unassignedPlayers.map((p) => p.playerid))
      )
      return next
    })
  }

  function toggleShufflePlayer(id: number) {
    setShuffleSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const shuffleSizes = useMemo(
    () => computeTeamSizes(shuffleSelected.size, shuffleTeamSize),
    [shuffleSelected.size, shuffleTeamSize]
  )

  async function performShuffle(teamsToDelete: TeamRow[]) {
    const ids = shuffle(Array.from(shuffleSelected))
    const sizes = computeTeamSizes(ids.length, shuffleTeamSize)
    if (sizes.length === 0) return

    setShuffling(true)
    try {
      if (teamsToDelete.length > 0) {
        await Promise.all(teamsToDelete.map((t) => remove(t.teamid)))
      }
      const survivingNames = (teams ?? [])
        .filter((t) => !teamsToDelete.some((d) => d.teamid === t.teamid))
        .map((t) => t.teamname)
      const includesFrogsPlayer = frogsPlayerId != null && ids.includes(frogsPlayerId)
      const names = pickAnimalNames(sizes.length, includesFrogsPlayer ? [...survivingNames, 'Frogs'] : survivingNames)
      let cursor = 0
      // Sequential, not parallel: team ids are assigned by the API as
      // "current max + 1", so creating several teams at once risks two
      // requests computing the same id.
      for (let i = 0; i < sizes.length; i++) {
        const size = sizes[i]!
        const group = ids.slice(cursor, cursor + size)
        cursor += size
        const playersJson = {
          player1: group[0],
          player2: group[1],
          player3: group[2],
          player4: group[3],
        }
        const teamname = frogsPlayerId != null && group.includes(frogsPlayerId) ? 'Frogs' : names[i]!
        await create({ eventid: eventId, teamname, players: playersJson, startinghole: null })
      }
      toast.success(`Created ${sizes.length} team${sizes.length === 1 ? '' : 's'}`)
      setOpenShuffle(false)
    } catch (e: any) {
      toast.error(e?.message || 'Failed to auto-assign teams')
    } finally {
      setShuffling(false)
    }
  }

  async function submitShuffle() {
    if (shuffleReshuffle && eventIsLive) {
      toast.error('Teams are locked in once the event is live')
      return
    }
    // Reshuffling: any existing team whose entire roster is included in this
    // shuffle gets torn down and replaced. A team with even one deselected
    // player is left alone rather than orphaning that player's teammate.
    const teamsToDelete: TeamRow[] = shuffleReshuffle
      ? (teams ?? []).filter((t) => {
          const ids = (Object.values(t.players) as Array<number | undefined>).filter(Boolean) as number[]
          return ids.length > 0 && ids.every((id) => shuffleSelected.has(id))
        })
      : []

    if (teamsToDelete.length > 0) {
      try {
        const eventScores = await api.get<ScoreRow[]>(`/scores?eventId=${eventId}`)
        const deletedTeamIds = new Set(teamsToDelete.map((t) => t.teamid))
        const hasTeamScores = eventScores.some(
          (s) => s.playerid == null && s.teamid != null && deletedTeamIds.has(s.teamid) && s.strokes != null
        )
        if (hasTeamScores) {
          setPendingTeamsToDelete(teamsToDelete)
          setScoreWarningOpen(true)
          return
        }
      } catch {
        // If the score check itself fails, fall through and let the reshuffle proceed.
      }
    }

    await performShuffle(teamsToDelete)
  }

  async function submit() {
    if (!Number.isFinite(eventId)) {
      toast.error('Invalid event. Please navigate from an event and try again.')
      return
    }
    if (teamname.trim().length === 0) {
      toast.error('Please enter a team name')
      return
    }
    if (selected.length < 1) {
      toast.error('Select at least 1 player')
      return
    }
    const conflicts = selected.filter((pid) => isTaken(pid, null))
    if (conflicts.length) {
      const names = conflicts.map((id) => playerMap[id] ? `${playerMap[id].lastname}, ${playerMap[id].firstname}` : `#${id}`).join(', ')
      toast.error(`These players are already on a team for this event: ${names}`)
      return
    }
    const playersJson = {
      player1: selected[0],
      player2: selected[1],
      player3: selected[2],
      player4: selected[3],
    }
    try {
      await create({ eventid: eventId, teamname: teamname.trim(), players: playersJson, startinghole })
      setOpen(false)
      setTeamname('')
      setSelected([])
      setStartinghole(null)
    } catch (e: any) {
      toast.error(e.message || 'Failed to create team')
    }
  }

  function togglePlayer(id: number) {
    setSelected((prev) => {
      const set = new Set(prev)
      if (set.has(id)) set.delete(id)
      else if (set.size < 4) set.add(id)
      return Array.from(set)
    })
  }

  async function confirmDeleteTeam() {
    if (!deleteTeamTarget) return
    try {
      await remove(deleteTeamTarget.teamid)
    } catch (e: any) {
      toast.error(e.message || 'Failed to delete team')
    }
  }

  function beginEdit(t: any) {
    setEditingTeamId(t.teamid)
    setTeamname(t.teamname)
    const ids = Object.values(t.players).filter(Boolean) as number[]
    setSelected(ids)
    setStartinghole(t.startinghole ?? null)
    setOpenEdit(true)
  }

  async function submitEdit() {
    if (!editingTeamId) return
    if (teamname.trim().length === 0) return toast.error('Please enter a team name')
    if (selected.length < 1) return toast.error('Select at least 1 player')
    const conflicts = selected.filter((pid) => isTaken(pid, editingTeamId))
    if (conflicts.length) {
      const names = conflicts.map((id) => playerMap[id] ? `${playerMap[id].lastname}, ${playerMap[id].firstname}` : `#${id}`).join(', ')
      return toast.error(`These players are already on another team for this event: ${names}`)
    }
    const playersJson = {
      player1: selected[0],
      player2: selected[1],
      player3: selected[2],
      player4: selected[3],
    }
    try {
      await update(editingTeamId, { teamname: teamname.trim(), players: playersJson, startinghole })
      setOpenEdit(false)
      setEditingTeamId(null)
      setTeamname('')
      setSelected([])
      setStartinghole(null)
    } catch (e: any) {
      toast.error(e.message || 'Failed to update team')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="icon">
            <Link to={`/events/${eventId}`} aria-label="Back to Event"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <h1 className="text-xl font-semibold">Teams</h1>
        </div>
        {isAdmin && (
        <div className="flex gap-2">
        {(teams?.length ?? 0) > 0 && (
          <Button variant="outline" onClick={openReshuffleDialog} disabled={eventIsLive}>Reshuffle</Button>
        )}
        <Dialog open={openShuffle} onOpenChange={setOpenShuffle}>
          <Button variant="outline" onClick={openAssignDialog}>Auto-Assign Teams</Button>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{shuffleReshuffle ? 'Reshuffle Teams' : 'Auto-Assign Teams'}</DialogTitle>
              <DialogDescription>
                Randomly splits the selected players into teams and names them for you. Great for scrambles.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4">
              {(teams?.length ?? 0) > 0 && (
                eventIsLive ? (
                  <div className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded p-2">
                    Teams are locked in once the event is live - only unassigned players can be added.
                  </div>
                ) : (
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={shuffleReshuffle} onChange={toggleReshuffleMode} />
                    <span>Reshuffle players already on a team</span>
                  </label>
                )
              )}
              <div>
                <Label>Team size</Label>
                <Select value={String(shuffleTeamSize)} onValueChange={(v) => setShuffleTeamSize(Number(v) as 3 | 4)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="4">4 players</SelectItem>
                    <SelectItem value="3">3 players</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Players to assign ({shuffleSelected.size})</Label>
                {shufflePool.length === 0 ? (
                  <div className="text-sm text-muted-foreground mt-2">
                    Every player is already on a team for this event.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2 max-h-64 overflow-auto border rounded p-2 mt-2">
                    {shufflePool.map((p) => (
                      <label key={p.playerid} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={shuffleSelected.has(p.playerid)}
                          onChange={() => toggleShufflePlayer(p.playerid)}
                        />
                        <span>{p.lastname}, {p.firstname}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
              {shuffleSizes.length > 0 && (
                <div className="text-sm text-muted-foreground">
                  Will create {shuffleSizes.length} team{shuffleSizes.length === 1 ? '' : 's'}: {shuffleSizes.join(', ')} players each
                </div>
              )}
              <div className="flex justify-end gap-2">
                <DialogClose asChild>
                  <Button variant="outline">Cancel</Button>
                </DialogClose>
                <Button onClick={submitShuffle} disabled={shuffling || shuffleSizes.length === 0}>
                  {shuffling ? 'Assigning...' : shuffleReshuffle ? 'Reshuffle Teams' : 'Assign Teams'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>Create Team</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New Team</DialogTitle>
              <DialogDescription>Select 1-4 players</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4">
              <div>
                <Label>Team name</Label>
                <Input required value={teamname} onChange={(e) => setTeamname(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-2 max-h-64 overflow-auto border rounded p-2">
                {availablePlayers.map((p) => {
                  const disabled = isTaken(p.playerid, editingTeamId ?? null)
                  const takenTeam = disabled ? teams?.find((t) => assignedMap[p.playerid] === t.teamid)?.teamname : null
                  return (
                    <label key={p.playerid} className={`flex items-center gap-2 text-sm ${disabled ? 'opacity-50' : ''}`}>
                      <input type="checkbox" disabled={disabled} checked={selected.includes(p.playerid)} onChange={() => togglePlayer(p.playerid)} />
                      <span>{p.lastname}, {p.firstname}</span>
                      {disabled && <span className="text-xs text-danger">(on {takenTeam || 'team'})</span>}
                    </label>
                  )
                })}
              </div>
              <div>
                <Label>Starting hole (optional)</Label>
                <Input type="number" placeholder="1" value={startinghole ?? ''} onChange={(e) => setStartinghole(e.target.value ? Number(e.target.value) : null)} />
              </div>
              <div className="flex justify-end gap-2">
                <DialogClose asChild>
                  <Button variant="outline">Cancel</Button>
                </DialogClose>
                <Button onClick={submit} disabled={!Number.isFinite(eventId) || teamname.trim().length === 0 || selected.length < 1}>Save</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
        </div>
        )}
      </div>

      {loading && <div>Loading...</div>}

      <div className="grid gap-2">
        {teams?.map((t) => (
          <div key={t.teamid} className="border rounded p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{t.teamname}</div>
                <div className="text-xs text-muted-foreground">Players: {Object.values(t.players).filter(Boolean).length}</div>
                <div className="text-xs text-muted-foreground break-words">
                  {(() => {
                    const ids = (Object.values(t.players) as Array<number | undefined>).filter(Boolean) as number[]
                    const names = ids.map((id) => playerMap[id] ? `${playerMap[id].lastname}, ${playerMap[id].firstname}` : `#${id}`)
                    return names.join('; ')
                  })()}
                </div>
                {t.startinghole && <div className="text-xs text-muted-foreground">Start: {t.startinghole}</div>}
              </div>
              {isAdmin && (
              <div className="mt-2 sm:mt-0 flex gap-2 w-full sm:w-auto">
                <Button size="sm" variant="outline" className="flex-1 sm:flex-none" onClick={() => beginEdit(t)}>Edit</Button>
                <Button size="sm" variant="destructive" className="flex-1 sm:flex-none" onClick={() => setDeleteTeamTarget(t)}>Delete</Button>
              </div>
              )}
            </div>
          </div>
        ))}
      </div>
      <Dialog open={openEdit} onOpenChange={setOpenEdit}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Team</DialogTitle>
                          <DialogDescription>Update team name and select 1-4 players</DialogDescription>

          </DialogHeader>
          <div className="grid gap-4">
            <div>
              <Label>Team name</Label>
              <Input required value={teamname} onChange={(e) => setTeamname(e.target.value)} />
            </div>
                          <div className="grid grid-cols-2 gap-2 max-h-64 overflow-auto border rounded p-2">
                {availablePlayers.map((p) => {
                  const disabled = isTaken(p.playerid, editingTeamId ?? null)
                  const takenTeam = disabled ? teams?.find((t) => assignedMap[p.playerid] === t.teamid)?.teamname : null
                  return (
                    <label key={p.playerid} className={`flex items-center gap-2 text-sm ${disabled ? 'opacity-50' : ''}`}>
                      <input type="checkbox" disabled={disabled} checked={selected.includes(p.playerid)} onChange={() => togglePlayer(p.playerid)} />
                      <span>{p.lastname}, {p.firstname}</span>
                      {disabled && <span className="text-xs text-danger">(on {takenTeam || 'team'})</span>}
                    </label>
                  )
                })}
              </div>

            <div>
              <Label>Starting hole (optional)</Label>
              <Input type="number" placeholder="1" value={startinghole ?? ''} onChange={(e) => setStartinghole(e.target.value ? Number(e.target.value) : null)} />
            </div>
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button variant="outline" onClick={() => setOpenEdit(false)}>Cancel</Button>
              </DialogClose>
              <Button onClick={submitEdit} disabled={teamname.trim().length === 0 || selected.length < 1}>Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={scoreWarningOpen}
        onOpenChange={setScoreWarningOpen}
        title="Reshuffle teams with recorded scores?"
        description={`${pendingTeamsToDelete.length} team(s) being reshuffled have recorded scores for this round. Those scores will no longer be visible.`}
        confirmLabel="Reshuffle Anyway"
        onConfirm={() => performShuffle(pendingTeamsToDelete)}
      />
      <ConfirmDialog
        open={!!deleteTeamTarget}
        onOpenChange={(o) => { if (!o) setDeleteTeamTarget(null) }}
        title="Delete team?"
        description={deleteTeamTarget ? `Delete "${deleteTeamTarget.teamname}"? This cannot be undone.` : ''}
        confirmLabel="Delete"
        onConfirm={confirmDeleteTeam}
      />
    </div>
  )
}
