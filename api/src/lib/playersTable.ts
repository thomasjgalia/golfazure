import { TableClient, odata } from '@azure/data-tables'

// Players are stored in Azure Table Storage instead of SQL - this table is
// shared with the sister cornhole app, so the entity shape here must stay in
// sync with cornholeazure's equivalent module. See the migration plan for
// the reasoning (SQL free-tier auto-pause cold-start pain at a data volume
// that doesn't need a relational database).
const TABLE_NAME = 'Players'
const PARTITION_KEY = 'player'

export type PlayerRecord = {
  playerid: number
  firstname: string
  lastname: string
  email: string | null
  phone: string | null
  handicap: number | null
  profile_secret: string | null
  is_admin: boolean
  created_at: string | null
  updated_at: string | null
}

type StoredFields = {
  firstname: string
  lastname: string
  email: string | null
  phone: string | null
  handicap: number | null
  profileSecret: string | null
  isAdmin: boolean
  createdAt: string | null
  updatedAt: string | null
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
        if (err.statusCode !== 409) throw err // 409 = table already exists, fine
      }
      return client
    })()
  }
  return clientPromise
}

function toRecord(entity: any): PlayerRecord {
  return {
    playerid: Number(entity.rowKey),
    firstname: entity.firstname,
    lastname: entity.lastname,
    email: entity.email ?? null,
    phone: entity.phone ?? null,
    handicap: entity.handicap ?? null,
    profile_secret: entity.profileSecret ?? null,
    is_admin: !!entity.isAdmin,
    created_at: entity.createdAt ?? null,
    updated_at: entity.updatedAt ?? null,
  }
}

export async function listPlayers(): Promise<PlayerRecord[]> {
  const client = await getClient()
  const out: PlayerRecord[] = []
  for await (const entity of client.listEntities({ queryOptions: { filter: odata`PartitionKey eq ${PARTITION_KEY}` } })) {
    out.push(toRecord(entity))
  }
  out.sort((a, b) => a.lastname.localeCompare(b.lastname) || a.firstname.localeCompare(b.firstname))
  return out
}

export async function getPlayer(id: number): Promise<PlayerRecord | null> {
  const client = await getClient()
  try {
    const entity = await client.getEntity(PARTITION_KEY, String(id))
    return toRecord(entity)
  } catch (err: any) {
    if (err.statusCode === 404) return null
    throw err
  }
}

export async function getPlayersByIds(ids: number[]): Promise<PlayerRecord[]> {
  if (!ids.length) return []
  const client = await getClient()
  const rowKeyFilter = ids.map((id) => `RowKey eq '${id}'`).join(' or ')
  const out: PlayerRecord[] = []
  for await (const entity of client.listEntities({ queryOptions: { filter: `PartitionKey eq '${PARTITION_KEY}' and (${rowKeyFilter})` } })) {
    out.push(toRecord(entity))
  }
  return out
}

export async function createPlayer(data: {
  firstname: string
  lastname: string
  phone: string | null
  email: string | null
  handicap: number | null
  profile_secret: string | null
}): Promise<PlayerRecord> {
  const client = await getClient()
  const existing = await listPlayers()
  const nextId = existing.reduce((max, p) => Math.max(max, p.playerid), 0) + 1
  const now = new Date().toISOString()
  const fields: StoredFields = {
    firstname: data.firstname,
    lastname: data.lastname,
    email: data.email,
    phone: data.phone,
    handicap: data.handicap,
    profileSecret: data.profile_secret,
    isAdmin: false,
    createdAt: now,
    updatedAt: now,
  }
  await client.createEntity({ partitionKey: PARTITION_KEY, rowKey: String(nextId), ...fields })
  return toRecord({ rowKey: String(nextId), ...fields })
}

export async function updatePlayer(
  id: number,
  patch: Partial<{ firstname: string; lastname: string; phone: string | null; email: string | null; handicap: number | null; profile_secret: string | null }>
): Promise<PlayerRecord | null> {
  const client = await getClient()
  const current = await getPlayer(id)
  if (!current) return null

  const fields: StoredFields = {
    firstname: patch.firstname ?? current.firstname,
    lastname: patch.lastname ?? current.lastname,
    email: 'email' in patch ? patch.email ?? null : current.email,
    phone: 'phone' in patch ? patch.phone ?? null : current.phone,
    handicap: 'handicap' in patch ? patch.handicap ?? null : current.handicap,
    profileSecret: 'profile_secret' in patch ? patch.profile_secret ?? null : current.profile_secret,
    isAdmin: current.is_admin,
    createdAt: current.created_at,
    updatedAt: new Date().toISOString(),
  }
  await client.updateEntity({ partitionKey: PARTITION_KEY, rowKey: String(id), ...fields }, 'Replace')
  return toRecord({ rowKey: String(id), ...fields })
}

export async function deletePlayer(id: number): Promise<void> {
  const client = await getClient()
  await client.deleteEntity(PARTITION_KEY, String(id))
}
