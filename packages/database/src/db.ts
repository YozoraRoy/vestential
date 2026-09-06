import Database from 'better-sqlite3'
import sql from 'mssql'
import { existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MIGRATIONS } from './generated/migrations.js'
import { SEED_TRADES, SEED_GIFTS } from './seed-data.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, '..', 'data')
const DB_PATH = process.env.DATABASE_PATH || join(DATA_DIR, 'stock.db')

// ─── Backend detection ───────────────────────────────────────────
const DATABASE_URL = process.env.DATABASE_URL || ''
const isAzureSql = DATABASE_URL.length > 0

// ─── SQLite (local) ──────────────────────────────────────────────
let _db: Database.Database | null = null
let _dbFailed = false

// ─── Azure SQL (cloud) ───────────────────────────────────────────
let _pool: sql.ConnectionPool | null = null
let _poolFailed = false

// ─── Shared state ────────────────────────────────────────────────
let _giftsSeeded = false
let _oddLotSeeded = false
const memoryStore: AnalysisRecord[] = []
let memoryIdCounter = 1
const portfolioMemoryStore: PortfolioRecord[] = []
let portfolioMemoryIdCounter = 1

// ─── SQLite connection ───────────────────────────────────────────
function getSqliteDb(): Database.Database | null {
  if (_db) return _db
  if (_dbFailed) return null

  try {
    const dbDir = dirname(DB_PATH)
    if (!existsSync(dbDir)) {
      mkdirSync(dbDir, { recursive: true })
    }

    _db = new Database(DB_PATH)
    _db.pragma('journal_mode = WAL')
    _db.pragma('foreign_keys = ON')

    _db.exec(`
      CREATE TABLE IF NOT EXISTS odd_lot_trades (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        stock_id TEXT NOT NULL,
        stock_name TEXT NOT NULL,
        price REAL,
        volume INTEGER,
        bid_price REAL,
        bid_volume INTEGER,
        ask_price REAL,
        ask_volume INTEGER,
        UNIQUE(date, stock_id)
      );
      CREATE TABLE IF NOT EXISTS shareholder_gifts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        stock_id TEXT NOT NULL,
        stock_name TEXT NOT NULL,
        meeting_date TEXT,
        last_buy_date TEXT,
        gift_name TEXT,
        gift_status TEXT,
        claim_rule TEXT,
        claim_rule_source TEXT,
        mops_gift_text TEXT,
        mops_meeting_date TEXT,
        mops_source_url TEXT,
        mops_updated_at TEXT,
        distribution_method TEXT,
        distribution_location TEXT,
        source_url TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(stock_id, meeting_date)
      );
    `)

    let countRow: { cnt: number } | undefined
    try {
      countRow = _db.prepare("SELECT count(*) as cnt FROM odd_lot_trades").get() as { cnt: number }
    } catch (_) {}

    if (!countRow || countRow.cnt < 50) {
      console.log(`[SQLite] Auto populating ${SEED_TRADES.length} trades and ${SEED_GIFTS.length} gifts...`)

      const insertTrade = _db.prepare(`
        INSERT OR REPLACE INTO odd_lot_trades (date, stock_id, stock_name, price, volume, bid_price, bid_volume, ask_price, ask_volume)
        VALUES (@date, @stock_id, @stock_name, @price, @volume, @bid_price, @bid_volume, @ask_price, @ask_volume)
      `)
      const insertGift = _db.prepare(`
        INSERT OR REPLACE INTO shareholder_gifts (stock_id, stock_name, meeting_date, last_buy_date, gift_name, distribution_method, distribution_location, source_url)
        VALUES (@stock_id, @stock_name, @meeting_date, @last_buy_date, @gift_name, @distribution_method, @distribution_location, @source_url)
      `)

      const populateTx = _db.transaction(() => {
        for (const trade of SEED_TRADES) insertTrade.run(trade)
        for (const gift of SEED_GIFTS) insertGift.run(gift)
      })
      populateTx()

      const checkCount = _db.prepare("SELECT count(*) as cnt FROM odd_lot_trades").get() as { cnt: number }
      console.log(`[SQLite] Seeded! Total trades: ${checkCount?.cnt || 0}`)
    }

    _db.exec(`
      CREATE TABLE IF NOT EXISTS historical_shareholder_gifts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        stock_id TEXT NOT NULL,
        stock_name TEXT,
        year INTEGER NOT NULL,
        gift_name TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(stock_id, year)
      );
      CREATE TABLE IF NOT EXISTS analysis_records (
        id                   INTEGER PRIMARY KEY AUTOINCREMENT,
        ticker               TEXT    NOT NULL,
        recommendation       TEXT    NOT NULL,
        summary              TEXT,
        full_report_json     TEXT    NOT NULL,
        model_usage          TEXT,
        primary_models       TEXT,
        fallback_used        TEXT,
        fallback_count       INTEGER DEFAULT 0,
        created_at           TEXT    DEFAULT (datetime('now', 'localtime'))
      );
      CREATE INDEX IF NOT EXISTS idx_analysis_ticker ON analysis_records(ticker);
      CREATE INDEX IF NOT EXISTS idx_analysis_created ON analysis_records(created_at);
      CREATE INDEX IF NOT EXISTS idx_historical_gifts_stock ON historical_shareholder_gifts(stock_id);
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT,
        display_name TEXT,
        avatar_url TEXT,
        created_at TEXT DEFAULT (datetime('now', 'localtime'))
      );
      CREATE TABLE IF NOT EXISTS user_identities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        provider TEXT NOT NULL,
        provider_user_id TEXT NOT NULL,
        provider_email TEXT,
        created_at TEXT DEFAULT (datetime('now', 'localtime')),
        UNIQUE(provider, provider_user_id)
      );
      CREATE INDEX IF NOT EXISTS idx_identities_user ON user_identities(user_id);
      CREATE TABLE IF NOT EXISTS api_usage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        usage_date TEXT NOT NULL,
        count INTEGER DEFAULT 0,
        UNIQUE(user_id, usage_date)
      );
      CREATE INDEX IF NOT EXISTS idx_api_usage_user ON api_usage(user_id);
      CREATE TABLE IF NOT EXISTS recognition_usage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        usage_date TEXT NOT NULL,
        count INTEGER DEFAULT 0,
        UNIQUE(user_id, usage_date)
      );
      CREATE INDEX IF NOT EXISTS idx_recognition_usage_user ON recognition_usage(user_id);
      CREATE TABLE IF NOT EXISTS placement_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event TEXT NOT NULL,
        symbol TEXT,
        user_id INTEGER,
        created_at TEXT DEFAULT (datetime('now', 'localtime'))
      );
      CREATE INDEX IF NOT EXISTS idx_placement_event ON placement_events(event, created_at);
      CREATE INDEX IF NOT EXISTS idx_placement_user ON placement_events(user_id);
      CREATE TABLE IF NOT EXISTS portfolio_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        guest_uid TEXT,
        market TEXT NOT NULL,
        symbol TEXT NOT NULL,
        symbol_name TEXT,
        shares REAL NOT NULL,
        cost REAL NOT NULL,
        current_price REAL NOT NULL,
        dividend REAL NOT NULL,
        cost_basis REAL NOT NULL,
        market_value REAL NOT NULL,
        unrealized_pnl REAL NOT NULL,
        unrealized_pnl_pct REAL NOT NULL,
        total_return REAL NOT NULL,
        total_return_pct REAL NOT NULL,
        yield_on_cost REAL NOT NULL,
        strategy TEXT,
        recommendation TEXT,
        summary TEXT,
        report_json TEXT,
        created_at TEXT DEFAULT (datetime('now', 'localtime'))
      );
      CREATE INDEX IF NOT EXISTS idx_portfolio_user ON portfolio_records(user_id, id);
      CREATE TABLE IF NOT EXISTS claim_codes (
        code_hash TEXT PRIMARY KEY,
        guest_uid TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now', 'localtime'))
      );
      CREATE INDEX IF NOT EXISTS idx_claim_guest ON claim_codes(guest_uid);
      CREATE TABLE IF NOT EXISTS market_focus (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        url TEXT NOT NULL,
        source TEXT,
        published_at TEXT,
        reason TEXT,
        summary TEXT,
        content TEXT,
        source_url TEXT,
        created_at TEXT DEFAULT (datetime('now', 'localtime'))
      );
      CREATE INDEX IF NOT EXISTS idx_market_focus_created ON market_focus(created_at);
      CREATE TABLE IF NOT EXISTS market_focus_meta (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        summary TEXT NOT NULL,
        generated_at TEXT,
        created_at TEXT DEFAULT (datetime('now', 'localtime'))
      );

      UPDATE odd_lot_trades SET price = 34.15, volume = 19443, bid_price = 34.15, bid_volume = 8943, ask_price = 34.20, ask_volume = 6092 WHERE stock_id = '2887';
      UPDATE shareholder_gifts SET gift_name = '多用途矽膠隔熱餐墊(二入)', last_buy_date = '08/14' WHERE stock_id = '2887';
      UPDATE odd_lot_trades SET price = COALESCE(NULLIF(price, 0), bid_price, ask_price, 50.0) WHERE price IS NULL OR price <= 0;
      UPDATE odd_lot_trades SET price = bid_price WHERE price > 4000 AND stock_id NOT IN ('3008', '5274', '6669', '3661') AND bid_price > 0 AND bid_price < 2000;
    `)

    // 既有 portfolio_records 表補上 guest_uid（冪等；全新 DB 的 column 已存在時 ALTER 會拋錯，故獨立 try/catch）。
    try {
      _db.exec('ALTER TABLE portfolio_records ADD COLUMN guest_uid TEXT;')
    } catch {}
    try {
      _db.exec('CREATE INDEX IF NOT EXISTS idx_portfolio_guest ON portfolio_records(guest_uid, id)')
    } catch {}
    try {
      _db.exec('ALTER TABLE market_focus ADD COLUMN summary TEXT;')
    } catch {}

    return _db
  } catch (err) {
    console.error('[SQLite] Failed to initialize (falling back to memory):', err)
    _dbFailed = true
    return null
  }
}

