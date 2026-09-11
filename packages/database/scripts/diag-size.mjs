import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import sql from 'mssql'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envAzure = join(__dirname, '..', '..', '..', 'apps', 'web', '.env.azure')

function loadDotenv(file) {
  try {
    const txt = readFileSync(file, 'utf8')
    const m = txt.match(/^DATABASE_URL\s*=\s*(.+)$/m)
    return m ? m[1].trim().replace(/^['"]|['"]$/g, '') : ''
  } catch {
    return ''
  }
}

const cfgStr = process.env.DATABASE_URL || loadDotenv(envAzure)
if (!cfgStr) {
  console.error('DATABASE_URL not found (checked process.env and .env.azure)')
  process.exit(2)
}

const cfg = {}
for (const pair of cfgStr.split(';')) {
  const idx = pair.indexOf('=')
  if (idx === -1) continue
  const k = pair.slice(0, idx).trim()
  let v = pair.slice(idx + 1).trim()
  if (k.length === 0) continue
  if (v.startsWith('{') && v.endsWith('}')) {
    try { v = JSON.parse(v) } catch { /* keep raw */ }
  }
  const lk = k.toLowerCase()
  if (lk === 'server') {
    let s = String(v).replace(/^tcp:/i, '')
    const comma = s.lastIndexOf(',')
    if (comma !== -1) {
      cfg.port = Number(s.slice(comma + 1))
      s = s.slice(0, comma)
    }
    cfg.server = s
  }
  else if (lk === 'database') cfg.database = v
  else if (lk === 'user id' || lk === 'uid' || lk === 'user') cfg.user = v
  else if (lk === 'password' || lk === 'pwd') cfg.password = v
  else if (lk === 'encrypt' || lk === 'trust server certificate') cfg.options = cfg.options || {}
}
cfg.options = cfg.options || {}
cfg.options.encrypt = true
cfg.options.trustServerCertificate = false
cfg.requestTimeout = 60000
cfg.connectionTimeout = 30000

let pool
try {
  pool = await sql.connect(cfg)
} catch (e) {
  console.error('CONNECT FAILED:', e.message)
  process.exit(1)
}

async function q(label, text) {
  console.log('\n== ' + label + ' ==')
  try {
    const r = await pool.request().query(text)
    console.table(r.recordset)
  } catch (e) {
    console.error('QUERY FAILED:', e.message)
  }
}

await q('DATABASE SIZE (MB)', `
  SELECT d.name,
         CAST(d.size/128.0 AS decimal(10,2)) AS size_mb,
         CAST(FILEPROPERTY(d.name,'SpaceUsed')/128.0 AS decimal(10,2)) AS space_used_mb,
         CAST(d.max_size/128.0 AS decimal(10,2)) AS max_size_mb,
         d.type_desc
  FROM sys.database_files d
`)

await q('TOP TABLES BY STORAGE', `
  SELECT t.name AS table_name,
         SUM(a.total_pages)*8/1024 AS total_mb,
         SUM(a.used_pages)*8/1024 AS used_mb,
         SUM(CASE WHEN a.type = 1 THEN a.total_pages ELSE 0 END)*8/1024 AS data_mb,
         SUM(CASE WHEN a.type = 2 THEN a.total_pages ELSE 0 END)*8/1024 AS index_mb
  FROM sys.tables t
  JOIN sys.indexes i ON t.object_id = i.object_id
  JOIN sys.partitions p ON i.object_id = p.object_id AND i.index_id = p.index_id
  JOIN sys.allocation_units a ON p.partition_id = a.container_id
  WHERE t.is_ms_shipped = 0
  GROUP BY t.name
  ORDER BY used_mb DESC
`)

await q('ROW COUNTS (tables > 10MB)', `
  DECLARE @t TABLE (name sysname, mb decimal(10,2))
  INSERT INTO @t
    SELECT t.name, SUM(a.total_pages)*8/1024
    FROM sys.tables t
    JOIN sys.indexes i ON t.object_id = i.object_id
    JOIN sys.partitions p ON i.object_id = p.object_id AND i.index_id = p.index_id
    JOIN sys.allocation_units a ON p.partition_id = a.container_id
    WHERE t.is_ms_shipped = 0
    GROUP BY t.name
    HAVING SUM(a.total_pages)*8 > 10240
  DECLARE @sql nvarchar(max) = N''
  SELECT @sql = STRING_AGG('SELECT ''' + name + ''' AS tbl, COUNT(*) AS rows FROM [' + name + ']', N' UNION ALL ')
  FROM @t
  EXEC sp_executesql @sql
`)

await pool.close()
console.log('\nDONE (read-only diagnostics)')
process.exit(0)