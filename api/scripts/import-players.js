// One-time migration script: reads a JSON export of the SQL `players` table
// and writes each row into the Table Storage `Players` table used by both
// golfazure and cornholeazure. Safe to re-run - each row is an upsert
// (createEntity with an existing rowKey fails, so we use upsertEntity).
//
// Usage (run from inside api/, where @azure/data-tables is installed):
//   node scripts/import-players.js ../migrate/players-data.json
//
// Needs AZURE_TABLES_CONNECTION_STRING set in the environment, or present in
// local.settings.json (this script reads that file automatically if the env
// var isn't already set).

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

async function main() {
  const inputPath = process.argv[2]
  if (!inputPath) {
    console.error('Usage: node scripts/import-players.js <path-to-players-data.json>')
    process.exit(1)
  }

  const rows = JSON.parse(fs.readFileSync(inputPath, 'utf8'))
  if (!Array.isArray(rows)) throw new Error('Expected the input file to contain a JSON array of player rows')

  const client = TableClient.fromConnectionString(loadConnectionString(), 'Players')
  try {
    await client.createTable()
  } catch (err) {
    if (err.statusCode !== 409) throw err
  }

  let count = 0
  for (const row of rows) {
    const entity = {
      partitionKey: 'player',
      rowKey: String(row.playerid),
      firstname: row.firstname ?? '',
      lastname: row.lastname ?? '',
      email: row.email ?? null,
      phone: row.phone ?? null,
      handicap: row.handicap ?? null,
      profileSecret: row.profile_secret ?? null,
      isAdmin: !!row.is_admin,
      createdAt: row.created_at ?? null,
      updatedAt: row.updated_at ?? null,
    }
    await client.upsertEntity(entity, 'Replace')
    count++
    console.log(`Imported playerid=${row.playerid} (${entity.firstname} ${entity.lastname})`)
  }

  console.log(`\nDone. Imported ${count} player(s) into the Players table.`)
}

main().catch((err) => {
  console.error('Import failed:', err.message)
  process.exit(1)
})