// ─── Azure SQL connection pool ───────────────────────────────────
async function getAzurePool(): Promise<sql.ConnectionPool | null> {
  if (_pool) return _pool
  if (_poolFailed) return null

  try {
    _pool = await sql.connect(DATABASE_URL)
    console.log('[AzureSQL] Connected successfully')

    await _pool.request().query(`
      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'odd_lot_trades')
      BEGIN
        CREATE TABLE odd_lot_trades (
          id         INT IDENTITY(1,1) PRIMARY KEY,
          date       NVARCHAR(20) NOT NULL,
          stock_id   NVARCHAR(20) NOT NULL,
          stock_name NVARCHAR(100) NOT NULL,
          price      FLOAT,
          volume     INT,
          bid_price  FLOAT,
          bid_volume INT,
          ask_price  FLOAT,
          ask_volume INT,
          created_at DATETIME DEFAULT GETDATE(),
          CONSTRAINT uq_odd_lot UNIQUE (date, stock_id)
        );
        CREATE INDEX idx_odd_lot_date ON odd_lot_trades(date);
        CREATE INDEX idx_odd_lot_stock ON odd_lot_trades(stock_id);
      END
    `)

    await _pool.request().query(`
      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'shareholder_gifts')
      BEGIN
        CREATE TABLE shareholder_gifts (
          id                   INT IDENTITY(1,1) PRIMARY KEY,
          stock_id             NVARCHAR(20) NOT NULL,
          stock_name           NVARCHAR(100) NOT NULL,
          meeting_date         NVARCHAR(20),
          last_buy_date        NVARCHAR(20),
          gift_name            NVARCHAR(500),
          gift_status          NVARCHAR(50),
          claim_rule           NVARCHAR(50),
          claim_rule_source    NVARCHAR(50),
          mops_gift_text       NVARCHAR(MAX),
          mops_meeting_date    NVARCHAR(50),
          mops_source_url      NVARCHAR(1000),
          mops_updated_at      NVARCHAR(50),
          distribution_method  NVARCHAR(200),
          distribution_location NVARCHAR(500),
          source_url           NVARCHAR(1000),
          created_at           DATETIME DEFAULT GETDATE(),
          CONSTRAINT uq_gift UNIQUE (stock_id, meeting_date)
        );
        CREATE INDEX idx_gift_stock ON shareholder_gifts(stock_id);
      END
    `)

    await _pool.request().query(`
      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'analysis_records')
      BEGIN
        CREATE TABLE analysis_records (
          id                   INT IDENTITY(1,1) PRIMARY KEY,
          ticker               NVARCHAR(20) NOT NULL,
          recommendation       NVARCHAR(50) NOT NULL,
          summary              NVARCHAR(MAX),
          full_report_json     NVARCHAR(MAX) NOT NULL,
          model_usage          NVARCHAR(4000),
          primary_models       NVARCHAR(500),
          fallback_used        NVARCHAR(10),
          fallback_count       INT DEFAULT 0,
          created_at           DATETIME DEFAULT GETDATE()
        );
        CREATE INDEX idx_analysis_ticker ON analysis_records(ticker);
        CREATE INDEX idx_analysis_created ON analysis_records(created_at);
      END
    `)

    await _pool.request().query(`
      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'historical_shareholder_gifts')
      BEGIN
        CREATE TABLE historical_shareholder_gifts (
          id           INT IDENTITY(1,1) PRIMARY KEY,
          stock_id     NVARCHAR(20) NOT NULL,
          stock_name   NVARCHAR(100),
          year         INT NOT NULL,
          gift_name    NVARCHAR(500) NOT NULL,
          created_at   DATETIME DEFAULT GETDATE(),
          CONSTRAINT uq_hist_gift UNIQUE (stock_id, year)
        );
        CREATE INDEX idx_historical_gifts_stock ON historical_shareholder_gifts(stock_id);
      END
    `)

    await _pool.request().query(`
      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'users')
      BEGIN
        CREATE TABLE users (
          id           INT IDENTITY(1,1) PRIMARY KEY,
          email        NVARCHAR(255),
          display_name NVARCHAR(100),
          avatar_url   NVARCHAR(500),
          created_at   DATETIME DEFAULT GETDATE()
        );
        CREATE TABLE user_identities (
          id               INT IDENTITY(1,1) PRIMARY KEY,
          user_id          INT NOT NULL,
          provider         NVARCHAR(20) NOT NULL,
          provider_user_id NVARCHAR(100) NOT NULL,
          provider_email   NVARCHAR(255),
          created_at       DATETIME DEFAULT GETDATE(),
          CONSTRAINT uq_identity UNIQUE (provider, provider_user_id)
        );
        CREATE INDEX idx_identities_user ON user_identities(user_id);
        CREATE TABLE api_usage (
          id         INT IDENTITY(1,1) PRIMARY KEY,
          user_id    INT NOT NULL,
          usage_date NVARCHAR(10) NOT NULL,
          count      INT DEFAULT 0,
          CONSTRAINT uq_api_usage UNIQUE (user_id, usage_date)
        );
        CREATE INDEX idx_api_usage_user ON api_usage(user_id);
      END
    `)

    // 即使 users 已存在，也要確保後續加入的表有建立：
    // 若是把這些 CREATE 包在「users 不存在才建」的守衛內，已上線的 DB 會永遠漏建，
    // 造成 consumeRecognitionQuota / 存持股永遠失敗。改用 per-table 獨立守衛。
    await _pool.request().query(`
      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'recognition_usage')
      BEGIN
        CREATE TABLE recognition_usage (
          id         INT IDENTITY(1,1) PRIMARY KEY,
          user_id    INT NOT NULL,
          usage_date NVARCHAR(10) NOT NULL,
          count      INT DEFAULT 0,
          CONSTRAINT uq_recognition_usage UNIQUE (user_id, usage_date)
        );
        CREATE INDEX idx_recognition_usage_user ON recognition_usage(user_id);
      END
    `)

    await _pool.request().query(`
      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'placement_events')
      BEGIN
        CREATE TABLE placement_events (
          id         INT IDENTITY(1,1) PRIMARY KEY,
          event      NVARCHAR(30) NOT NULL,
          symbol     NVARCHAR(20),
          user_id    INT,
          created_at DATETIME DEFAULT GETDATE()
        );
        CREATE INDEX idx_placement_event ON placement_events(event, created_at);
        CREATE INDEX idx_placement_user ON placement_events(user_id);
      END
    `)

    await _pool.request().query(`
      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'portfolio_records')
      BEGIN
        CREATE TABLE portfolio_records (
          id                   INT IDENTITY(1,1) PRIMARY KEY,
          user_id              INT NOT NULL,
          guest_uid            NVARCHAR(64),
          market               NVARCHAR(10) NOT NULL,
          symbol               NVARCHAR(30) NOT NULL,
          symbol_name          NVARCHAR(255),
          shares               FLOAT NOT NULL,
          cost                 FLOAT NOT NULL,
          current_price        FLOAT NOT NULL,
          dividend             FLOAT NOT NULL,
          cost_basis           FLOAT NOT NULL,
          market_value         FLOAT NOT NULL,
          unrealized_pnl       FLOAT NOT NULL,
          unrealized_pnl_pct   FLOAT NOT NULL,
          total_return         FLOAT NOT NULL,
          total_return_pct     FLOAT NOT NULL,
          yield_on_cost        FLOAT NOT NULL,
          strategy             NVARCHAR(50),
          recommendation       NVARCHAR(20),
          summary              NVARCHAR(MAX),
          report_json          NVARCHAR(MAX),
          created_at           DATETIME DEFAULT GETDATE()
        );
        CREATE INDEX idx_portfolio_user ON portfolio_records(user_id, id);
      END
    `)

    // 既有表補 guest_uid（冪等）+ guest 索引 + 認領碼表
    await _pool.request().query(`
      IF COL_LENGTH('portfolio_records', 'guest_uid') IS NULL
        ALTER TABLE portfolio_records ADD guest_uid NVARCHAR(64);
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_portfolio_guest')
        CREATE INDEX idx_portfolio_guest ON portfolio_records(guest_uid, id);
      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'claim_codes')
      BEGIN
        CREATE TABLE claim_codes (
          code_hash  NVARCHAR(64) PRIMARY KEY,
          guest_uid  NVARCHAR(64) NOT NULL,
          created_at DATETIME DEFAULT GETDATE()
        );
        CREATE INDEX idx_claim_guest ON claim_codes(guest_uid);
      END
    `)

    await _pool.request().query(`
      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'market_focus')
      BEGIN
        CREATE TABLE market_focus (
          id           INT IDENTITY(1,1) PRIMARY KEY,
          title        NVARCHAR(500) NOT NULL,
          url          NVARCHAR(2000) NOT NULL,
          source       NVARCHAR(200),
          published_at NVARCHAR(100),
          reason       NVARCHAR(MAX),
          content      NVARCHAR(MAX),
          source_url   NVARCHAR(2000),
          created_at   DATETIME DEFAULT GETDATE()
        );
        CREATE INDEX idx_market_focus_created ON market_focus(created_at);
        CREATE TABLE market_focus_meta (
          id           INT IDENTITY(1,1) PRIMARY KEY,
          summary      NVARCHAR(MAX) NOT NULL,
          generated_at NVARCHAR(100),
          created_at   DATETIME DEFAULT GETDATE()
        );
      END
    `)

    // 既有 market_focus 表補齊新欄位（冪等），並建立 market_focus_meta（若尚未存在）。
    await _pool.request().query(`
      IF COL_LENGTH('market_focus', 'content') IS NULL
        ALTER TABLE market_focus ADD content NVARCHAR(MAX);
      IF COL_LENGTH('market_focus', 'source_url') IS NULL
        ALTER TABLE market_focus ADD source_url NVARCHAR(2000);
      IF COL_LENGTH('market_focus', 'reason') IS NULL
        ALTER TABLE market_focus ADD reason NVARCHAR(MAX);
      IF COL_LENGTH('market_focus', 'summary') IS NULL
        ALTER TABLE market_focus ADD summary NVARCHAR(MAX);
      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'market_focus_meta')
      BEGIN
        CREATE TABLE market_focus_meta (
          id           INT IDENTITY(1,1) PRIMARY KEY,
          summary      NVARCHAR(MAX) NOT NULL,
          generated_at NVARCHAR(100),
          created_at   DATETIME DEFAULT GETDATE()
        );
      END
    `)

    return _pool
  } catch (err) {
    console.error('[AzureSQL] Failed to connect (falling back to memory):', err)
    _poolFailed = true
    return null
  }
}

