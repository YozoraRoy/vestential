-- 012_agent_settings.sql
-- 後台可調的 Agent 參數（市場焦點小編 / 社群小編 / 競技場）
-- 一律 key-value；prompt / 參數可於 /admin 編輯，未設定時各 Agent 使用內建預設。

CREATE TABLE IF NOT EXISTS agent_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  category TEXT,
  label TEXT,
  updated_at TEXT DEFAULT (datetime('now','localtime'))
);
