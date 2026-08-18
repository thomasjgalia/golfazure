import { TableClient, odata } from '@azure/data-tables'

// A Zone is an isolated friend group - its own events/teams/scores, its own
// admins (see zoneMembershipTable.ts). Single partition, like Events/Teams -
// at this data volume a full-partition list costs nothing, and it keeps
// zoneid alone sufficient to look up a zone.
const TABLE_NAME = 'Zones'
const PARTITION_KEY = 'zone'

export type ZoneRecord = {
  zoneid: number
  name: string
  createdBy: number
  created_at: string | null
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

function toRecord(entity: any): ZoneRecord {
  return {
    zoneid: Number(entity.rowKey),
    name: entity.name,
    createdBy: Number(entity.createdBy),
    created_at: entity.createdAt ?? null,
  }
}

export async function listZones(): Promise<ZoneRecord[]> {
  const client = await getClient()
  const out: ZoneRecord[] = []
  for await (const entity of client.listEntities({ queryOptions: { filter: odata`PartitionKey eq ${PARTITION_KEY}` } })) {
    out.push(toRecord(entity))
  }
  return out
}

export async function getZone(id: number): Promise<ZoneRecord | null> {
  const client = await getClient()
  try {
    const entity = await client.getEntity(PARTITION_KEY, String(id))
    return toRecord(entity)
  } catch (err: any) {
    if (err.statusCode === 404) return null
    throw err
  }
}

export async function createZone(data: { name: string; createdBy: number }): Promise<ZoneRecord> {
  const client = await getClient()
  const existing = await listZones()
  const nextId = existing.reduce((max, z) => Math.max(max, z.zoneid), 0) + 1
  const now = new Date().toISOString()
  const fields = { name: data.name, createdBy: data.createdBy, createdAt: now }
  await client.createEntity({ partitionKey: PARTITION_KEY, rowKey: String(nextId), ...fields })
  return toRecord({ rowKey: String(nextId), ...fields })
}