// ─── Unified public API ──────────────────────────────────────────

/**
 * Returns the raw SQLite database handle (local only).
 * Returns null when using Azure SQL or on failure.
 */
export function getDb(): Database.Database | null {
  if (isAzureSql) return null
  return getSqliteDb()
}

/**
 * Check if we have a working database connection (either backend).
 */
export function getAzurePoolPublic(): Promise<sql.ConnectionPool | null> {
  return getAzurePool()
}

export function hasDb(): boolean {
  if (isAzureSql) return !_poolFailed
  return getSqliteDb() !== null
}

/**
 * Azure SQL (T-SQL) has no LIMIT clause — translate `... LIMIT n` to `SELECT TOP (n) ...`.
 * SQLite keeps native LIMIT. Only applies when a trailing LIMIT n is present.
 */
export function translateLimitForAzure(sqlStr: string): string {
  return sqlStr.replace(
    /^\s*(SELECT\s+)(.*)\s+LIMIT\s+(\d+)\s*;?\s*$/is,
    (_all, select, rest, n) => `SELECT TOP (${n}) ${rest}`,
  )
}

/**
 * Query all rows. Works with both SQLite and Azure SQL.
 */
export async function dbQueryAll<T = any>(sqlStr: string, params?: Record<string, any>): Promise<T[]> {
  if (isAzureSql) {
    const pool = await getAzurePool()
    if (!pool) return []
    const req = pool.request()
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        req.input(k, v ?? null)
      }
    }
    const result = await req.query(translateLimitForAzure(sqlStr))
    return result.recordset
  }

  const db = getSqliteDb()
  if (!db) return []

  if (params) {
    return db.prepare(sqlStr).all(params) as any[]
  }
  return db.prepare(sqlStr).all() as any[]
}

/**
 * Query first row. Works with both SQLite and Azure SQL.
 */
export async function dbQueryFirst<T = any>(sqlStr: string, params?: Record<string, any>): Promise<T | undefined> {
  if (isAzureSql) {
    const pool = await getAzurePool()
    if (!pool) return undefined
    const req = pool.request()
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        req.input(k, v ?? null)
      }
    }
    const result = await req.query(translateLimitForAzure(sqlStr))
    return result.recordset[0] as T | undefined
  }

  const db = getSqliteDb()
  if (!db) return undefined

  if (params) {
    return db.prepare(sqlStr).get(params) as T | undefined
  }
  return db.prepare(sqlStr).get() as T | undefined
}

/**
 * Execute a statement (INSERT/UPDATE/DELETE). Works with both backends.
 */
export async function dbExecute(sqlStr: string, params?: Record<string, any>): Promise<void> {
  if (isAzureSql) {
    const pool = await getAzurePool()
    if (!pool) return
    const req = pool.request()
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        req.input(k, v ?? null)
      }
    }
    await req.query(sqlStr)
    return
  }

  const db = getSqliteDb()
  if (!db) return

  if (params) {
    db.prepare(sqlStr).run(params)
  } else {
    db.exec(sqlStr)
  }
}

/**
 * Run a raw SQL string (multi-statement). Azure SQL splits on GO; SQLite uses exec.
 */
export async function dbExecRaw(sqlStr: string): Promise<void> {
  if (isAzureSql) {
    const pool = await getAzurePool()
    if (!pool) return
    const batches = sqlStr.split(/\bGO\b/i).filter(b => b.trim())
    for (const batch of batches) {
      if (batch.trim()) {
        await pool.request().query(batch)
      }
    }
    return
  }

  const db = getSqliteDb()
  if (!db) return
  db.exec(sqlStr)
}

// ─── Placement Events (page_view / backtest_run 追蹤) ────────────

/**
 * 記錄一次功能使用事件（如頁面造訪、回測啟動），可帶對應 symbol 與登入 user_id。
 * DB 失敗一律靜默吞掉，絕不影響主功能。
 */
export async function logPlacementEvent(
  event: 'page_view' | 'backtest_run',
  opts?: { symbol?: string | null; userId?: number | null },
): Promise<void> {
  try {
    await dbExecute(
      'INSERT INTO placement_events (event, symbol, user_id) VALUES (@event, @symbol, @user_id)',
      {
        event,
        symbol: opts?.symbol ?? null,
        user_id: opts?.userId ?? null,
      },
    )
  } catch (e) {
    console.error(`[DB] logPlacementEvent failed (${event}):`, e)
  }
}

/** 回測頁使用統計，供簡易報表/監看。 */
export async function getPlacementEventStats(): Promise<{
  pageViews: number
  runCount: number
  runBySymbol: Array<{ symbol: string | null; count: number }>
  runByUser: Array<{ user_id: number | null; display_name: string | null; count: number }>
}> {
  const pageViews = (
    await dbQueryFirst<{ c: number }>("SELECT COUNT(*) AS c FROM placement_events WHERE event = 'page_view'")
  )?.c ?? 0
  const runCount = (
    await dbQueryFirst<{ c: number }>("SELECT COUNT(*) AS c FROM placement_events WHERE event = 'backtest_run'")
  )?.c ?? 0
  const runBySymbol = await dbQueryAll<{ symbol: string | null; count: number }>(
    `SELECT symbol, COUNT(*) AS count FROM placement_events
     WHERE event = 'backtest_run' GROUP BY symbol ORDER BY count DESC LIMIT 20`,
  )
  const runByUser = await dbQueryAll<{ user_id: number | null; display_name: string | null; count: number }>(
    `SELECT e.user_id, u.display_name, COUNT(*) AS count
     FROM placement_events e
     LEFT JOIN users u ON u.id = e.user_id
     WHERE e.event = 'backtest_run' GROUP BY e.user_id ORDER BY count DESC LIMIT 20`,
  )
  return { pageViews, runCount, runBySymbol, runByUser }
}

// ─── ensureSeedData (async version) ──────────────────────────────

export async function ensureSeedData(): Promise<number> {
  if (isAzureSql) {
    return ensureSeedDataAzure()
  }
  return ensureSeedDataSqlite()
}

async function ensureSeedDataAzure(): Promise<number> {
  const pool = await getAzurePool()
  if (!pool) return 0

  // 只在初次呼叫時確認資料筆數並（必要時）seed；之後以 per-process flag 略過，
  // 避免每頁/每次 API request 都對逐日累積的 odd_lot_trades 跑 COUNT(*)。
  let cnt = _oddLotSeeded ? -1 : 0
  if (!_oddLotSeeded) {
    const countResult = await pool.request().query('SELECT COUNT(*) as cnt FROM odd_lot_trades')
    cnt = countResult.recordset[0]?.cnt ?? 0
  }
  const batchSize = 200

  if (cnt < 50) {
    console.log(`[AzureSQL] Seeding ${SEED_TRADES.length} trades and ${SEED_GIFTS.length} gifts...`)

    try {
      for (let i = 0; i < SEED_TRADES.length; i += batchSize) {
        const batch = SEED_TRADES.slice(i, i + batchSize)
        const req = pool.request()
        const values: string[] = []
        batch.forEach((t, idx) => {
          const p = `t${idx}`
          values.push(`(@${p}_date, @${p}_sid, @${p}_sname, @${p}_price, @${p}_vol, @${p}_bp, @${p}_bv, @${p}_ap, @${p}_av)`)
          req.input(`${p}_date`, sql.NVarChar(20), t.date)
          req.input(`${p}_sid`, sql.NVarChar(20), t.stock_id)
          req.input(`${p}_sname`, sql.NVarChar(100), t.stock_name)
          req.input(`${p}_price`, sql.Float, t.price)
          req.input(`${p}_vol`, sql.Int, t.volume)
          req.input(`${p}_bp`, sql.Float, t.bid_price)
          req.input(`${p}_bv`, sql.Int, t.bid_volume)
          req.input(`${p}_ap`, sql.Float, t.ask_price)
          req.input(`${p}_av`, sql.Int, t.ask_volume)
        })
        await req.query(`
          INSERT INTO odd_lot_trades (date, stock_id, stock_name, price, volume, bid_price, bid_volume, ask_price, ask_volume)
          VALUES ${values.join(',')}
        `)
      }

      for (let i = 0; i < SEED_GIFTS.length; i += batchSize) {
        const batch = SEED_GIFTS.slice(i, i + batchSize)
        const req = pool.request()
        const values: string[] = []
        batch.forEach((g, idx) => {
          const p = `g${idx}`
          values.push(`(@${p}_sid, @${p}_sname, @${p}_md, @${p}_lbd, @${p}_gn, @${p}_dm, @${p}_dl, @${p}_su)`)
          req.input(`${p}_sid`, sql.NVarChar(20), g.stock_id)
          req.input(`${p}_sname`, sql.NVarChar(100), g.stock_name)
          req.input(`${p}_md`, sql.NVarChar(20), g.meeting_date)
          req.input(`${p}_lbd`, sql.NVarChar(20), g.last_buy_date)
          req.input(`${p}_gn`, sql.NVarChar(500), g.gift_name)
          req.input(`${p}_dm`, sql.NVarChar(200), g.distribution_method)
          req.input(`${p}_dl`, sql.NVarChar(500), g.distribution_location)
          req.input(`${p}_su`, sql.NVarChar(1000), g.source_url)
        })
        await req.query(`
          MERGE INTO shareholder_gifts AS target
          USING (VALUES ${values.join(',')}) AS source (stock_id, stock_name, meeting_date, last_buy_date, gift_name, distribution_method, distribution_location, source_url)
          ON target.stock_id = source.stock_id AND target.meeting_date = source.meeting_date
          WHEN MATCHED THEN
            UPDATE SET stock_name = source.stock_name, last_buy_date = source.last_buy_date,
                       gift_name = source.gift_name, distribution_method = source.distribution_method,
                       distribution_location = source.distribution_location, source_url = source.source_url
          WHEN NOT MATCHED THEN
            INSERT (stock_id, stock_name, meeting_date, last_buy_date, gift_name, distribution_method, distribution_location, source_url)
            VALUES (source.stock_id, source.stock_name, source.meeting_date, source.last_buy_date, source.gift_name, source.distribution_method, source.distribution_location, source.source_url);
        `)
      }
    } catch (e: any) {
      if (e.number === 2627) {
        console.log('[AzureSQL] Seed data already present (duplicate key), skipping')
      } else {
        throw e
      }
    }

    _giftsSeeded = true
    console.log('[AzureSQL] Seed data inserted')
  }

  // 無論資料是否已存在，確認過一次後就標記已做，後續呼叫略過 COUNT(*) 與 seed。
  _oddLotSeeded = true

  if (!_giftsSeeded) {
    console.log(`[AzureSQL] Ensuring ${SEED_GIFTS.length} seed gifts...`)
    try {
      for (let i = 0; i < SEED_GIFTS.length; i += batchSize) {
        const batch = SEED_GIFTS.slice(i, i + batchSize)
        const req = pool.request()
        const values: string[] = []
        batch.forEach((g, idx) => {
          const p = `g${idx}`
          values.push(`(@${p}_sid, @${p}_sname, @${p}_md, @${p}_lbd, @${p}_gn, @${p}_dm, @${p}_dl, @${p}_su)`)
          req.input(`${p}_sid`, sql.NVarChar(20), g.stock_id)
          req.input(`${p}_sname`, sql.NVarChar(100), g.stock_name)
          req.input(`${p}_md`, sql.NVarChar(20), g.meeting_date)
          req.input(`${p}_lbd`, sql.NVarChar(20), g.last_buy_date)
          req.input(`${p}_gn`, sql.NVarChar(500), g.gift_name)
          req.input(`${p}_dm`, sql.NVarChar(200), g.distribution_method)
          req.input(`${p}_dl`, sql.NVarChar(500), g.distribution_location)
          req.input(`${p}_su`, sql.NVarChar(1000), g.source_url)
        })
        await req.query(`
          MERGE INTO shareholder_gifts AS target
          USING (VALUES ${values.join(',')}) AS source (stock_id, stock_name, meeting_date, last_buy_date, gift_name, distribution_method, distribution_location, source_url)
          ON target.stock_id = source.stock_id AND target.meeting_date = source.meeting_date
          WHEN MATCHED THEN
            UPDATE SET stock_name = source.stock_name, last_buy_date = source.last_buy_date,
                       gift_name = source.gift_name, distribution_method = source.distribution_method,
                       distribution_location = source.distribution_location, source_url = source.source_url
          WHEN NOT MATCHED THEN
            INSERT (stock_id, stock_name, meeting_date, last_buy_date, gift_name, distribution_method, distribution_location, source_url)
            VALUES (source.stock_id, source.stock_name, source.meeting_date, source.last_buy_date, source.gift_name, source.distribution_method, source.distribution_location, source.source_url);
        `)
      }
      _giftsSeeded = true
    } catch (e: any) {
      if (e.number === 2627) {
        console.log('[AzureSQL] Gifts already seeded (duplicate key), skipping')
        _giftsSeeded = true
      } else {
        throw e
      }
    }
  }

  // 已確認過（cnt >= 0）就直接回傳已知筆數，避免再跑一次 COUNT(*)。
  return cnt >= 0 ? cnt : -1
}

