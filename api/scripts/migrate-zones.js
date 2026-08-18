// One-time migration: introduces Zones. Creates Zone 1 ("Sons of Liberty"),
// backfills every existing Event with zoneid=1, and gives every existing
// Player a ZoneMembership row into zone 1 (role derived from their current
// isAdmin flag). Safe to re-run - every write is an upsert/conditional set.
//
// Usage (run from inside api/, where @azure/data-tables is installed):
//   node scripts/migrate-zones.js --dry-run              (preview only, no writes)
//   node scripts/migrate-zones.js                         (auto-picks the owner:
//                                                           lowest playerid with isAdmin=true)
//   node scripts/migrate-zones.js --owner=3                (explicit owner playerid)
//
// Needs AZURE_TABLES_CONNECTION_STRING set in the environment, or present in
// local.settings.json (this script reads that file automatically if the env
// var isn't already set) - same as import-players.js.

const fs = require('fs')
const path = require('path')
const { TableClient } = require('@azure/data-tables')

function loadConnectionString() {
  if (process.env.AZURE_TABLES_CONNECTION_STRING) return process.env.AZURE_TABLES_CONNECTION_STRING
  const settingsPath = path.join(__dirname, '..', 'local.settings.json')
  if (fs.existsSync(settingsPath)) {
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
    const value = settings?.Values?.AZURE_TABLES_CONNECTION_STRING
    if (value) return value
  }
  throw new Error('AZURE_TABLES_CONNECTION_STRING not found in environment or local.settings.json')
}

function parseArgs(argv) {
  const dryRun = argv.includes('--dry-run')
  const ownerArg = argv.find((a) => a.startsWith('--owner='))
  const owner = ownerArg ? Number(ownerArg.slice('--owner='.length)) : null
  return { dryRun, owner }
}

async function ensureTable(client) {
  try {
    await client.createTable()
  } catch (err) {
    if (err.statusCode !== 409) throw err
  }
}

async function main() {
  const { dryRun, owner } = parseArgs(process.argv.slice(2))
  const conn = loadConnectionString()

  const playersClient = TableClient.fromConnectionString(conn, 'Players')
  const eventsClient = TableClient.fromConnectionString(conn, 'Events')
  const zonesClient = TableClient.fromConnectionString(conn, 'Zones')
  const membershipClient = TableClient.fromConnectionString(conn, 'ZoneMembership')

  const players = []
  for await (const p of playersClient.listEntities({ queryOptions: { filter: `PartitionKey eq 'player'` } })) {
    players.push(p)
  }

  let ownerPlayerId = owner
  if (ownerPlayerId == null) {
    const admins = players
      .filter((p) => !!p.isAdmin)
      .map((p) => Number(p.rowKey))
      .sort((a, b) => a - b)
    if (admins.length === 0) {
      throw new Error('No player has isAdmin=true, and no --owner=<playerid> was given - pass one explicitly.')
    }
    ownerPlayerId = admins[0]
  }
  const ownerRow = players.find((p) => Number(p.rowKey) === ownerPlayerId)
  console.log(`Zone 1 owner: playerid=${ownerPlayerId}${ownerRow ? ` (${ownerRow.firstname} ${ownerRow.lastname})` : ' (not found in Players!)'}`)

  const events = []
  for await (const e of eventsClient.listEntities({ queryOptions: { filter: `PartitionKey eq 'event'` } })) {
    events.push(e)
  }
  const eventsNeedingZone = events.filter((e) => e.zoneid == null)

  console.log(`\nPlan:`)
  console.log(`  - Zone 1 "Sons of Liberty", createdBy=${ownerPlayerId}`)
  console.log(`  - ${eventsNeedingZone.length}/${events.length} event(s) will be set to zoneid=1`)
  console.log(`  - ${players.length} player(s) will get a ZoneMembership into zone 1`)
  console.log(`    (${players.filter((p) => !!p.isAdmin).length} as admin, ${players.filter((p) => !p.isAdmin).length} as member)`)

  if (dryRun) {
    console.log('\n--dry-run: no writes performed.')
    return
  }

  console.log('\nApplying...')

  await ensureTable(zonesClient)
  const now = new Date().toISOString()
  await zonesClient.upsertEntity(
    { partitionKey: 'zone', rowKey: '1', name: 'Sons of Liberty', createdBy: ownerPlayerId, createdAt: now },
    'Replace'
  )
  console.log('  Zone 1 "Sons of Liberty" created.')

  for (const e of eventsNeedingZone) {
    await eventsClient.updateEntity({ partitionKey: 'event', rowKey: e.rowKey, zoneid: 1 }, 'Merge')
  }
  console.log(`  ${eventsNeedingZone.length} event(s) backfilled with zoneid=1.`)

  await ensureTable(membershipClient)
  let memberCount = 0
  for (const p of players) {
    const playerid = Number(p.rowKey)
    await membershipClient.upsertEntity(
      {
        partitionKey: '1',
        rowKey: String(playerid),
        role: p.isAdmin ? 'admin' : 'member',
        joinedAt: now,
      },
      'Replace'
    )
    memberCount++
  }
  console.log(`  ${memberCount} ZoneMembership row(s) created for zone 1.`)

  console.log('\nDone.')
}

main().catch((err) => {
  console.error('Migration failed:', err.message)
  process.exit(1)
})
