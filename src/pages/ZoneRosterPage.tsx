import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { usePlayers } from '@/hooks/usePlayers'
import { useZoneMembers } from '@/hooks/useZones'
import { useAuth } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'

// Zone-admin-driven rostering: search the whole player directory first so
// the same real person never ends up as two disconnected identities across
// zones, and only fall into "create new" when nobody matches.
export default function ZoneRosterPage() {
  const params = useParams()
  const zoneid = Number(params.zoneId)
  const nav = useNavigate()
  const { zones } = useAuth()
  const zoneName = zones.find((z) => z.zoneid === zoneid)?.name ?? `Zone ${zoneid}`

  const { players: allPlayers } = usePlayers()
  const { members, loading, addExisting, addNew, updateRole, remove } = useZoneMembers(zoneid)

  const [query, setQuery] = useState('')
  const [newForm, setNewForm] = useState({ firstname: '', lastname: '', email: '', handicap: 18 as number | null, profile_secret: '' })
  const [removeTarget, setRemoveTarget] = useState<{ playerid: number; name: string } | null>(null)

  const memberIds = new Set((members ?? []).map((m) => m.playerid))
  const q = query.trim().toLowerCase()
  const matches = q.length >= 2
    ? (allPlayers ?? [])
        .filter((p) =>
          !memberIds.has(p.playerid) &&
          (`${p.firstname} ${p.lastname}`.toLowerCase().includes(q) || p.email?.toLowerCase().includes(q))
        )
        .slice(0, 8)
    : []

  async function handleAddExisting(playerid: number) {
    try {
      await addExisting(playerid)
      setQuery('')
    } catch (e: any) {
      toast.error(e.message || 'Failed to add player')
    }
  }

  async function handleAddNew() {
    if (!newForm.firstname.trim() || !newForm.lastname.trim()) {
      toast.error('First and last name required')
      return
    }
    try {
      await addNew({
        firstname: newForm.firstname.trim(),
        lastname: newForm.lastname.trim(),
        email: newForm.email || null,
        handicap: newForm.handicap,
        profile_secret: newForm.profile_secret || null,
      })
      setNewForm({ firstname: '', lastname: '', email: '', handicap: 18, profile_secret: '' })
    } catch (e: any) {
      toast.error(e.message || 'Failed to create player')
    }
  }

  async function handleUpdateRole(playerid: number, nextRole: 'admin' | 'member') {
    try {
      await updateRole(playerid, nextRole)
    } catch (e: any) {
      toast.error(e.message || 'Failed to update role')
    }
  }

  async function confirmRemove() {
    if (!removeTarget) return
    try {
      await remove(removeTarget.playerid)
    } catch (e: any) {
      toast.error(e.message || 'Failed to remove player')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => nav('/players')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-semibold">{zoneName} Roster</h1>
      </div>

      <div className="border rounded p-3 space-y-3">
        <div>
          <Label>Add an existing player</Label>
          <Input placeholder="Search by name or email..." value={query} onChange={(e) => setQuery(e.target.value)} />
          {matches.length > 0 && (
            <div className="border rounded mt-1 divide-y">
              {matches.map((p) => (
                <button
                  key={p.playerid}
                  type="button"
                  className="w-full text-left px-3 py-2 text-sm hover:bg-muted"
                  onClick={() => handleAddExisting(p.playerid)}
                >
                  {p.firstname} {p.lastname} {p.email && <span className="text-xs text-muted-foreground">({p.email})</span>}
                </button>
              ))}
            </div>
          )}
          {q.length >= 2 && matches.length === 0 && (
            <div className="text-xs text-muted-foreground mt-1">No existing players match "{query}" - create one below.</div>
          )}
        </div>

        <div className="border-t pt-3">
          <Label>Or create a new player</Label>
          <div className="grid grid-cols-2 gap-2 mt-1">
            <Input placeholder="First name" value={newForm.firstname} onChange={(e) => setNewForm({ ...newForm, firstname: e.target.value })} />
            <Input placeholder="Last name" value={newForm.lastname} onChange={(e) => setNewForm({ ...newForm, lastname: e.target.value })} />
            <Input placeholder="Email (optional)" value={newForm.email} onChange={(e) => setNewForm({ ...newForm, email: e.target.value })} />
            <Input type="number" step="0.1" placeholder="Handicap" value={newForm.handicap ?? ''} onChange={(e) => setNewForm({ ...newForm, handicap: e.target.value ? Number(e.target.value) : null })} />
            <Input className="col-span-2" placeholder="Profile secret (optional)" value={newForm.profile_secret} onChange={(e) => setNewForm({ ...newForm, profile_secret: e.target.value })} />
          </div>
          <Button className="mt-2" size="sm" onClick={handleAddNew}>Create &amp; Add</Button>
        </div>
      </div>

      <div className="space-y-2">
        {loading && <div className="text-sm text-muted-foreground">Loading...</div>}
        {members?.map((m) => (
          <div key={m.playerid} className="border rounded p-3 flex items-center justify-between gap-2">
            <div>
              <div className="font-medium">{m.firstname} {m.lastname}</div>
              <div className="text-xs text-muted-foreground">{m.role === 'admin' ? 'Admin' : 'Member'}</div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleUpdateRole(m.playerid, m.role === 'admin' ? 'member' : 'admin')}
              >
                {m.role === 'admin' ? 'Demote' : 'Promote'}
              </Button>
              <Button size="sm" variant="destructive" onClick={() => setRemoveTarget({ playerid: m.playerid, name: `${m.firstname} ${m.lastname}` })}>Remove</Button>
            </div>
          </div>
        ))}
        {members?.length === 0 && <div className="text-sm text-muted-foreground">No players in this zone yet.</div>}
      </div>

      <ConfirmDialog
        open={!!removeTarget}
        onOpenChange={(o) => { if (!o) setRemoveTarget(null) }}
        title="Remove from zone?"
        description={removeTarget ? `Remove ${removeTarget.name} from ${zoneName}? Their player record and history are kept.` : ''}
        confirmLabel="Remove"
        onConfirm={confirmRemove}
      />
    </div>
  )
}
