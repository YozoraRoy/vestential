-- 016_market_focus_logs.sql
-- 市場焦點管線事件日誌：LLM 失敗／兜底／回填／job 失敗等，供診斷與告警帶詳情。
-- Azure SQL 由 getAzurePool() 建立（本檔為 SQLite/migrate 追蹤用）。
CREATE TABLE IF NOT EXISTS market_focus_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  level TEXT NOT NULL,
  code TEXT,
  job_id TEXT,
  edition_key TEXT,
  message TEXT NOT NULL,
  detail TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_mf_logs_created ON market_focus_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_mf_logs_source ON market_focus_logs(source);