function ensureSeedDataSqlite(): number {
  const db = getSqliteDb()
  if (!db) return 0

  const countRow = db.prepare("SELECT count(*) as cnt FROM odd_lot_trades").get() as { cnt: number }
  if (!countRow || countRow.cnt < 50) {
    console.log(`[SQLite] Force populating ${SEED_TRADES.length} trades and ${SEED_GIFTS.length} gifts...`)

    const insertTrade = db.prepare(`
      INSERT OR REPLACE INTO odd_lot_trades (date, stock_id, stock_name, price, volume, bid_price, bid_volume, ask_price, ask_volume)
      VALUES (@date, @stock_id, @stock_name, @price, @volume, @bid_price, @bid_volume, @ask_price, @ask_volume)
    `)
    const insertGift = db.prepare(`
      INSERT OR REPLACE INTO shareholder_gifts (stock_id, stock_name, meeting_date, last_buy_date, gift_name, distribution_method, distribution_location, source_url)
      VALUES (@stock_id, @stock_name, @meeting_date, @last_buy_date, @gift_name, @distribution_method, @distribution_location, @source_url)
    `)

    const populateTx = db.transaction(() => {
      for (const trade of SEED_TRADES) insertTrade.run(trade)
      for (const gift of SEED_GIFTS) insertGift.run(gift)
    })
    populateTx()

    const checkCount = db.prepare("SELECT count(*) as cnt FROM odd_lot_trades").get() as { cnt: number }
    return checkCount?.cnt || 0
  }

  if (!_giftsSeeded) {
    console.log(`[SQLite] Ensuring ${SEED_GIFTS.length} seed gifts...`)
    const insertGift = db.prepare(`
      INSERT OR REPLACE INTO shareholder_gifts (stock_id, stock_name, meeting_date, last_buy_date, gift_name, distribution_method, distribution_location, source_url)
      VALUES (@stock_id, @stock_name, @meeting_date, @last_buy_date, @gift_name, @distribution_method, @distribution_location, @source_url)
    `)
    const insertGiftsTx = db.transaction(() => {
      for (const gift of SEED_GIFTS) insertGift.run(gift)
    })
    insertGiftsTx()
    _giftsSeeded = true
  }

  return countRow.cnt
}

// ─── migrate (async) ─────────────────────────────────────────────
export async function migrate(): Promise<void> {
  if (isAzureSql) {
    return migrateAzure()
  }
  return migrateSqlite()
}

