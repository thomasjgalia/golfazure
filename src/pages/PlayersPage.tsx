import { usePlayers } from '@/hooks/usePlayers'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogClose } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useState } from 'react'
import type { NewPlayer, PlayerRow } from '@/types'

export default function PlayersPage() {
  const { players, loading, create, update, remove } = usePlayers()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<NewPlayer>({ firstname: '', lastname: '', phone: '', email: '', handicap: 18 })

  const [openEdit, setOpenEdit] = useState(false)
  const [editing, setEditing] = useState<PlayerRow | null>(null)
  const [editForm, setEditForm] = useState<NewPlayer>({ firstname: '', lastname: '', phone: '', email: '', handicap: 18 })

  async function submit() {
    const emailRe = /.+@.+\..+/i
    if (!form.firstname.trim() || !form.lastname.trim() || !form.email || !emailRe.test(form.email) || form.handicap == null) {
      alert('Please complete all required fields. Email must be valid. Handicap defaults to 18 and is required.')
      return
    }
    await create({ firstname: form.firstname, lastname: form.lastname, email: form.email, phone: null, handicap: form.handicap })
    setOpen(false)
    setForm({ firstname: '', lastname: '', phone: '', email: '', handicap: 18 })
  }

  function beginEdit(p: PlayerRow) {
    setEditing(p)
    setEditForm({
      firstname: p.firstname,
      lastname: p.lastname,
      email: p.email ?? '',
      phone: p.phone ?? '',
      handicap: p.handicap ?? 18,
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
          <div key={p.playerid} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border rounded p-4 active:scale-[0.995] transition">
            <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
              <div className="font-medium truncate">{p.lastname}, {p.firstname}</div>
              <div className="text-xs text-muted-foreground">HC: {p.handicap ?? '-'}</div>
              <div className="text-xs text-muted-foreground break-words sm:break-normal">{p.email ?? ''}</div>
            </div>
            <div className="flex gap-2 sm:shrink-0 flex-wrap">
              <Button variant="outline" onClick={() => beginEdit(p)}>Edit</Button>
              <Button variant="destructive" onClick={() => { if (confirm('Delete this player?')) remove(p.playerid) }}>Delete</Button>
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
          </div>
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={saveEdit}>Save</Button>
          </div>
        </DialogContent>
      </Dialog>

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
    </div>
  )
}

