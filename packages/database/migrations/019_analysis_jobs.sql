-- 019_analysis_jobs.sql
-- AI 分析執行進度任務表：
-- 記錄每次分析執行的階段性進度（跑多少看多少），任一 agent 失敗時保留已完成部分，
-- 供 /api/analyze/resume 從斷點續跑剩餘 agent（已完成的不重算、不重新計費）。
-- Azure SQL 由 getAzurePool() 建立（本檔為 SQLite/migrate 追蹤用，且冪等可重跑）。
CREATE TABLE IF NOT EXISTS analysis_jobs (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        INTEGER NOT NULL,
  ticker         TEXT    NOT NULL,
  date           TEXT    NOT NULL,
  status         TEXT    NOT NULL DEFAULT 'running',  -- running | partial | completed | failed
  enabled_agents TEXT    NOT NULL DEFAULT '[]',        -- JSON 陣列：本次啟用的 agent
  agent_states   TEXT    NOT NULL DEFAULT '{}',        -- JSON：agent → { state, reportField, content, error }
  state_snapshot TEXT    NOT NULL DEFAULT '{}',        -- JSON：已完成的 AnalysisState 部分快照
  failed_agent   TEXT,
  error          TEXT,
  created_at     TEXT    DEFAULT (datetime('now', 'localtime')),
  updated_at     TEXT    DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_analysis_jobs_user ON analysis_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_analysis_jobs_ticker ON analysis_jobs(ticker);
CREATE INDEX IF NOT EXISTS idx_analysis_jobs_status ON analysis_jobs(status);