async function migrateAzure(): Promise<void> {
  const pool = await getAzurePool()
  if (!pool) return

  try {
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'migrations')
      CREATE TABLE migrations (
        id         INT IDENTITY(1,1) PRIMARY KEY,
        name       NVARCHAR(200) NOT NULL UNIQUE,
        applied_at DATETIME DEFAULT GETDATE()
      )
    `)

    const applied = new Set(
      (await pool.request().query('SELECT name FROM migrations')).recordset.map((r: any) => r.name)
    )

    for (const { name: file, sql: raw } of MIGRATIONS) {
      if (applied.has(file)) continue
      const batches = raw.split(/\bGO\b/i).filter(b => b.trim())
      for (const batch of batches) {
        if (!batch.trim()) continue
        try {
          await pool.request().query(batch)
        } catch (e: any) {
          const msg = String(e?.message ?? e).toLowerCase()
          const isDup =
            e?.number === 2705 ||
            e?.number === 4928 ||
            (msg.includes('already exists') && msg.includes('column'))
          if (isDup) {
            console.log(`[AzureSQL] migration ${file}: column already exists, skipping statement`)
          } else {
            // 001/002 為 SQLite 語法（CREATE TABLE IF NOT EXISTS）在 T-SQL 不合法，
            // 但表格已由 getAzurePool 建立。記錄並跳過，避免中止整個 migrate。
            console.warn(`[AzureSQL] migration ${file}: statement failed, skipping (${msg.split('\n')[0]})`)
          }
        }
      }
      await pool.request()
        .input('name', sql.NVarChar(200), file)
        .query('INSERT INTO migrations (name) VALUES (@name)')
      console.log(`Applied migration: ${file}`)
    }
  } catch (e) {
    console.error('[AzureSQL] Migration failed:', e)
  }
}

function migrateSqlite(): void {
  const db = getSqliteDb()
  if (!db) return

  try {
    db.exec(`CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT DEFAULT (datetime('now', 'localtime'))
    )`)

    const applied = new Set(
      db.prepare('SELECT name FROM migrations').all().map((r: any) => r.name)
    )

    const insert = db.prepare('INSERT INTO migrations (name) VALUES (?)')
    for (const { name: file, sql } of MIGRATIONS) {
      if (applied.has(file)) continue
      const statements = sql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0)
      for (const stmt of statements) {
        try {
          db.exec(stmt)
        } catch (e: any) {
          const msg = String(e?.message ?? e).toLowerCase()
          if (msg.includes('duplicate column name')) {
            console.log(`[SQLite] migration ${file}: column already exists, skipping statement`)
            continue
          }
          throw e
        }
      }
      insert.run(file)
      console.log(`Applied migration: ${file}`)
    }
  } catch (e) {
    console.error('[SQLite] Migration failed:', e)
  }
}

// ─── closeDb ─────────────────────────────────────────────────────
export function closeDb(): void {
  if (_db) {
    try { _db.close() } catch (_) {}
    _db = null
  }
  if (_pool) {
    try { _pool.close() } catch (_) {}
    _pool = null
  }
}

// ─── Analysis Records ────────────────────────────────────────────
export interface AnalysisRecord {
  id?: number
  ticker: string
  recommendation: string
  summary?: string
  full_report_json: string
  model_usage?: string
  primary_models?: string
  fallback_used?: string
  fallback_count?: number
  created_at?: string
}

export async function saveAnalysisRecord(record: {
  ticker: string
  recommendation: string
  summary?: string
  fullReport: any
  modelUsage?: string
  primaryModels?: string
  fallbackUsed?: boolean
  fallbackCount?: number
}): Promise<number> {
  const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19)
  const reportJson = typeof record.fullReport === 'string' ? record.fullReport : JSON.stringify(record.fullReport)
  const summaryStr = typeof record.summary === 'string' ? record.summary : JSON.stringify(record.summary || '')
  const modelUsageStr = record.modelUsage ?? null
  const primaryModelsStr = record.primaryModels ?? null
  const fallbackUsedStr = record.fallbackUsed ? '1' : '0'
  const fallbackCount = record.fallbackCount ?? 0
  let insertedId = -1

  if (isAzureSql) {
    const pool = await getAzurePool()
    if (pool) {
      try {
        const result = await pool.request()
          .input('ticker', sql.NVarChar(20), record.ticker)
          .input('rec', sql.NVarChar(50), record.recommendation || 'Hold')
          .input('summary', sql.NVarChar(sql.MAX), summaryStr)
          .input('report', sql.NVarChar(sql.MAX), reportJson)
          .input('modelUsage', sql.NVarChar(4000), modelUsageStr)
          .input('primaryModels', sql.NVarChar(500), primaryModelsStr)
          .input('fallbackUsed', sql.NVarChar(10), fallbackUsedStr)
          .input('fallbackCount', sql.Int, fallbackCount)
          .query(`
            INSERT INTO analysis_records (ticker, recommendation, summary, full_report_json, model_usage, primary_models, fallback_used, fallback_count)
            VALUES (@ticker, @rec, @summary, @report, @modelUsage, @primaryModels, @fallbackUsed, @fallbackCount);
            SELECT SCOPE_IDENTITY() as id
          `)
        insertedId = Number(result.recordset[0]?.id ?? -1)
      } catch (e) {
        console.error('[AzureSQL] saveAnalysisRecord error:', e)
      }
    }
  } else {
    const db = getSqliteDb()
    if (db) {
      try {
        const stmt = db.prepare(`
          INSERT INTO analysis_records (ticker, recommendation, summary, full_report_json, model_usage, primary_models, fallback_used, fallback_count)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `)
        const info = stmt.run(record.ticker, record.recommendation || 'Hold', summaryStr, reportJson, modelUsageStr, primaryModelsStr, fallbackUsedStr, fallbackCount)
        insertedId = Number(info.lastInsertRowid)
      } catch (e) {
        console.error('[SQLite] saveAnalysisRecord error:', e)
      }
    }
  }

  const id = insertedId > 0 ? insertedId : memoryIdCounter++
  memoryStore.unshift({
    id, ticker: record.ticker, recommendation: record.recommendation,
    summary: summaryStr, full_report_json: reportJson, created_at: nowStr,
    model_usage: modelUsageStr ?? undefined,
    primary_models: primaryModelsStr ?? undefined,
    fallback_used: fallbackUsedStr,
    fallback_count: fallbackCount,
  })
  return id
}

export async function getAnalysisRecords(limit: number = 20, symbol?: string): Promise<AnalysisRecord[]> {
  const cleanSymbol = symbol?.trim().toUpperCase()

  if (isAzureSql) {
    const pool = await getAzurePool()
    if (pool) {
      try {
        const req = pool.request()
        req.input('limit', sql.Int, limit)
        if (cleanSymbol) {
          req.input('pattern', sql.NVarChar(50), `%${cleanSymbol}%`)
          const result = await req.query(`
            SELECT TOP (@limit) id, ticker, recommendation, summary, full_report_json, model_usage, primary_models, fallback_used, fallback_count, created_at
            FROM analysis_records WHERE UPPER(ticker) LIKE @pattern ORDER BY id DESC
          `)
          return result.recordset as AnalysisRecord[]
        }
        const result = await req.query(`
          SELECT TOP (@limit) id, ticker, recommendation, summary, full_report_json, model_usage, primary_models, fallback_used, fallback_count, created_at
          FROM analysis_records ORDER BY id DESC
        `)
        return result.recordset as AnalysisRecord[]
      } catch (e) {
        console.error('[AzureSQL] getAnalysisRecords error:', e)
      }
    }
  } else {
    const db = getSqliteDb()
    if (db) {
      try {
        if (cleanSymbol) {
          return db.prepare(`
            SELECT id, ticker, recommendation, summary, full_report_json, model_usage, primary_models, fallback_used, fallback_count, created_at
            FROM analysis_records WHERE UPPER(ticker) LIKE ? ORDER BY id DESC LIMIT ?
          `).all(`%${cleanSymbol}%`, limit) as AnalysisRecord[]
        }
        return db.prepare(`
          SELECT id, ticker, recommendation, summary, full_report_json, model_usage, primary_models, fallback_used, fallback_count, created_at
          FROM analysis_records ORDER BY id DESC LIMIT ?
        `).all(limit) as AnalysisRecord[]
      } catch (e) {
        console.error('[SQLite] getAnalysisRecords error:', e)
      }
    }
  }

  if (cleanSymbol) {
    return memoryStore.filter(r => r.ticker.toUpperCase().includes(cleanSymbol)).slice(0, limit)
  }
  return memoryStore.slice(0, limit)
}

// ─── Portfolio Records ───────────────────────────────────────────
export interface PortfolioRecord {
  id?: number
  user_id: number
  guest_uid?: string | null
  market: 'tw' | 'us'
  symbol: string
  symbol_name?: string | null
  shares: number
  cost: number
  current_price: number
  dividend: number
  cost_basis: number
  market_value: number
  unrealized_pnl: number
  unrealized_pnl_pct: number
  total_return: number
  total_return_pct: number
  yield_on_cost: number
  strategy?: string | null
  recommendation?: string | null
  summary?: string | null
  report_json?: string | null
  created_at?: string
}

export interface PortfolioRecordInput {
  user_id: number
  guestUid?: string | null
  market: 'tw' | 'us'
  symbol: string
  symbolName?: string | null
  shares: number
  cost: number
  currentPrice: number
  dividend: number
  costBasis: number
  marketValue: number
  unrealizedPnl: number
  unrealizedPnlPct: number
  totalReturn: number
  totalReturnPct: number
  yieldOnCost: number
  strategy?: string | null
  recommendation?: string | null
  summary?: string | null
  reportJson?: string | null
}

const PORTFOLIO_COLUMNS =
  'id, user_id, guest_uid, market, symbol, symbol_name, shares, cost, current_price, dividend, cost_basis, market_value, ' +
  'unrealized_pnl, unrealized_pnl_pct, total_return, total_return_pct, yield_on_cost, strategy, recommendation, summary, report_json, created_at'

export async function savePortfolioRecord(record: PortfolioRecordInput): Promise<number> {
  const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19)
  const reportStr = record.reportJson ?? null
  const summaryStr = record.summary ?? null
  const strategyStr = record.strategy ?? null
  const recommendationStr = record.recommendation ?? null
  const symbolName = record.symbolName ?? null
  let insertedId = -1

  if (isAzureSql) {
    const pool = await getAzurePool()
    if (pool) {
      try {
        const result = await pool.request()
          .input('userId', sql.Int, record.user_id)
          .input('guestUid', sql.NVarChar(64), record.guestUid ?? null)
          .input('market', sql.NVarChar(10), record.market)
          .input('symbol', sql.NVarChar(30), record.symbol)
          .input('symbolName', sql.NVarChar(255), symbolName)
          .input('shares', sql.Float, record.shares)
          .input('cost', sql.Float, record.cost)
          .input('currentPrice', sql.Float, record.currentPrice)
          .input('dividend', sql.Float, record.dividend)
          .input('costBasis', sql.Float, record.costBasis)
          .input('marketValue', sql.Float, record.marketValue)
          .input('pnl', sql.Float, record.unrealizedPnl)
          .input('pnlPct', sql.Float, record.unrealizedPnlPct)
          .input('totalReturn', sql.Float, record.totalReturn)
          .input('totalReturnPct', sql.Float, record.totalReturnPct)
          .input('yieldOnCost', sql.Float, record.yieldOnCost)
          .input('strategy', sql.NVarChar(50), strategyStr)
          .input('recommendation', sql.NVarChar(20), recommendationStr)
          .input('summary', sql.NVarChar(sql.MAX), summaryStr)
          .input('report', sql.NVarChar(sql.MAX), reportStr)
          .query(`
            INSERT INTO portfolio_records (
              user_id, guest_uid, market, symbol, symbol_name, shares, cost, current_price, dividend, cost_basis, market_value,
              unrealized_pnl, unrealized_pnl_pct, total_return, total_return_pct, yield_on_cost, strategy, recommendation, summary, report_json
            ) VALUES (
              @userId, @guestUid, @market, @symbol, @symbolName, @shares, @cost, @currentPrice, @dividend, @costBasis, @marketValue,
              @pnl, @pnlPct, @totalReturn, @totalReturnPct, @yieldOnCost, @strategy, @recommendation, @summary, @report
            );
            SELECT SCOPE_IDENTITY() AS id
          `)
        insertedId = Number(result.recordset?.[0]?.id ?? -1)
      } catch (e) {
        console.error('[AzureSQL] savePortfolioRecord error:', e)
      }
    }
  } else {
    const db = getSqliteDb()
    if (db) {
      try {
        const info = db.prepare(`
          INSERT INTO portfolio_records (
            user_id, guest_uid, market, symbol, symbol_name, shares, cost, current_price, dividend, cost_basis, market_value,
            unrealized_pnl, unrealized_pnl_pct, total_return, total_return_pct, yield_on_cost, strategy, recommendation, summary, report_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          record.user_id, record.guestUid ?? null, record.market, record.symbol, symbolName, record.shares, record.cost,
          record.currentPrice, record.dividend, record.costBasis, record.marketValue, record.unrealizedPnl,
          record.unrealizedPnlPct, record.totalReturn, record.totalReturnPct, record.yieldOnCost, strategyStr,
          recommendationStr, summaryStr, reportStr,
        )
        insertedId = Number(info.lastInsertRowid)
      } catch (e) {
        console.error('[SQLite] savePortfolioRecord error:', e)
      }
    }
  }

  const id = insertedId > 0 ? insertedId : portfolioMemoryIdCounter++
  const row: PortfolioRecord = {
    id,
    user_id: record.user_id,
    guest_uid: record.guestUid ?? null,
    market: record.market,
    symbol: record.symbol,
    symbol_name: symbolName,
    shares: record.shares,
    cost: record.cost,
    current_price: record.currentPrice,
    dividend: record.dividend,
    cost_basis: record.costBasis,
    market_value: record.marketValue,
    unrealized_pnl: record.unrealizedPnl,
    unrealized_pnl_pct: record.unrealizedPnlPct,
    total_return: record.totalReturn,
    total_return_pct: record.totalReturnPct,
    yield_on_cost: record.yieldOnCost,
    strategy: strategyStr,
    recommendation: recommendationStr,
    summary: summaryStr,
    report_json: reportStr,
    created_at: nowStr,
  }
  portfolioMemoryStore.unshift(row)
  return id
}

/** 查訪客（匿名）損益紀錄：依 guest_uid 過濾，與登入使用者資料完全隔離。 */
export async function getPortfolioRecordsByGuest(guestUid: string, limit: number = 20): Promise<PortfolioRecord[]> {
  if (isAzureSql) {
    const pool = await getAzurePool()
    if (pool) {
      try {
        const result = await pool.request()
          .input('guestUid', sql.NVarChar(64), guestUid)
          .input('limit', sql.Int, limit)
          .query(`
            SELECT TOP (@limit) ${PORTFOLIO_COLUMNS}
            FROM portfolio_records WHERE guest_uid = @guestUid ORDER BY id DESC
          `)
        return result.recordset as PortfolioRecord[]
      } catch (e) {
        console.error('[AzureSQL] getPortfolioRecordsByGuest error:', e)
      }
    }
  } else {
    const db = getSqliteDb()
    if (db) {
      try {
        return db.prepare(`
          SELECT ${PORTFOLIO_COLUMNS}
          FROM portfolio_records WHERE guest_uid = ? ORDER BY id DESC LIMIT ?
        `).all(guestUid, limit) as PortfolioRecord[]
      } catch (e) {
        console.error('[SQLite] getPortfolioRecordsByGuest error:', e)
      }
    }
  }

  return portfolioMemoryStore.filter(r => r.guest_uid === guestUid).slice(0, limit)
}

