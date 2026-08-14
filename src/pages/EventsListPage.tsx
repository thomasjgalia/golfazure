import { useMemo, useState } from 'react'
import { useEvents } from '@/hooks/useEvents'
import type { EventRow, NewEvent } from '@/types'
import { useAuth } from '@/lib/auth'
import { useBottomBar } from '@/lib/bottomBar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogFooter as DFooter, DialogClose } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatDate } from '@/utils/format'
import { Link } from 'react-router-dom'
import { generateShareCode } from '@/utils/shareCode'
import QRCode from 'react-qr-code'
import { toast } from 'sonner'
import CourseLookup from '@/components/CourseLookup'

const defaultPar = (holes: number) => Array.from({ length: holes }, () => 4)

export default function EventsListPage() {
  const { events, loading, create } = useEvents()
  const { isAdmin } = useAuth()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<NewEvent>(() => ({
    eventname: '',
    eventdate: new Date().toISOString().slice(0, 10),
    coursename: '',
    tees: null,
    format: 'Stroke Play',
    numberofholes: 18,
    parperhole: defaultPar(18),
    islocked: false,
    sharecode: generateShareCode(6),
    status: 'Upcoming',
  }))

  const onHolesChange = (n: number) => {
    setForm((f) => ({ ...f, numberofholes: n, parperhole: defaultPar(n) }))
  }

  async function onSubmit() {
    if (!form.eventname || !form.coursename) return
    try {
      await create(form)
      setOpen(false)
    } catch (e: any) {
      toast.error(e.message || 'Failed to create event')
    }
  }

  const bottomBarNode = useMemo(() => {
    if (!isAdmin) return null
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <div className="grid grid-cols-1">
          <DialogTrigger asChild>
            <Button>Create Event</Button>
          </DialogTrigger>
        </div>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Event</DialogTitle>
            <DialogDescription>Configure event details</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Event name</Label>
                <Input value={form.eventname} onChange={(e) => setForm({ ...form, eventname: e.target.value })} />
              </div>
              <div>
                <Label>Date</Label>
                <Input type="date" value={form.eventdate} onChange={(e) => setForm({ ...form, eventdate: e.target.value })} />
              </div>
            </div>
            <CourseLookup
              onApply={(fill) => setForm({ ...form, coursename: fill.coursename, tees: fill.tees, numberofholes: fill.numberofholes, parperhole: fill.parperhole })}
            />
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Course</Label>
                <Input value={form.coursename} onChange={(e) => setForm({ ...form, coursename: e.target.value })} />
              </div>
              <div>
                <Label>Tee color</Label>
                <Input value={form.tees ?? ''} onChange={(e) => setForm({ ...form, tees: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Format</Label>
                <Select value={form.format ?? undefined} onValueChange={(v) => setForm({ ...form, format: v as EventRow['format'] })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select format" />
                  </SelectTrigger>
                  <SelectContent>
                    {['Scramble', 'Best Ball', 'Stroke Play', 'Match Play', 'Stableford'].map((f) => (
                      <SelectItem key={f} value={f}>{f}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Holes</Label>
                <Select value={String(form.numberofholes)} onValueChange={(v) => onHolesChange(Number(v))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="9">9</SelectItem>
                    <SelectItem value="18">18</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as EventRow['status'] })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {['Upcoming', 'In Progress', 'Completed'].map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Par per hole</Label>
              <div className="grid grid-cols-9 gap-2 mt-2">
                {(Array.isArray(form.parperhole) ? form.parperhole : []).map((p, i) => (
                  <Input key={i} type="number" className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" value={p} onChange={(e) => {
                    const next = [...form.parperhole]
                    next[i] = Number(e.target.value || 4)
                    setForm({ ...form, parperhole: next })
                  }} />
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Share code</Label>
                <Input value={form.sharecode} onChange={(e) => setForm({ ...form, sharecode: e.target.value.toUpperCase() })} />
              </div>
              <div className="flex items-end gap-2">
                <Button type="button" variant="outline" onClick={() => setForm({ ...form, sharecode: generateShareCode(6) })}>Regenerate</Button>
                <div className="bg-white p-2 rounded border"><QRCode value={window.location.origin + '/scoring?code=' + form.sharecode} size={64} /></div>
              </div>
            </div>
          </div>
          <DFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={onSubmit}>Create</Button>
          </DFooter>
        </DialogContent>
      </Dialog>
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, open, form])

  useBottomBar(bottomBarNode)

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Events</h1>

      {loading && <div>Loading...</div>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {events?.map((ev) => (
          <Card key={ev.eventid} className="active:scale-[0.995] transition">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="flex items-center justify-between text-base">
                <span>{ev.eventname}</span>
                <span className="text-xs font-normal text-muted-foreground">{ev.status}</span>
              </CardTitle>
              <CardDescription>{ev.coursename} • {formatDate(ev.eventdate)}</CardDescription>
            </CardHeader>
            <CardContent className="px-4 pb-2 pt-0 text-sm">
              <div className="flex items-center justify-between">
                <div>Holes: {ev.numberofholes}</div>
                <div>Tees: {ev.tees ?? '-'}</div>
              </div>
              <div className="mt-1">Format: {ev.format ?? '-'}</div>
              <div className="mt-1 text-xs text-muted-foreground">Share code: {ev.sharecode}</div>
            </CardContent>
            <CardFooter className="p-4 pt-2">
              <div className="grid grid-cols-2 gap-2 w-full">
                <Button asChild variant="outline" size="sm"><Link to={`/events/${ev.eventid}`}>Details</Link></Button>
                <Button asChild variant="outline" size="sm"><Link to={`/events/${ev.eventid}/teams`}>Teams</Link></Button>
                <Button asChild variant="outline" size="sm"><Link to={`/events/${ev.eventid}/scoring`}>Scoring</Link></Button>
                <Button asChild variant="outline" size="sm"><Link to={`/leaderboard?eventId=${ev.eventid}`}>Leaderboard</Link></Button>
              </div>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  )
}
