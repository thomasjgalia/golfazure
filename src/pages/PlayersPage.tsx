import { usePlayers } from '@/hooks/usePlayers'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogClose } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useState } from 'react'
import type { NewPlayer, PlayerRow } from '@/types'
import { useAuth } from '@/lib/auth'

export default function PlayersPage() {
  const { players, loading, create, update, remove } = usePlayers()
  const { isAdmin } = useAuth()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<NewPlayer & { profile_secret?: string }>({ firstname: '', lastname: '', phone: '', email: '', handicap: 18, profile_secret: '' })

  const [openEdit, setOpenEdit] = useState(false)
  const [editing, setEditing] = useState<PlayerRow | null>(null)
  const [editForm, setEditForm] = useState<NewPlayer & { profile_secret?: string }>({ firstname: '', lastname: '', phone: '', email: '', handicap: 18, profile_secret: '' })

  async function submit() {
    const emailRe = /.+@.+\..+/i
    if (!form.firstname.trim() || !form.lastname.trim() || !form.email || !emailRe.test(form.email) || form.handicap == null) {
      alert('Please complete all required fields. Email must be valid. Handicap defaults to 18 and is required.')
      return
    }
    await create({ firstname: form.firstname, lastname: form.lastname, email: form.email, phone: null, handicap: form.handicap, profile_secret: form.profile_secret })
    setOpen(false)
    setForm({ firstname: '', lastname: '', phone: '', email: '', handicap: 18, profile_secret: '' })
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
    if (!editForm.firstname.trim() || !editForm.lastname.trim() || !editForm.email || !emailRe.test(editForm.email) || editForm.handicap == null) {
      alert('Please complete all required fields. Email must be valid. Handicap is required.')
      return
    }
    await update(editing.playerid, {
      firstname: editForm.firstname,
      lastname: editForm.lastname,
      email: editForm.email,
      handicap: editForm.handicap,
      profile_secret: editForm.profile_secret,
    })
    setOpenEdit(false)
    setEditing(null)
  }

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Players</h1>
        {/* Moved Add button to sticky bottom bar */}
        <Dialog open={open} onOpenChange={setOpen}>
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
                <Label>Email *</Label>
                <Input required type="email" value={form.email ?? ''} onChange={(e) => setForm({ ...form, email: e.target.value })} />
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
      </div>

      {loading && <div>Loading...</div>}

      <div className="grid gap-2">
        {players?.map((p) => (
          <div key={p.playerid} className="border rounded p-3 active:scale-[0.995] transition">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{p.lastname}, {p.firstname}</div>
                <div className="text-xs text-muted-foreground break-all">{p.email ?? ''}</div>
                <div className="text-xs text-muted-foreground">HC: {p.handicap ?? '-'}</div>
              </div>
              {isAdmin && (
                <div className="mt-2 sm:mt-0 flex gap-2 w-full sm:w-auto">
                  <Button size="sm" variant="outline" className="flex-1 sm:flex-none" onClick={() => beginEdit(p)}>Edit</Button>
                  <Button size="sm" variant="destructive" className="flex-1 sm:flex-none" onClick={() => { if (confirm('Delete this player?')) remove(p.playerid) }}>Delete</Button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
          {/* Sticky bottom action bar */}
      {/* Edit Player Dialog */}
      <Dialog open={openEdit} onOpenChange={setOpenEdit}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Player</DialogTitle>
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
              <Label>Email *</Label>
              <Input required type="email" value={editForm.email ?? ''} onChange={(e) => setEditForm({ ...editForm, email: e.target.value || '' })} />
            </div>

            <div>
              <Label>Handicap</Label>
              <Input type="number" step="0.1" value={editForm.handicap ?? ''} onChange={(e) => setEditForm({ ...editForm, handicap: e.target.value ? Number(e.target.value) : null })} />
            </div>
            <div className="col-span-2">
              <Label>Profile Secret</Label>
              <Input type="text" placeholder="e.g., 1234 or golf" value={editForm.profile_secret ?? ''} onChange={(e) => setEditForm({ ...editForm, profile_secret: e.target.value })} />
              <p className="text-xs text-muted-foreground mt-1">Used for claiming profile in the app</p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={saveEdit}>Save</Button>
          </div>
        </DialogContent>
      </Dialog>

      {isAdmin && (
        <div className="fixed bottom-0 left-0 right-0 border-t bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/75">
          <div className="container py-2">
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
                                  <Label>Email *</Label>
                <Input required type="email" value={form.email ?? ''} onChange={(e) => setForm({ ...form, email: e.target.value })} />

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
        </div>
      </div>
      )}
    </div>
  )
}

