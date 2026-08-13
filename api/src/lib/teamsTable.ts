import { TableClient, odata } from '@azure/data-tables'

// Single partition, like Players/Events - keeps teamid alone sufficient to
// look up/update/delete a team, matching the existing API contract (the
// frontend never sends eventid on update/delete). At this data volume a
// full-partition scan+filter for "teams in event X" costs nothing.
const TABLE_NAME = 'Teams'
const PARTITION_KEY = 'team'

export type TeamPlayers = { player1?: number; player2?: number; player3?: number; player4?: number }

export type TeamRecord = {
  teamid: number
  eventid: number
  teamname: string
  players: TeamPlayers
  startinghole: number | null
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

function toRecord(entity: any): TeamRecord {
  let players: TeamPlayers = {}
  try {
    players = JSON.parse(entity.players ?? '{}')
  } catch {
    players = {}
  }
  return {
    teamid: Number(entity.rowKey),
    eventid: Number(entity.eventid),
    teamname: entity.teamname,
    players,
    startinghole: entity.startinghole ?? null,
    created_at: entity.createdAt ?? null,
    updated_at: entity.updatedAt ?? null,
  }
}

export async function listAllTeams(): Promise<TeamRecord[]> {
  const client = await getClient()
  const out: TeamRecord[] = []
  for await (const entity of client.listEntities({ queryOptions: { filter: odata`PartitionKey eq ${PARTITION_KEY}` } })) {
    out.push(toRecord(entity))
  }
  return out
}

export async function listTeamsByEvent(eventid: number): Promise<TeamRecord[]> {
  const all = await listAllTeams()
  return all.filter((t) => t.eventid === eventid).sort((a, b) => a.teamname.localeCompare(b.teamname))
}

export async function getTeam(teamid: number): Promise<TeamRecord | null> {
  const client = await getClient()
  try {
    const entity = await client.getEntity(PARTITION_KEY, String(teamid))
    return toRecord(entity)
  } catch (err: any) {
    if (err.statusCode === 404) return null
    throw err
  }
}

export async function createTeam(data: { eventid: number; teamname: string; players: TeamPlayers; startinghole: number | null }): Promise<TeamRecord> {
  const client = await getClient()
  const existing = await listAllTeams()
  const nextId = existing.reduce((max, t) => Math.max(max, t.teamid), 0) + 1
  const now = new Date().toISOString()
  const fields = {
    eventid: data.eventid,
    teamname: data.teamname,
    players: JSON.stringify(data.players ?? {}),
    startinghole: data.startinghole,
    createdAt: now,
    updatedAt: now,
  }
  await client.createEntity({ partitionKey: PARTITION_KEY, rowKey: String(nextId), ...fields })
  return toRecord({ rowKey: String(nextId), ...fields })
}

export async function updateTeam(
  teamid: number,
  patch: Partial<{ teamname: string; players: TeamPlayers; startinghole: number | null }>
): Promise<TeamRecord | null> {
  const client = await getClient()
  const current = await getTeam(teamid)
  if (!current) return null

  const fields = {
    eventid: current.eventid,
    teamname: patch.teamname ?? current.teamname,
    players: JSON.stringify(patch.players ?? current.players ?? {}),
    startinghole: 'startinghole' in patch ? patch.startinghole ?? null : current.startinghole,
    createdAt: current.created_at,
    updatedAt: new Date().toISOString(),
  }
  await client.updateEntity({ partitionKey: PARTITION_KEY, rowKey: String(teamid), ...fields }, 'Replace')
  return toRecord({ rowKey: String(teamid), ...fields })
}

export async function deleteTeam(teamid: number): Promise<void> {
  const client = await getClient()
  await client.deleteEntity(PARTITION_KEY, String(teamid))
}

// Deletes every team belonging to an event - used when the event itself is
// deleted, so teams don't get left behind as orphaned/unreachable data.
export async function deleteTeamsForEvent(eventid: number): Promise<void> {
  const client = await getClient()
  const teams = await listTeamsByEvent(eventid)
  for (const t of teams) {
    await client.deleteEntity(PARTITION_KEY, String(t.teamid))
  }
}
