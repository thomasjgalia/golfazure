import { TableClient, odata } from '@azure/data-tables'

// Join table between Players (shared/global) and Zones (isolated friend
// groups). PartitionKey = zoneid, RowKey = playerid - this is deliberate:
// "who's in zone X, what's player Y's role" is checked on nearly every
// zone-scoped request once auth becomes zone-aware, so it needs to be a
// direct getEntity/partition-scan, not a full-table filter.
const TABLE_NAME = 'ZoneMembership'

export type Role = 'admin' | 'member'

export type MembershipRecord = {
  zoneid: number
  playerid: number
  role: Role
  joined_at: string | null
}

let clientPromise: Promise<TableClient> | null = null

function getClient(): Promise<TableClient> {
  if (!clientPromise) {
    clientPromise = (async () => {
      const conn = process.env.AZURE_TABLES_CONNECTION_STRING
      if (!conn) throw new Error('AZURE_TABLES_CONNECTION_STRING is not configured')
      const client = TableClient.fromConnectionString(conn, TABLE_NAME)
      try {
        await client.createTable()
      } catch (err: any) {
        if (err.statusCode !== 409) throw err
      }
      return client
    })()
  }
  return clientPromise
}

function toRecord(entity: any): MembershipRecord {
  return {
    zoneid: Number(entity.partitionKey),
    playerid: Number(entity.rowKey),
    role: entity.role === 'admin' ? 'admin' : 'member',
    joined_at: entity.joinedAt ?? null,
  }
}

export async function getMembership(zoneid: number, playerid: number): Promise<MembershipRecord | null> {
  const client = await getClient()
  try {
    const entity = await client.getEntity(String(zoneid), String(playerid))
    return toRecord(entity)
  } catch (err: any) {
    if (err.statusCode === 404) return null
    throw err
  }
}

export async function listMembers(zoneid: number): Promise<MembershipRecord[]> {
  const client = await getClient()
  const out: MembershipRecord[] = []
  for await (const entity of client.listEntities({ queryOptions: { filter: odata`PartitionKey eq ${String(zoneid)}` } })) {
    out.push(toRecord(entity))
  }
  return out
}

// Full-table scan - only used for "what zones is this player in" (zone
// switcher, cross-zone admin checks), an on-demand read rather than a hot
// path, so O(all memberships) is fine at this data volume - same accepted
// pattern as listAllScores/anyScoreReferencesPlayer in scoresTable.ts.
export async function listZonesForPlayer(playerid: number): Promise<MembershipRecord[]> {
  const client = await getClient()
  const out: MembershipRecord[] = []
  for await (const entity of client.listEntities({ queryOptions: { filter: odata`RowKey eq ${String(playerid)}` } })) {
    out.push(toRecord(entity))
  }
  return out
}

export async function isAdminOfAnyZone(playerid: number): Promise<boolean> {
  const zones = await listZonesForPlayer(playerid)
  return zones.some((z) => z.role === 'admin')
}

export async function upsertMembership(data: { zoneid: number; playerid: number; role: Role }): Promise<MembershipRecord> {
  const client = await getClient()
  const existing = await getMembership(data.zoneid, data.playerid)
  const fields = { role: data.role, joinedAt: existing?.joined_at ?? new Date().toISOString() }
  await client.upsertEntity({ partitionKey: String(data.zoneid), rowKey: String(data.playerid), ...fields }, 'Replace')
  return toRecord({ partitionKey: String(data.zoneid), rowKey: String(data.playerid), ...fields })
}

export async function deleteMembership(zoneid: number, playerid: number): Promise<void> {
  const client = await getClient()
  try {
    await client.deleteEntity(String(zoneid), String(playerid))
  } catch (err: any) {
    if (err.statusCode !== 404) throw err
  }
}
