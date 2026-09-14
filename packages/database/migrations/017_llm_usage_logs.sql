-- 017_llm_usage_logs.sql
-- LLM Agent 用量逐次明細：Arena 8 Agent 每次成功 LLM 呼叫一筆，
-- model 為實際服務模型（primary 或 fallback）、usedFallback 標記是否走備援。
-- Azure SQL 由 getAzurePool() 建立（本檔為 SQLite/migrate 追蹤用）。
CREATE TABLE IF NOT EXISTS llm_usage_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent TEXT NOT NULL,
  model TEXT NOT NULL,
  usedFallback INTEGER DEFAULT 0,
  promptTokens INTEGER DEFAULT 0,
  completionTokens INTEGER DEFAULT 0,
  totalTokens INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_llm_usage_created ON llm_usage_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_llm_usage_agent ON llm_usage_logs(agent);