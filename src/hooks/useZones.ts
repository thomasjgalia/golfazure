import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import type { PlayerRow, ZoneMembershipRow, ZoneRole } from '@/types'
import { toast } from 'sonner'

export function useMyZones() {
  const [zones, setZones] = useState<ZoneMembershipRow[] | null>(null)
  const [loading, setLoading] = useState(true)

  async function fetchAll() {
    setLoading(true)
    try {
      const data = await api.get<ZoneMembershipRow[]>('/zones/mine')
      setZones(data)
    } catch {
      setZones(null)
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchAll()
  }, [])

  async function createZone(name: string) {
    const data = await api.post<{ zoneid: number; name: string }>('/zones', { name })
    await fetchAll()
    toast.success('Zone created')
    return data
  }

  return { zones, loading, refresh: fetchAll, createZone }
}

export type ZoneMember = PlayerRow & { role: ZoneRole; joined_at: string | null }

type NewZoneMember = {
  firstname: string
  lastname: string
  email?: string | null
  phone?: string | null
  handicap?: number | null
  profile_secret?: string | null
}

export function useZoneMembers(zoneid?: number) {
  const [members, setMembers] = useState<ZoneMember[] | null>(null)
  const [loading, setLoading] = useState(true)

  async function fetchAll() {
    if (!zoneid) return
    setLoading(true)
    try {
      const data = await api.get<ZoneMember[]>(`/zones/${zoneid}/members`)
      setMembers(data)
    } catch {
      setMembers(null)
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoneid])

  async function addExisting(playerid: number) {
    await api.post(`/zones/${zoneid}/members`, { playerid })
    await fetchAll()
    toast.success('Player added to zone')
  }

  async function addNew(fields: NewZoneMember) {
    await api.post(`/zones/${zoneid}/members`, fields)
    await fetchAll()
    toast.success('Player created and added to zone')
  }

  async function updateRole(playerid: number, role: ZoneRole) {
    await api.put(`/zones/${zoneid}/members/${playerid}`, { role })
    await fetchAll()
    toast.success('Role updated')
  }

  async function remove(playerid: number) {
    await api.del(`/zones/${zoneid}/members/${playerid}`)
    await fetchAll()
    toast.success('Player removed from zone')
  }

  return { members, loading, refresh: fetchAll, addExisting, addNew, updateRole, remove }
}