// ─── Claim Codes（訪客認領碼）────────────────────────────────────
const claimMemoryStore = new Map<string, string>()

/** 存入認領碼（只存 hash，不存明文）。 */
export async function saveClaimCode(guestUid: string, codeHash: string): Promise<void> {
  if (isAzureSql) {
    const pool = await getAzurePool()
    if (pool) {
      try {
        await pool.request()
          .input('codeHash', sql.NVarChar(64), codeHash)
          .input('guestUid', sql.NVarChar(64), guestUid)
          .query('INSERT INTO claim_codes (code_hash, guest_uid) VALUES (@codeHash, @guestUid)')
        return
      } catch (e) {
        console.error('[AzureSQL] saveClaimCode error:', e)
      }
    }
  } else {
    const db = getSqliteDb()
    if (db) {
      try {
        db.prepare('INSERT INTO claim_codes (code_hash, guest_uid) VALUES (?, ?)').run(codeHash, guestUid)
        return
      } catch (e) {
        console.error('[SQLite] saveClaimCode error:', e)
      }
    }
  }
  claimMemoryStore.set(codeHash, guestUid)
}

/** 依認領碼 hash 找回對應的 guest_uid（無則 null）。 */
export async function findGuestByClaimCode(codeHash: string): Promise<string | null> {
  if (isAzureSql) {
    const pool = await getAzurePool()
    if (pool) {
      try {
        const result = await pool.request()
          .input('codeHash', sql.NVarChar(64), codeHash)
          .query('SELECT TOP (1) guest_uid FROM claim_codes WHERE code_hash = @codeHash')
        return result.recordset?.[0]?.guest_uid ?? null
      } catch (e) {
        console.error('[AzureSQL] findGuestByClaimCode error:', e)
      }
    }
  } else {
    const db = getSqliteDb()
    if (db) {
      try {
        const row = db.prepare('SELECT guest_uid FROM claim_codes WHERE code_hash = ?').get(codeHash)
        return (row as { guest_uid?: string } | undefined)?.guest_uid ?? null
      } catch (e) {
        console.error('[SQLite] findGuestByClaimCode error:', e)
      }
    }
  }
  return claimMemoryStore.get(codeHash) ?? null
}

/** 兌換認領碼時，把本機（fromGid）既有的訪客紀錄改掛到認領的 workspace（toGid）。 */
export async function reassignGuestRecords(fromGid: string, toGid: string): Promise<void> {
  if (fromGid === toGid) return
  if (isAzureSql) {
    const pool = await getAzurePool()
    if (pool) {
      try {
        await pool.request()
          .input('fromGid', sql.NVarChar(64), fromGid)
          .input('toGid', sql.NVarChar(64), toGid)
          .query('UPDATE portfolio_records SET guest_uid = @toGid WHERE guest_uid = @fromGid AND user_id = 0')
        return
      } catch (e) {
        console.error('[AzureSQL] reassignGuestRecords error:', e)
      }
    }
  } else {
    const db = getSqliteDb()
    if (db) {
      try {
        db.prepare('UPDATE portfolio_records SET guest_uid = ? WHERE guest_uid = ? AND user_id = 0').run(toGid, fromGid)
        return
      } catch (e) {
        console.error('[SQLite] reassignGuestRecords error:', e)
      }
    }
  }
  for (const row of portfolioMemoryStore) {
    if (row.guest_uid === fromGid && row.user_id === 0) row.guest_uid = toGid
  }
}

export async function getPortfolioRecords(userId: number, limit: number = 20): Promise<PortfolioRecord[]> {
  if (isAzureSql) {
    const pool = await getAzurePool()
    if (pool) {
      try {
        const result = await pool.request()
          .input('userId', sql.Int, userId)
          .input('limit', sql.Int, limit)
          .query(`
            SELECT TOP (@limit) ${PORTFOLIO_COLUMNS}
            FROM portfolio_records WHERE user_id = @userId ORDER BY id DESC
          `)
        return result.recordset as PortfolioRecord[]
      } catch (e) {
        console.error('[AzureSQL] getPortfolioRecords error:', e)
      }
    }
  } else {
    const db = getSqliteDb()
    if (db) {
      try {
        return db.prepare(`
          SELECT ${PORTFOLIO_COLUMNS}
          FROM portfolio_records WHERE user_id = ? ORDER BY id DESC LIMIT ?
        `).all(userId, limit) as PortfolioRecord[]
      } catch (e) {
        console.error('[SQLite] getPortfolioRecords error:', e)
      }
    }
  }
  return portfolioMemoryStore.filter(r => r.user_id === userId).slice(0, limit)
}

export async function getAnalysisRecordById(id: number): Promise<AnalysisRecord | undefined> {
  if (isAzureSql) {
    const pool = await getAzurePool()
    if (pool) {
      try {
        const result = await pool.request()
          .input('id', sql.Int, id)
          .query(`SELECT id, ticker, recommendation, summary, full_report_json, model_usage, primary_models, fallback_used, fallback_count, created_at FROM analysis_records WHERE id = @id`)
        return result.recordset[0] as AnalysisRecord | undefined
      } catch (e) {
        console.error('[AzureSQL] getAnalysisRecordById error:', e)
      }
    }
  } else {
    const db = getSqliteDb()
    if (db) {
      try {
        return db.prepare(`
          SELECT id, ticker, recommendation, summary, full_report_json, model_usage, primary_models, fallback_used, fallback_count, created_at
          FROM analysis_records WHERE id = ?
        `).get(id) as AnalysisRecord | undefined
      } catch (e) {
        console.error('[SQLite] getAnalysisRecordById error:', e)
      }
    }
  }

  return memoryStore.find(r => r.id === id)
}

export async function deleteAnalysisRecord(id: number): Promise<boolean> {
  if (isAzureSql) {
    const pool = await getAzurePool()
    if (pool) {
      try {
        const result = await pool.request()
          .input('id', sql.Int, id)
          .query('DELETE FROM analysis_records WHERE id = @id')
        return result.rowsAffected[0] > 0
      } catch (e) {
        console.error('[AzureSQL] deleteAnalysisRecord error:', e)
        return false
      }
    }
    return false
  }

  const db = getSqliteDb()
  if (db) {
    try {
      const info = db.prepare('DELETE FROM analysis_records WHERE id = ?').run(id)
      return info.changes > 0
    } catch (e) {
      console.error('[SQLite] deleteAnalysisRecord error:', e)
      return false
    }
  }

  const idx = memoryStore.findIndex(r => r.id === id)
  if (idx >= 0) {
    memoryStore.splice(idx, 1)
    return true
  }
  return false
}

// ─── Historical Gifts ────────────────────────────────────────────
export interface HistoricalGift {
  id?: number
  stock_id: string
  stock_name?: string
  year: number
  gift_name: string
}

export async function getHistoricalGifts(stockId: string): Promise<HistoricalGift[]> {
  if (isAzureSql) {
    const pool = await getAzurePool()
    if (pool) {
      try {
        const result = await pool.request()
          .input('stock_id', sql.NVarChar(20), stockId)
          .query(`
            SELECT id, stock_id, stock_name, year, gift_name
            FROM historical_shareholder_gifts WHERE stock_id = @stock_id ORDER BY year DESC
          `)
        return result.recordset as HistoricalGift[]
      } catch (e) {
        console.error('[AzureSQL] getHistoricalGifts error:', e)
      }
    }
    return []
  }

  const db = getSqliteDb()
  if (db) {
    try {
      return db.prepare(`
        SELECT id, stock_id, stock_name, year, gift_name
        FROM historical_shareholder_gifts WHERE stock_id = ? ORDER BY year DESC
      `).all(stockId) as HistoricalGift[]
    } catch (e) {
      console.error('[SQLite] getHistoricalGifts error:', e)
    }
  }
  return []
}

// ─── Market Focus (首頁 AI 篩選新聞) ─────────────────────────────
export interface MarketFocusItem {
  id?: number
  title: string
  url: string
  source: string | null
  published_at: string | null
  reason: string | null
  /** AI 依據全文提煉的說人話重點摘要（約 100~180 字）。 */
  summary?: string | null
  /** 抓取到的文章全文摘錄（節錄前 4000 字，僅短存最新一輪）。 */
  content?: string | null
  /** 解析後的原始新聞來源 URL（優先 Google 轉址後的網址）。 */
  source_url?: string | null
  created_at?: string
}

export interface MarketFocusMeta {
  id?: number
  summary: string | null
  generated_at: string | null
}

/** 全量取代 market_focus 內容（每次 refresh 重新挑選一輪新聞）。 */
export async function saveMarketFocus(items: MarketFocusItem[]): Promise<void> {
  await dbExecute('DELETE FROM market_focus')
  for (const it of items) {
    if (!it.title || !it.url) continue
    await dbExecute(
      'INSERT INTO market_focus (title, url, source, published_at, reason, summary, content, source_url) VALUES (@title, @url, @source, @published_at, @reason, @summary, @content, @source_url)',
      {
        title: it.title.slice(0, 500),
        url: it.url.slice(0, 2000),
        source: it.source ? it.source.slice(0, 200) : null,
        published_at: it.published_at ? it.published_at.slice(0, 100) : null,
        reason: it.reason ?? null,
        summary: it.summary ?? null,
        content: it.content ?? null,
        source_url: it.source_url ? it.source_url.slice(0, 2000) : null,
      },
    )
  }
}

/** 讀取最新一輪市場焦點新聞（以發布時間新到舊排序）。 */
export async function getMarketFocus(limit: number = 6): Promise<MarketFocusItem[]> {
  return dbQueryAll<MarketFocusItem>(
    `SELECT id, title, url, source, published_at, reason, summary, content, source_url FROM market_focus ORDER BY published_at DESC, id DESC LIMIT ${limit}`,
  )
}

