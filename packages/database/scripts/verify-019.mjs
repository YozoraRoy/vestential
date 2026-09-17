// Compute: does regenerating now reproduce the committed 019 byte-exact, given the disk folder file?
import fs from 'node:fs'

const folderFile = 'D:/PG/stock-platform/packages/database/migrations/019_analysis_jobs.sql'
const genFile = 'D:/PG/stock-platform/packages/database/src/generated/migrations.ts'

const diskExists = fs.existsSync(folderFile)
console.log('019 folder file exists on disk:', diskExists)
if (!diskExists) {
  console.log('EXIT: restore required first')
  process.exit(essment0)
}

const diskSql = fs.readFileSync(folderFile, 'utf8')

// Committed generated: extract the 019 entry's encoded sql string; compare re-encoding of diskSql.
const g = fs.readFileSync(genFile, 'utf8')
const needle = '{ name: "019_analysis_jobs.sql", sql: "'
const i = g.indexOf(needle)
if (i < 0) {
  console.log('EXIT: 019 not in committed generated (unexpected)')
  process.exit(1)
}
const rest = g.slice(i + needle.length)
const end = rest.indexOf('" }')
const committedEncoded = rest.slice(0, end)

const reEncoded = JSON.stringify(diskSql)
console.log('disk 019 length:', diskSql.length)
console.log('committed entry sql length (encoded):', committedEncoded.length)
console.log('re-encode of disk === committed entry?', reEncoded === committedEncoded)

// Also report whether the committed generated has a fixed set that README generator would produce the same for all other files
const names = [...g.matchAll(/name: "([0-9]{3}_[^"]+\.sql)"/g)].map((m) => m[1])
console.log('committed generated entry count:', names.length)
console.log('names:', names.join(', '))
