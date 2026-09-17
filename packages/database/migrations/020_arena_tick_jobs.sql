-- 020_arena_tick_jobs.sql
-- 競技場分段 tick 的背值 job 表：
-- 記錄每次 premarket / slot0..3 / close 分段執行的非同步狀態，
-- 讓 tick route 立即回傳 jobId（不再同步等待 LLM），由 workflow / scheduler / admin UI 輪詢 status。
-- Azure SQL 由 getAzurePool() 建立（本檔為 SQLite/migrate 追蹤用，且冪等可重跑）。
CREATE TABLE IF NOT EXISTS arena_tick_jobs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  round_date TEXT    NOT NULL,
  phase      TEXT    NOT NULL,                          -- premarket | slot | close
  slot       INTEGER,                                   -- phase=slot 時指定 slot index
  status     TEXT    NOT NULL DEFAULT 'running',        -- running | done | failed
  result     TEXT,                                      -- JSON：ArenaTickResult（done 時寫入）
  error      TEXT,                                      -- 失敗訊息（failed 時寫入）
  created_at TEXT    DEFAULT (datetime('now','localtime')),
  updated_at TEXT    DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_arena_tick_jobs_round_phase_slot ON arena_tick_jobs(round_date, phase, slot);
CREATE INDEX IF NOT EXISTS idx_arena_tick_jobs_status ON arena_tick_jobs(status);
