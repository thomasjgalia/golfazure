import { useNavigate, useParams } from 'react-router-dom'
import { useEvent } from '@/hooks/useEvents'
import { useAuth } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useState, useEffect } from 'react'
import type { EventRow } from '@/types'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import QRCode from 'react-qr-code'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import CourseLookup from '@/components/CourseLookup'
import { statusBadgeClass } from '@/utils/format'

export default function EventDetailsPage() {
  const params = useParams()
  const id = Number(params.id)
  const { event, loading, setEvent } = useEvent(id)
  const nav = useNavigate()
  const { isAdmin } = useAuth()

  const [form, setForm] = useState<EventRow | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)

  useEffect(() => setForm(event ?? null), [event])

  if (loading) return <div>Loading...</div>
  if (!form) return <div>Event not found</div>

  async function save() {
    const formEl = form
    if (!formEl) return
    try {
      const data = await api.put<EventRow>(`/events/${id}`, {
        eventname: formEl.eventname,
        eventdate: formEl.eventdate,
        coursename: formEl.coursename,
        tees: formEl.tees,
        format: formEl.format,
        numberofholes: formEl.numberofholes,
        parperhole: formEl.parperhole,
        islocked: formEl.islocked,
        sharecode: formEl.sharecode,
        status: formEl.status,
      })
      setEvent(data)
      toast.success('Saved')
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  function setStatus(status: EventRow['status']) {
    // Marking an event Completed freezes scoring too - that's the point of
    // "done". Moving to Upcoming/In Progress leaves the lock as the admin
    // set it (Lock/Unlock stays a separate, manual control otherwise).
    setForm((f) => f && { ...f, status, islocked: status === 'Completed' ? true : f.islocked })
  }

  async function deleteEvent() {
    try {
      await api.del(`/events/${id}`)
      toast.success('Event deleted')
      nav('/events')
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete event')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center gap-2">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold">Event Details</h1>
          <Badge className={statusBadgeClass(form.status)}>{form.status}</Badge>
        </div>
        {isAdmin && (
        <div className="flex gap-2">
          <Button variant={form.islocked ? 'secondary' : 'default'} onClick={() => setForm({ ...form, islocked: !form.islocked })}>{form.islocked ? 'Unlock' : 'Lock'}</Button>
          <Button onClick={save}>Save</Button>
          <Button variant="destructive" onClick={() => setDeleteConfirmOpen(true)}>Delete</Button>
        </div>
        )}
      </div>

      {isAdmin && (
        <CourseLookup
          onApply={(fill) => setForm({ ...form, coursename: fill.coursename, tees: fill.tees, numberofholes: fill.numberofholes, parperhole: fill.parperhole })}
        />
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Name</Label>
          <Input disabled={!isAdmin} value={form.eventname} onChange={(e) => setForm({ ...form, eventname: e.target.value })} />
        </div>
        <div>
          <Label>Date</Label>
          <Input disabled={!isAdmin} type="date" value={form.eventdate} onChange={(e) => setForm({ ...form, eventdate: e.target.value })} />
        </div>
        <div>
          <Label>Course</Label>
          <Input disabled={!isAdmin} value={form.coursename} onChange={(e) => setForm({ ...form, coursename: e.target.value })} />
        </div>
        <div>
          <Label>Tee</Label>
          <Input disabled={!isAdmin} value={form.tees ?? ''} onChange={(e) => setForm({ ...form, tees: e.target.value })} />
        </div>
        <div>
          <Label>Status</Label>
          <Select disabled={!isAdmin} value={form.status} onValueChange={(v) => setStatus(v as EventRow['status'])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {['Upcoming', 'In Progress', 'Completed'].map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Format</Label>
          <Select disabled={!isAdmin} value={form.format ?? undefined} onValueChange={(v) => setForm({ ...form, format: v as EventRow['format'] })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {['Scramble', 'Best Ball', 'Stroke Play', 'Match Play', 'Stableford'].map((f) => (
                <SelectItem key={f} value={f}>{f}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Holes</Label>
          <Select disabled={!isAdmin} value={String(form.numberofholes)} onValueChange={(v) => setForm({ ...form, numberofholes: Number(v) })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="9">9</SelectItem>
              <SelectItem value="18">18</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-2">
          <Label>Par per hole</Label>
          <div className="grid grid-cols-9 gap-2 mt-2">
            {(Array.isArray(form.parperhole) ? form.parperhole : []).map((p, i) => (
              <Input
                key={i}
                type="number"
                inputMode="numeric"
                className="px-2 py-1 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                disabled={!isAdmin}
                value={p}
                onChange={(e) => {
                  const next = [...form.parperhole]
                  next[i] = Number(e.target.value || 4)
                  setForm({ ...form, parperhole: next })
                }}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div>
          <div className="text-sm text-muted-foreground">Share code</div>
          <div className="text-lg font-mono">{form.sharecode}</div>
        </div>
        <div className="bg-white p-3 rounded border">
          <QRCode value={window.location.origin + '/scoring?code=' + form.sharecode} size={96} />
        </div>
        <Button variant="outline" onClick={() => navigator.clipboard.writeText(window.location.origin + '/scoring?code=' + form.sharecode)}>Copy link</Button>
      </div>
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Delete event?"
        description="This cannot be undone."
        confirmLabel="Delete"
        onConfirm={deleteEvent}
      />
    </div>
  )
}
