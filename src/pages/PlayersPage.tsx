import { Link } from 'react-router-dom'
import { usePlayers } from '@/hooks/usePlayers'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogClose } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useMemo, useState } from 'react'
import type { NewPlayer, PlayerRow } from '@/types'
import { useAuth } from '@/lib/auth'
import { useBottomBar } from '@/lib/bottomBar'
import { toast } from 'sonner'

export default function PlayersPage() {
  const { players, loading, create, update, remove } = usePlayers()
  const { isZoneAdmin, currentZoneId, claimedPlayer } = useAuth()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<NewPlayer & { profile_secret?: string }>({ firstname: '', lastname: '', phone: '', email: '', handicap: 18, profile_secret: '' })

  const [openEdit, setOpenEdit] = useState(false)
  const [editing, setEditing] = useState<PlayerRow | null>(null)
  const [editForm, setEditForm] = useState<NewPlayer & { profile_secret?: string }>({ firstname: '', lastname: '', phone: '', email: '', handicap: 18, profile_secret: '' })
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)

  async function submit() {
    const emailRe = /.+@.+\..+/i
    if (!form.firstname.trim() || !form.lastname.trim() || (form.email && !emailRe.test(form.email)) || form.handicap == null) {
      toast.error('Please complete all required fields. Email, if provided, must be valid. Handicap defaults to 18 and is required.')
      return
    }
    if (!currentZoneId) return
    try {
      await create({ firstname: form.firstname, lastname: form.lastname, email: form.email || null, phone: null, handicap: form.handicap, profile_secret: form.profile_secret }, currentZoneId)
      setOpen(false)
      setForm({ firstname: '', lastname: '', phone: '', email: '', handicap: 18, profile_secret: '' })
    } catch (e: any) {
      toast.error(e.message || 'Failed to create player')
    }
  }

  function beginEdit(p: PlayerRow) {
    setEditing(p)
    setEditForm({
      firstname: p.firstname,
      lastname: p.lastname,
      email: p.email ?? '',
      phone: p.phone ?? '',
      handicap: p.handicap ?? 18,
      profile_secret: p.profile_secret ?? '',
    })
    setOpenEdit(true)
  }

  async function saveEdit() {
    if (!editing) return
    const emailRe = /.+@.+\..+/i
    if (!editForm.firstname.trim() || !editForm.lastname.trim() || (editForm.email && !emailRe.test(editForm.email)) || editForm.handicap == null) {
      toast.error('Please complete all required fields. Email, if provided, must be valid. Handicap is required.')
      return
    }
    const patch: Partial<PlayerRow> = {
      firstname: editForm.firstname,
      lastname: editForm.lastname,
      email: editForm.email || null,
      handicap: editForm.handicap,
    }
    // Server never returns the existing secret, so an empty field means "leave it alone"
    // rather than "clear it" - only send a new value if the admin actually typed one.
    if (editForm.profile_secret) patch.profile_secret = editForm.profile_secret
    try {
      await update(editing.playerid, patch)
      setOpenEdit(false)
      setEditing(null)
    } catch (e: any) {
      toast.error(e.message || 'Failed to update player')
    }
  }

  async function deleteEditing() {
    if (!editing || !currentZoneId) return
    try {
      await remove(editing.playerid, currentZoneId)
      setOpenEdit(false)
      setEditing(null)
    } catch {
      // error toast already shown by remove()
    }
  }

  const bottomBarNode = useMemo(() => {
    if (!isZoneAdmin) return null
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <div className="grid grid-cols-1">
          <DialogTrigger asChild>
            <Button>Add Player</Button>
          </DialogTrigger>
        </div>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Player</DialogTitle>
            <DialogDescription>Enter player details</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>First name *</Label>
              <Input required value={form.firstname} onChange={(e) => setForm({ ...form, firstname: e.target.value })} />
            </div>
            <div>
              <Label>Last name *</Label>
              <Input required value={form.lastname} onChange={(e) => setForm({ ...form, lastname: e.target.value })} />
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={form.email ?? ''} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <Label>Handicap</Label>
              <Input type="number" step="0.1" value={form.handicap ?? ''} onChange={(e) => setForm({ ...form, handicap: e.target.value ? Number(e.target.value) : null })} />
            </div>
            <div className="col-span-2">
              <Label>Profile Secret</Label>
              <Input type="text" placeholder="e.g., 1234 or golf" value={form.profile_secret ?? ''} onChange={(e) => setForm({ ...form, profile_secret: e.target.value })} />
              <p className="text-xs text-muted-foreground mt-1">Used for claiming profile in the app</p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={submit}>Save</Button>
          </div>
        </DialogContent>
      </Dialog>
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isZoneAdmin, open, form])

  useBottomBar(bottomBarNode)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Players</h1>
        {isZoneAdmin && currentZoneId && (
          <Button asChild variant="outline" size="sm">
            <Link to={`/zones/${currentZoneId}/roster`}>Manage Zone Roster</Link>
          </Button>
        )}
      </div>

      {loading && <div>Loading...</div>}

      <div className="grid gap-1.5">
        {players?.map((p) => (
          <div key={p.playerid} className="border rounded px-3 py-1.5 flex items-center justify-between gap-2 active:scale-[0.995] transition">
            <Link to={`/players/${p.playerid}/history`} className="min-w-0 flex items-baseline gap-2 flex-1">
              <span className="font-medium truncate">{p.firstname} {p.lastname}</span>
              <span className="text-xs text-muted-foreground shrink-0">HC {p.handicap ?? '-'}</span>
            </Link>
            <div className="flex gap-2 shrink-0">
              <Button asChild size="sm" variant="outline" className="h-7 px-2 text-xs">
                <Link to={`/players/${p.playerid}/history`}>History</Link>
              </Button>
              {(isZoneAdmin || claimedPlayer?.playerid === p.playerid) && (
                <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => beginEdit(p)}>Edit</Button>
              )}
            </div>
          </div>
        ))}
      </div>

      <Dialog open={openEdit} onOpenChange={setOpenEdit}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{claimedPlayer?.playerid === editing?.playerid ? 'Edit Your Profile' : 'Edit Player'}</DialogTitle>
            <DialogDescription>Update player details</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>First name *</Label>
              <Input required value={editForm.firstname} onChange={(e) => setEditForm({ ...editForm, firstname: e.target.value })} />
            </div>
            <div>
              <Label>Last name *</Label>
              <Input required value={editForm.lastname} onChange={(e) => setEditForm({ ...editForm, lastname: e.target.value })} />
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={editForm.email ?? ''} onChange={(e) => setEditForm({ ...editForm, email: e.target.value || '' })} />
            </div>

            <div>
              <Label>Handicap</Label>
              <Input type="number" step="0.1" value={editForm.handicap ?? ''} onChange={(e) => setEditForm({ ...editForm, handicap: e.target.value ? Number(e.target.value) : null })} />
            </div>
            <div className="col-span-2">
              <Label>Profile Secret</Label>
              <Input type="text" placeholder="Leave blank to keep the current secret" value={editForm.profile_secret ?? ''} onChange={(e) => setEditForm({ ...editForm, profile_secret: e.target.value })} />
              <p className="text-xs text-muted-foreground mt-1">Used for claiming profile in the app. For security, the current secret is never shown here.</p>
            </div>
          </div>
          <div className="flex justify-between gap-2">
            {isZoneAdmin ? (
              <Button variant="destructive" onClick={() => setDeleteConfirmOpen(true)}>Remove from Zone</Button>
            ) : <div />}
            <div className="flex gap-2">
              <DialogClose asChild>
                <Button variant="outline">Cancel</Button>
              </DialogClose>
              <Button onClick={saveEdit}>Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Remove from zone?"
        description="Removes them from this zone. Their player record and history are kept unless this was their last remaining zone."
        confirmLabel="Remove"
        onConfirm={deleteEditing}
      />
    </div>
  )
}
