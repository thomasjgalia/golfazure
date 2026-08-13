import { TableClient, odata } from '@azure/data-tables'

// Live-scoring hot path. PartitionKey = eventid (matches every read pattern -
// Scoring/Leaderboard/Scorecard pages all fetch by eventId). RowKey encodes
// team-or-player + hole, reproducing the exact uniqueness the old SQL MERGE
// relied on and giving upsert semantics for free via upsertEntity. Because
// different players/holes map to different RowKeys, concurrent entries for
// different cells never collide - only two people editing the exact same
// cell at once can race, and that's last-write-wins, same as the old
// unconditional MERGE.
const TABLE_NAME = 'Scores'

export type ScoreRecord = {
  scoreid: number
  eventid: number
  playerid: number | null
  teamid: number | null
  holenumber: number
  strokes: number | null
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

function rowKeyFor(teamid: number | null, playerid: number | null, holenumber: number): string {
  return playerid == null ? `team-${teamid}-h${holenumber}` : `player-${playerid}-h${holenumber}`
}

// scoreid isn't structurally needed (RowKey is the real identity), but the
// frontend type still expects a numeric field - derive a stable one from the
// RowKey rather than changing the frontend contract. Not read anywhere in
// the frontend beyond being present on the object (verified), so a simple
// deterministic hash is enough.
function syntheticScoreId(rowKey: string): number {
  let h = 0
  for (let i = 0; i < rowKey.length; i++) h = (h * 31 + rowKey.charCodeAt(i)) | 0
  return Math.abs(h)
}

function toRecord(entity: any): ScoreRecord {
  return {
    scoreid: syntheticScoreId(entity.rowKey),
    eventid: Number(entity.partitionKey),
    playerid: entity.playerid ?? null,
    teamid: entity.teamid ?? null,
    holenumber: entity.holenumber,
    strokes: entity.strokes ?? null,
    created_at: entity.createdAt ?? null,
    updated_at: entity.updatedAt ?? null,
  }
}

export async function listScores(eventid: number, teamid?: number): Promise<ScoreRecord[]> {
  const client = await getClient()
  const out: ScoreRecord[] = []
  for await (const entity of client.listEntities({ queryOptions: { filter: odata`PartitionKey eq ${String(eventid)}` } })) {
    const rec = toRecord(entity)
    if (teamid == null || rec.teamid === teamid) out.push(rec)
  }
  out.sort((a, b) => a.holenumber - b.holenumber)
  return out
}

export async function upsertScore(data: { eventid: number; playerid: number | null; teamid: number | null; holenumber: number; strokes: number | null }): Promise<ScoreRecord> {
  const client = await getClient()
  const now = new Date().toISOString()
  const rowKey = rowKeyFor(data.teamid, data.playerid, data.holenumber)

  const existing = await client.getEntity(String(data.eventid), rowKey).catch((err: any) => {
    if (err.statusCode === 404) return null
    throw err
  })

  const fields = {
    playerid: data.playerid,
    teamid: data.teamid,
    holenumber: data.holenumber,
    strokes: data.strokes,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }
  await client.upsertEntity({ partitionKey: String(data.eventid), rowKey, ...fields }, 'Replace')
  return toRecord({ partitionKey: String(data.eventid), rowKey, ...fields })
}

export async function deleteScore(eventid: number, mode: 'team' | 'player', playerOrTeamId: number, holenumber: number): Promise<void> {
  const client = await getClient()
  const rowKey = mode === 'team' ? `team-${playerOrTeamId}-h${holenumber}` : `player-${playerOrTeamId}-h${holenumber}`
  try {
    await client.deleteEntity(String(eventid), rowKey)
  } catch (err: any) {
    if (err.statusCode !== 404) throw err // deleting something already gone is a no-op, matches old SQL DELETE behavior
  }
}

// Deletes every score in an event's partition - used when the event itself
// is deleted, so scores don't get left behind as orphaned/unreachable data.
export async function deleteScoresForEvent(eventid: number): Promise<void> {
  const client = await getClient()
  for await (const entity of client.listEntities({ queryOptions: { filter: odata`PartitionKey eq ${String(eventid)}` } })) {
    await client.deleteEntity(entity.partitionKey as string, entity.rowKey as string)
  }
}

// Full-table scan across all events - only used for the "does this player
// have any recorded scores" delete-protection check, which is rare/admin-
// driven and fine to be O(all scores) at this data volume.
export async function anyScoreReferencesPlayer(playerid: number): Promise<boolean> {
  const client = await getClient()
  for await (const entity of client.listEntities()) {
    if (entity.playerid === playerid) return true
  }
  return false
}