/** 覆寫當日市場焦點 AI 總覽（僅保留最新一輪，維持單一列）。 */
export async function saveMarketFocusMeta(meta: { summary: string; generatedAt: string }): Promise<void> {
  await dbExecute('DELETE FROM market_focus_meta')
  await dbExecute(
    'INSERT INTO market_focus_meta (summary, generated_at) VALUES (@summary, @generated_at)',
    { summary: meta.summary.slice(0, 20000), generated_at: meta.generatedAt.slice(0, 100) },
  )
}

/** 讀取最新市場焦點 AI 總覽。 */
export async function getMarketFocusMeta(): Promise<MarketFocusMeta | null> {
  const rows = await dbQueryAll<MarketFocusMeta>(
    'SELECT id, summary, generated_at FROM market_focus_meta ORDER BY id DESC LIMIT 1',
  )
  return rows[0] ?? null
}

// ─── Users / Auth / Quota ────────────────────────────────────────
export type AuthProvider = 'google' | 'line'

export interface UserRow {
  id: number
  email: string | null
  display_name: string | null
  avatar_url: string | null
  created_at?: string
}

export interface IdentityInput {
  provider: AuthProvider
  providerUserId: string
  email?: string | null
  displayName?: string | null
  avatarUrl?: string | null
  /** 是否以 email 綁定到既有使用者。預設 true（Google 等維持原行為）；LINE 設 false 以保持既有 Email 使用者登入方式不變。 */
  mergeByEmail?: boolean
}

export interface QuotaResult {
  allowed: boolean
  used: number
  remaining: number
  max: number
}

  const USER_COLUMNS = 'id, email, display_name, avatar_url, created_at'
  const USER_COLUMNS_ALIASED = 'u.id, u.email, u.display_name, u.avatar_url, u.created_at'

