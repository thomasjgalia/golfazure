import { useNavigate, useParams } from 'react-router-dom'
import { useEvent } from '@/hooks/useEvents'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useState, useEffect } from 'react'
import type { EventRow } from '@/types'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import QRCode from 'react-qr-code'
import { api } from '@/lib/api'
import { toast } from 'sonner'

export default function EventDetailsPage() {
  const params = useParams()
  const id = Number(params.id)
  const { event, loading, setEvent } = useEvent(id)
  const nav = useNavigate()

  const [form, setForm] = useState<EventRow | null>(null)

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

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-semibold">Event Details</h1>
        <div className="flex gap-2">
          <Button variant={form.islocked ? 'secondary' : 'default'} onClick={() => setForm({ ...form, islocked: !form.islocked })}>{form.islocked ? 'Unlock' : 'Lock'}</Button>
          <Button onClick={save}>Save</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Name</Label>
          <Input value={form.eventname} onChange={(e) => setForm({ ...form, eventname: e.target.value })} />
        </div>
        <div>
          <Label>Date</Label>
          <Input type="date" value={form.eventdate} onChange={(e) => setForm({ ...form, eventdate: e.target.value })} />
        </div>
        <div>
          <Label>Course</Label>
          <Input value={form.coursename} onChange={(e) => setForm({ ...form, coursename: e.target.value })} />
        </div>
        <div>
          <Label>Tee</Label>
          <Input value={form.tees ?? ''} onChange={(e) => setForm({ ...form, tees: e.target.value })} />
        </div>
        <div>
          <Label>Format</Label>
          <Select value={form.format ?? undefined} onValueChange={(v) => setForm({ ...form, format: v as EventRow['format'] })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {['Scramble', 'Best Ball', 'Stroke Play', 'Match Play'].map((f) => (
                <SelectItem key={f} value={f}>{f}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Holes</Label>
          <Select value={String(form.numberofholes)} onValueChange={(v) => setForm({ ...form, numberofholes: Number(v) })}>
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
            {form.parperhole.map((p, i) => (
              <Input
                key={i}
                type="number"
                inputMode="numeric"
                className="px-2 py-1 text-center"
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
    </div>
  )
}
