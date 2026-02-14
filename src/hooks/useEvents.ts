import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import type { EventRow, NewEvent } from '@/types'
import { toast } from 'sonner'

function normalizeEventRow(raw: any): EventRow {
  const holes = Number(raw?.numberofholes) || 18
  let par = raw?.parperhole
  if (typeof par === 'string') {
    try { par = JSON.parse(par) } catch { par = [] }
  }
  if (!Array.isArray(par)) par = []
  par = par.map((n: any) => Number(n) || 4)
  if (par.length !== holes) {
    const next = Array.from({ length: holes }, (_, i) => par[i] ?? 4)
    par = next
  }
  return { ...raw, parperhole: par } as EventRow
}

export function useEvents() {
  const [events, setEvents] = useState<EventRow[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function fetchAll() {
    setLoading(true)
    try {
      const data = await api.get<any[]>('/events')
      setEvents(data.map(normalizeEventRow))
    } catch (err: any) {
      setError(err.message)
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchAll()
  }, [])

  async function create(ev: NewEvent) {
    const data = await api.post<any>('/events', ev)
    const row = normalizeEventRow(data)
    setEvents((prev) => (prev ? [row, ...prev] : [row]))
    toast.success('Event created')
    return row
  }

  async function update(id: number, patch: Partial<EventRow>) {
    const data = await api.put<any>(`/events/${id}`, patch)
    const row = normalizeEventRow(data)
    setEvents((prev) => prev?.map((e) => (e.eventid === id ? row : e)) ?? null)
    toast.success('Event updated')
    return row
  }

  async function remove(id: number) {
    await api.del(`/events/${id}`)
    setEvents((prev) => prev?.filter((e) => e.eventid !== id) ?? null)
    toast.success('Event deleted')
  }

  return { events, loading, error, refresh: fetchAll, create, update, remove }
}

export function useEvent(id?: number) {
  const [event, setEvent] = useState<EventRow | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    ;(async () => {
      setLoading(true)
      try {
        const data = await api.get<any>(`/events/${id}`)
        setEvent(normalizeEventRow(data))
      } catch {
        setEvent(null)
      }
      setLoading(false)
    })()
  }, [id])

  return { event, loading, setEvent }
}
