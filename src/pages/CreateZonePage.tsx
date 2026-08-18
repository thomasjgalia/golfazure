import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { ArrowLeft } from 'lucide-react'

// Self-service, no approval step: any claimed player can create their own
// zone and becomes its first (and, at first, only) admin.
export default function CreateZonePage() {
  const nav = useNavigate()
  const { refreshZones } = useAuth()
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleCreate() {
    if (!name.trim()) {
      toast.error('Please enter a zone name')
      return
    }
    setLoading(true)
    try {
      const zone = await api.post<{ zoneid: number; name: string }>('/zones', { name: name.trim() })
      await refreshZones(zone.zoneid)
      toast.success(`"${zone.name}" created`)
      nav('/events')
    } catch (e: any) {
      toast.error(e.message || 'Failed to create zone')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-md mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => nav(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-semibold">Create a Zone</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New Zone</CardTitle>
          <CardDescription>
            A zone is your own isolated group - its own events, teams, and scores, separate from any other zone.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="zone-name">Zone name</Label>
            <Input
              id="zone-name"
              placeholder="e.g. Friday Foursome"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
          </div>
          <Button className="w-full" onClick={handleCreate} disabled={loading}>
            {loading ? 'Creating...' : 'Create Zone'}
          </Button>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground text-center">
        You'll be the admin of this zone. <Link to="/players" className="underline">Head to Players</Link> once it's created to add people to it.
      </p>
    </div>
  )
}