export async function getUserById(userId: number): Promise<UserRow | null> {
  if (isAzureSql) {
    const pool = await getAzurePool()
    if (!pool) return null
    try {
      const result = await pool.request()
        .input('id', sql.Int, userId)
        .query(`SELECT ${USER_COLUMNS} FROM users WHERE id = @id`)
      return (result.recordset[0] as UserRow) ?? null
    } catch (e) {
      console.error('[AzureSQL] getUserById error:', e)
      return null
    }
  }

  const db = getSqliteDb()
  if (!db) return null
  try {
    return (db.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`).get(userId) as UserRow) ?? null
  } catch (e) {
    console.error('[SQLite] getUserById error:', e)
    return null
  }
}

export interface UserIdentityRow {
  provider: string
  provider_user_id: string
  provider_email: string | null
}

export async function getUserIdentities(userId: number): Promise<UserIdentityRow[]> {
  if (isAzureSql) {
    const pool = await getAzurePool()
    if (pool) {
      try {
        const result = await pool.request()
          .input('id', sql.Int, userId)
          .query('SELECT provider, provider_user_id, provider_email FROM user_identities WHERE user_id = @id')
        return result.recordset as UserIdentityRow[]
      } catch (e) {
        console.error('[AzureSQL] getUserIdentities error:', e)
      }
    }
    return []
  }

  const db = getSqliteDb()
  if (db) {
    try {
      return db.prepare('SELECT provider, provider_user_id, provider_email FROM user_identities WHERE user_id = ?').all(userId) as UserIdentityRow[]
    } catch (e) {
      console.error('[SQLite] getUserIdentities error:', e)
    }
  }
  return []
}

export async function findOrCreateUser(input: IdentityInput): Promise<UserRow | null> {
  if (isAzureSql) {
    const pool = await getAzurePool()
    if (!pool) return null
    try {
      const ident = await pool.request()
        .input('p', sql.NVarChar(20), input.provider)
        .input('pid', sql.NVarChar(100), input.providerUserId)
        .query(`
          SELECT ${USER_COLUMNS_ALIASED}
          FROM users u JOIN user_identities i ON i.user_id = u.id
          WHERE i.provider = @p AND i.provider_user_id = @pid
        `)
      if (ident.recordset[0]) {
        await pool.request()
          .input('id', sql.Int, ident.recordset[0].id)
          .input('name', sql.NVarChar(100), input.displayName ?? null)
          .input('avatar', sql.NVarChar(500), input.avatarUrl ?? null)
          .input('email', sql.NVarChar(255), input.email ?? null)
          .query(`UPDATE users SET display_name = COALESCE(@name, display_name), avatar_url = COALESCE(@avatar, avatar_url), email = COALESCE(@email, email) WHERE id = @id`)
        return ident.recordset[0] as UserRow
      }

      let userId: number
      if (input.email && input.mergeByEmail !== false) {
        const byEmail = await pool.request()
          .input('email', sql.NVarChar(255), input.email)
          .query('SELECT id FROM users WHERE email = @email')
        if (byEmail.recordset[0]) {
          userId = byEmail.recordset[0].id
        } else {
          const ins = await pool.request()
            .input('email', sql.NVarChar(255), input.email)
            .input('name', sql.NVarChar(100), input.displayName ?? null)
            .input('avatar', sql.NVarChar(500), input.avatarUrl ?? null)
            .query(`INSERT INTO users (email, display_name, avatar_url) VALUES (@email, @name, @avatar); SELECT SCOPE_IDENTITY() AS id`)
          userId = Number(ins.recordset[0]?.id ?? -1)
        }
      } else {
        const ins = await pool.request()
          .input('email', sql.NVarChar(255), input.email ?? null)
          .input('name', sql.NVarChar(100), input.displayName ?? null)
          .input('avatar', sql.NVarChar(500), input.avatarUrl ?? null)
          .query(`INSERT INTO users (email, display_name, avatar_url) VALUES (@email, @name, @avatar); SELECT SCOPE_IDENTITY() AS id`)
        userId = Number(ins.recordset[0]?.id ?? -1)
      }

      if (userId > 0) {
        await pool.request()
          .input('uid', sql.Int, userId)
          .input('p', sql.NVarChar(20), input.provider)
          .input('pid', sql.NVarChar(100), input.providerUserId)
          .input('pe', sql.NVarChar(255), input.email ?? null)
          .query(`INSERT INTO user_identities (user_id, provider, provider_user_id, provider_email) VALUES (@uid, @p, @pid, @pe)`)
        const u = await pool.request().input('id', sql.Int, userId).query(`SELECT ${USER_COLUMNS} FROM users WHERE id = @id`)
        return (u.recordset[0] as UserRow) ?? null
      }
      return null
    } catch (e) {
      console.error('[AzureSQL] findOrCreateUser error:', e)
      return null
    }
  }

  const db = getSqliteDb()
  if (!db) return null
  try {
    const existing = db.prepare(`
      SELECT ${USER_COLUMNS_ALIASED}
      FROM users u JOIN user_identities i ON i.user_id = u.id
      WHERE i.provider = ? AND i.provider_user_id = ?
    `).get(input.provider, input.providerUserId) as UserRow | undefined

    if (existing) {
      db.prepare(
        `UPDATE users SET display_name = COALESCE(?, display_name), avatar_url = COALESCE(?, avatar_url), email = COALESCE(?, email) WHERE id = ?`,
      ).run(input.displayName ?? null, input.avatarUrl ?? null, input.email ?? null, existing.id)
      return db.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`).get(existing.id) as UserRow
    }

    let userId: number
    if (input.email && input.mergeByEmail !== false) {
      const byEmail = db.prepare('SELECT id FROM users WHERE email = ?').get(input.email) as { id: number } | undefined
      if (byEmail) {
        userId = byEmail.id
      } else {
        userId = Number(db.prepare('INSERT INTO users (email, display_name, avatar_url) VALUES (?, ?, ?)').run(input.email, input.displayName ?? null, input.avatarUrl ?? null).lastInsertRowid)
      }
    } else {
      userId = Number(db.prepare('INSERT INTO users (email, display_name, avatar_url) VALUES (?, ?, ?)').run(input.email ?? null, input.displayName ?? null, input.avatarUrl ?? null).lastInsertRowid)
    }

    if (userId > 0) {
      db.prepare('INSERT INTO user_identities (user_id, provider, provider_user_id, provider_email) VALUES (?, ?, ?, ?)').run(userId, input.provider, input.providerUserId, input.email ?? null)
      return db.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`).get(userId) as UserRow
    }
    return null
  } catch (e) {
    console.error('[SQLite] findOrCreateUser error:', e)
    return null
  }
}

export async function getUsageCount(userId: number, date: string): Promise<number> {
  if (isAzureSql) {
    const pool = await getAzurePool()
    if (!pool) return 0
    try {
      const result = await pool.request()
        .input('uid', sql.Int, userId)
        .input('d', sql.NVarChar(10), date)
        .query('SELECT count FROM api_usage WHERE user_id = @uid AND usage_date = @d')
      return Number(result.recordset[0]?.count ?? 0)
    } catch (e) {
      console.error('[AzureSQL] getUsageCount error:', e)
      return 0
    }
  }

  const db = getSqliteDb()
  if (!db) return 0
  try {
    const row = db.prepare('SELECT count FROM api_usage WHERE user_id = ? AND usage_date = ?').get(userId, date) as { count: number } | undefined
    return Number(row?.count ?? 0)
  } catch (e) {
    console.error('[SQLite] getUsageCount error:', e)
    return 0
  }
}

/**
 * Atomically consume one AI-analysis quota for the given user/date.
 * If the user has reached `max` usages, the call fails (allowed=false).
 */
export async function consumeAnalysisQuota(userId: number, date: string, max: number): Promise<QuotaResult> {
  if (isAzureSql) {
    const pool = await getAzurePool()
    if (!pool) return { allowed: false, used: 0, remaining: 0, max }
    try {
      await pool.request()
        .input('uid', sql.Int, userId)
        .input('d', sql.NVarChar(10), date)
        .query(`
          IF NOT EXISTS (SELECT 1 FROM api_usage WHERE user_id = @uid AND usage_date = @d)
          BEGIN
            INSERT INTO api_usage (user_id, usage_date, count) VALUES (@uid, @d, 0)
          END
        `)
      const res = await pool.request()
        .input('uid', sql.Int, userId)
        .input('d', sql.NVarChar(10), date)
        .input('max', sql.Int, max)
        .query('UPDATE api_usage SET count = count + 1 WHERE user_id = @uid AND usage_date = @d AND count < @max')
      const allowed = (res.rowsAffected[0] ?? 0) > 0
      const used = await getUsageCount(userId, date)
      return { allowed, used, remaining: Math.max(0, max - used), max }
    } catch (e) {
      console.error('[AzureSQL] consumeAnalysisQuota error:', e)
      return { allowed: false, used: 0, remaining: 0, max }
    }
  }

  const db = getSqliteDb()
  if (!db) return { allowed: false, used: 0, remaining: 0, max }
  try {
    db.prepare('INSERT OR IGNORE INTO api_usage (user_id, usage_date, count) VALUES (?, ?, 0)').run(userId, date)
    const res = db.prepare('UPDATE api_usage SET count = count + 1 WHERE user_id = ? AND usage_date = ? AND count < ?').run(userId, date, max)
    const allowed = res.changes > 0
    const used = await getUsageCount(userId, date)
    return { allowed, used, remaining: Math.max(0, max - used), max }
  } catch (e) {
    console.error('[SQLite] consumeAnalysisQuota error:', e)
    return { allowed: false, used: 0, remaining: 0, max }
  }
}

export async function getRecognitionUsage(userId: number, date: string): Promise<number> {
  if (isAzureSql) {
    const pool = await getAzurePool()
    if (!pool) return 0
    try {
      const result = await pool.request()
        .input('uid', sql.Int, userId)
        .input('d', sql.NVarChar(10), date)
        .query('SELECT count FROM recognition_usage WHERE user_id = @uid AND usage_date = @d')
      return Number(result.recordset[0]?.count ?? 0)
    } catch (e) {
      console.error('[AzureSQL] getRecognitionUsage error:', e)
      return 0
    }
  }

  const db = getSqliteDb()
  if (!db) return 0
  try {
    const row = db.prepare('SELECT count FROM recognition_usage WHERE user_id = ? AND usage_date = ?').get(userId, date) as { count: number } | undefined
    return Number(row?.count ?? 0)
  } catch (e) {
    console.error('[SQLite] getRecognitionUsage error:', e)
    return 0
  }
}

/**
 * 辨識失敗或結果為空（技術性失敗，非使用者責任）時補回一單位額度，
 * 避免測試/OCR 不佳把每日額度燒光。
 */
export async function refundRecognitionQuota(userId: number, date: string): Promise<void> {
  if (isAzureSql) {
    const pool = await getAzurePool()
    if (!pool) return
    try {
      await pool.request()
        .input('uid', sql.Int, userId)
        .input('d', sql.NVarChar(10), date)
        .query('UPDATE recognition_usage SET count = count - 1 WHERE user_id = @uid AND usage_date = @d AND count > 0')
    } catch (e) {
      console.error('[AzureSQL] refundRecognitionQuota error:', e)
    }
    return
  }

  const db = getSqliteDb()
  if (!db) return
  try {
    db.prepare('UPDATE recognition_usage SET count = count - 1 WHERE user_id = ? AND usage_date = ? AND count > 0').run(userId, date)
  } catch (e) {
    console.error('[SQLite] refundRecognitionQuota error:', e)
  }
}

/**
 * 依中文（或部分）股票名稱查詢候選代號；TWSE 零股交易表優先（涵蓋上市上櫃/ETF），
 * 找不到再於股東會紀念品表找。同時支援本機 SQLite 與線上 AzureSQL。
 * 回傳一組 { stock_id, stock_name }（stock_id 依市場為純數字代號，如 "2330"、"0050"）。
 */
export async function searchStocksByName(keyword: string): Promise<Array<{ stock_id: string; stock_name: string }>> {
  const trimmed = keyword.trim()
  if (!trimmed) return []
  const kw = `%${trimmed}%`
  const prefix = `${trimmed}%`
  // 1. 優先查詢 odd_lot_trades 表（涵蓋上市上櫃與 ETF，名稱最標準最新）
  // 支援同時比對 stock_name 或 stock_id；且排除少數 stock_name 純為代號的紀錄以取得正式中文
  const rows = await dbQueryAll(
    `SELECT stock_id, stock_name FROM odd_lot_trades
     WHERE (stock_name LIKE @kw OR stock_id LIKE @kw)
       AND stock_name != stock_id
     GROUP BY stock_id, stock_name
     ORDER BY CASE 
       WHEN stock_id = @exact THEN 0 
       WHEN stock_name = @exact THEN 1 
       WHEN stock_id LIKE @prefix THEN 2
       WHEN stock_name LIKE @prefix THEN 3
       ELSE 4 
     END, stock_id
     LIMIT 15`,
    { kw, exact: trimmed, prefix },
  )
  if (rows.length) return rows as Array<{ stock_id: string; stock_name: string }>

  // 2. 備援查詢股東會紀念品表 shareholder_gifts
  const gifts = await dbQueryAll(
    `SELECT DISTINCT stock_id, stock_name FROM shareholder_gifts
     WHERE stock_name LIKE @kw OR stock_id LIKE @kw
     ORDER BY CASE 
       WHEN stock_id = @exact THEN 0 
       WHEN stock_name = @exact THEN 1 
       WHEN stock_id LIKE @prefix THEN 2
       ELSE 3 
     END, stock_id
     LIMIT 15`,
    { kw, exact: trimmed, prefix },
  )
  if (gifts.length) return gifts as Array<{ stock_id: string; stock_name: string }>

  // 3. 若皆無正式中文，最後容許 stock_name == stock_id 的保底紀錄
  const fallbackRows = await dbQueryAll(
    `SELECT stock_id, stock_name FROM odd_lot_trades
     WHERE stock_name LIKE @kw OR stock_id LIKE @kw
     GROUP BY stock_id, stock_name
     ORDER BY CASE WHEN stock_id = @exact THEN 0 ELSE 1 END, stock_id
     LIMIT 15`,
    { kw, exact: trimmed },
  )
  return fallbackRows as Array<{ stock_id: string; stock_name: string }>
}

/**
 * Optimal String Alignment Damerau-Levenshtein 距離（插入/刪除/取代/相鄰交換）。
 * 供模糊比對用；兩個字串相同回 0。
 */
export function damerauLevenshtein(a: string, b: string): number {
  if (a === b) return 0
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + cost)
      }
    }
  }
  return dp[m][n]
}

/**
 * 模糊股票名稱搜尋：依查詢前兩個中文字（發行商前綴）撈候選池，
 * 再用 Damerau-Levenshtein 距離排序，撈回與 OCR 誤讀名稱最接近的正名。
 * 只處理「整段名稱幾乎正確、僅單字誤讀」的典型 OCR 錯誤
 * （如「國泰永績高股息」→「國泰永續高股息」），距離超過門檻一律丟棄。
 */
export async function fuzzySearchStocksByName(
  query: string,
  limit = 8,
): Promise<Array<{ stock_id: string; stock_name: string; dist: number }>> {
  const trimmed = query.trim()
  if (!trimmed || trimmed.length < 3) return []
  const prefix = trimmed.match(/[\u4e00-\u9fff]{2}/)?.[0] ?? ''
  if (!prefix || prefix.length < 2) return []

  const pool = (await dbQueryAll(
    `SELECT stock_id, stock_name FROM odd_lot_trades
     WHERE stock_name LIKE @prefix
     GROUP BY stock_id, stock_name
     ORDER BY stock_id
     LIMIT 80`,
    { prefix: `${prefix}%` },
  )) as Array<{ stock_id: string; stock_name: string }>

  let poolSet = pool
  if (pool.length < limit) {
    const gifts = (await dbQueryAll(
      `SELECT DISTINCT stock_id, stock_name FROM shareholder_gifts
       WHERE stock_name LIKE @prefix
       ORDER BY stock_id
       LIMIT 80`,
      { prefix: `${prefix}%` },
    )) as Array<{ stock_id: string; stock_name: string }>
    if (gifts.length) {
      const seen = new Set(pool.map(r => r.stock_id))
      poolSet = [...pool, ...gifts.filter(r => !seen.has(r.stock_id))]
    }
  }

  if (!poolSet.length) return []
  const threshold = Math.max(3, Math.ceil(trimmed.length / 2))
  const scored = poolSet
    .map(r => ({ ...r, dist: damerauLevenshtein(r.stock_name, trimmed) }))
    .filter(r => r.dist <= threshold)
    .sort((x, y) => x.dist - y.dist || x.stock_id.localeCompare(y.stock_id))
    .slice(0, limit)
  return scored
}

/**
 * Atomically consume one image-recognition quota for the given user/date.
 * Separate from `consumeAnalysisQuota` (uses its own table/limit).
 */
export async function consumeRecognitionQuota(userId: number, date: string, max: number): Promise<QuotaResult> {
  if (isAzureSql) {
    const pool = await getAzurePool()
    if (!pool) return { allowed: false, used: 0, remaining: 0, max }
    try {
      await pool.request()
        .input('uid', sql.Int, userId)
        .input('d', sql.NVarChar(10), date)
        .query(`
          IF NOT EXISTS (SELECT 1 FROM recognition_usage WHERE user_id = @uid AND usage_date = @d)
          BEGIN
            INSERT INTO recognition_usage (user_id, usage_date, count) VALUES (@uid, @d, 0)
          END
        `)
      const res = await pool.request()
        .input('uid', sql.Int, userId)
        .input('d', sql.NVarChar(10), date)
        .input('max', sql.Int, max)
        .query('UPDATE recognition_usage SET count = count + 1 WHERE user_id = @uid AND usage_date = @d AND count < @max')
      const allowed = (res.rowsAffected[0] ?? 0) > 0
      const used = await getRecognitionUsage(userId, date)
      return { allowed, used, remaining: Math.max(0, max - used), max }
    } catch (e) {
      console.error('[AzureSQL] consumeRecognitionQuota error:', e)
      return { allowed: false, used: 0, remaining: 0, max }
    }
  }

  const db = getSqliteDb()
  if (!db) return { allowed: false, used: 0, remaining: 0, max }
  try {
    db.prepare('INSERT OR IGNORE INTO recognition_usage (user_id, usage_date, count) VALUES (?, ?, 0)').run(userId, date)
    const res = db.prepare('UPDATE recognition_usage SET count = count + 1 WHERE user_id = ? AND usage_date = ? AND count < ?').run(userId, date, max)
    const allowed = res.changes > 0
    const used = await getRecognitionUsage(userId, date)
    return { allowed, used, remaining: Math.max(0, max - used), max }
  } catch (e) {
    console.error('[SQLite] consumeRecognitionQuota error:', e)
    return { allowed: false, used: 0, remaining: 0, max }
  }
}
