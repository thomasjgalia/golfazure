import { TableClient, odata } from '@azure/data-tables'

// Caches golfcourseapi.com course lookups so a course only ever needs to be
// fetched from the (rate-limited) upstream API once, no matter how many
// events end up using it. Single partition, RowKey = the upstream course id.
const TABLE_NAME = 'GolfCourseCache'
const PARTITION_KEY = 'course'

export type TeeOption = { label: string; numberOfHoles: number; parPerHole: number[] }

export type CachedCourse = {
  id: string
  name: string
  tees: TeeOption[]
  cachedAt: string
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

function toRecord(entity: any): CachedCourse {
  let tees: TeeOption[] = []
  try {
    tees = JSON.parse(entity.tees ?? '[]')
  } catch {
    tees = []
  }
  return {
    id: entity.rowKey,
    name: entity.name,
    tees,
    cachedAt: entity.cachedAt ?? null,
  }
}

export async function getCachedCourse(id: string): Promise<CachedCourse | null> {
  const client = await getClient()
  try {
    const entity = await client.getEntity(PARTITION_KEY, String(id))
    return toRecord(entity)
  } catch (err: any) {
    if (err.statusCode === 404) return null
    throw err
  }
}

export async function upsertCachedCourse(course: { id: string; name: string; tees: TeeOption[] }): Promise<void> {
  const client = await getClient()
  await client.upsertEntity(
    {
      partitionKey: PARTITION_KEY,
      rowKey: String(course.id),
      name: course.name,
      tees: JSON.stringify(course.tees ?? []),
      cachedAt: new Date().toISOString(),
    },
    'Replace'
  )
}

export async function listCachedCourses(): Promise<CachedCourse[]> {
  const client = await getClient()
  const out: CachedCourse[] = []
  for await (const entity of client.listEntities({ queryOptions: { filter: odata`PartitionKey eq ${PARTITION_KEY}` } })) {
    out.push(toRecord(entity))
  }
  out.sort((a, b) => a.name.localeCompare(b.name))
  return out
}
