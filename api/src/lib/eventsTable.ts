import { TableClient, odata } from '@azure/data-tables'

const TABLE_NAME = 'Events'
const PARTITION_KEY = 'event'

export type EventRecord = {
  eventid: number
  eventname: string
  eventdate: string
  coursename: string
  tees: string | null
  format: string | null
  numberofholes: number
  parperhole: number[]
  islocked: boolean
  status: string
  // Optional for now - existing rows predate Zones and won't have this until
  // the migration script backfills them into Zone 1. Every new event created
  // once zones.ts lands will always supply it (see the rollout plan).
  zoneid?: number
  created_at: string | null
  updated_at: string | null
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

function toRecord(entity: any): EventRecord {
  let parperhole: number[] = []
  try {
    parperhole = JSON.parse(entity.parperhole ?? '[]')
  } catch {
    parperhole = []
  }
  return {
    eventid: Number(entity.rowKey),
    eventname: entity.eventname,
    eventdate: entity.eventdate,
    coursename: entity.coursename,
    tees: entity.tees ?? null,
    format: entity.format ?? null,
    numberofholes: entity.numberofholes,
    parperhole,
    islocked: !!entity.islocked,
    status: entity.status,
    zoneid: entity.zoneid ?? undefined,
    created_at: entity.createdAt ?? null,
    updated_at: entity.updatedAt ?? null,
  }
}

function toStoredFields(data: Partial<Omit<EventRecord, 'eventid' | 'created_at' | 'updated_at'>>) {
  const fields: Record<string, any> = { ...data }
  if ('parperhole' in fields) fields.parperhole = JSON.stringify(fields.parperhole ?? [])
  return fields
}

export async function listEvents(): Promise<EventRecord[]> {
  const client = await getClient()
  const out: EventRecord[] = []
  for await (const entity of client.listEntities({ queryOptions: { filter: odata`PartitionKey eq ${PARTITION_KEY}` } })) {
    out.push(toRecord(entity))
  }
  out.sort((a, b) => (a.eventdate < b.eventdate ? 1 : a.eventdate > b.eventdate ? -1 : 0))
  return out
}

export async function getEvent(id: number): Promise<EventRecord | null> {
  const client = await getClient()
  try {
    const entity = await client.getEntity(PARTITION_KEY, String(id))
    return toRecord(entity)
  } catch (err: any) {
    if (err.statusCode === 404) return null
    throw err
  }
}

export async function createEvent(data: Omit<EventRecord, 'eventid' | 'created_at' | 'updated_at'>): Promise<EventRecord> {
  const client = await getClient()
  const existing = await listEvents()
  const nextId = existing.reduce((max, e) => Math.max(max, e.eventid), 0) + 1
  const now = new Date().toISOString()
  const fields = { ...toStoredFields(data), createdAt: now, updatedAt: now }
  await client.createEntity({ partitionKey: PARTITION_KEY, rowKey: String(nextId), ...fields })
  return toRecord({ rowKey: String(nextId), ...fields })
}

export async function updateEvent(id: number, patch: Partial<Omit<EventRecord, 'eventid' | 'created_at' | 'updated_at'>>): Promise<EventRecord | null> {
  const client = await getClient()
  const current = await getEvent(id)
  if (!current) return null

  const { eventid: _id, created_at, updated_at: _updatedAt, ...currentFields } = current
  const merged = { ...currentFields, ...patch }
  const fields = { ...toStoredFields(merged), createdAt: created_at, updatedAt: new Date().toISOString() }
  await client.updateEntity({ partitionKey: PARTITION_KEY, rowKey: String(id), ...fields }, 'Replace')
  return toRecord({ rowKey: String(id), ...fields })
}

export async function deleteEvent(id: number): Promise<void> {
  const client = await getClient()
  await client.deleteEntity(PARTITION_KEY, String(id))
}
