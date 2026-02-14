import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '@/lib/api'
import type { EventRow } from '@/types'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export default function PublicScoringPage() {
  const [search] = useSearchParams()
  const codeParam = (search.get('code') || '').toUpperCase()
  const nav = useNavigate()
  const [code, setCode] = useState(codeParam)
  const [event, setEvent] = useState<EventRow | null>(null)

  useEffect(() => {
    ;(async () => {
      if (!codeParam) return
      try {
        const data = await api.get<EventRow>(`/events/sharecode/${codeParam}`)
        setEvent(data)
      } catch {
        setEvent(null)
      }
    })()
  }, [codeParam])

  async function lookup() {
    try {
      const data = await api.get<EventRow>(`/events/sharecode/${code.toUpperCase()}`)
      setEvent(data)
    } catch {
      setEvent(null)
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Public Scoring</h1>
      <div className="flex gap-2 max-w-md">
        <Input placeholder="Enter share code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
        <Button onClick={lookup}>Find Event</Button>
      </div>

      {event && (
        <div className="border rounded p-3">
          <div className="font-medium">{event.eventname}</div>
          <div className="text-sm text-muted-foreground">{event.coursename} • {event.eventdate}</div>
          <div className="mt-2">
            <Button onClick={() => nav(`/scoring?code=${event.sharecode}`)}>Open Scoring</Button>
          </div>
        </div>
      )}
    </div>
  )
}
