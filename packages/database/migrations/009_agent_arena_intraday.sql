-- 009_agent_arena_intraday.sql
-- 擴充 AI Agent 競技場：盤中時點路徑、盤前簡報、決策時間軸與圓桌討論

ALTER TABLE arena_agents ADD COLUMN personality TEXT;
ALTER TABLE arena_agents ADD COLUMN strategy_params TEXT;

ALTER TABLE arena_trades ADD COLUMN slot INTEGER;

CREATE TABLE IF NOT EXISTS arena_intraday_prices (
  round_date TEXT NOT NULL,
  symbol TEXT NOT NULL,
  slot INTEGER NOT NULL,
  time_label TEXT,
  price REAL NOT NULL,
  change_pct REAL,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  PRIMARY KEY (round_date, symbol, slot)
);

CREATE INDEX IF NOT EXISTS idx_arena_intraday_date ON arena_intraday_prices(round_date);

CREATE TABLE IF NOT EXISTS arena_market_briefings (
  round_date TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  model TEXT,
  fallback_used INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS arena_decision_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id INTEGER NOT NULL,
  season_id INTEGER,
  round_date TEXT NOT NULL,
  phase TEXT NOT NULL,
  slot INTEGER,
  content TEXT NOT NULL,
  model TEXT,
  fallback_used INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_arena_decision_agent_date ON arena_decision_logs(agent_id, round_date);
CREATE INDEX IF NOT EXISTS idx_arena_decision_round_date ON arena_decision_logs(round_date);

CREATE TABLE IF NOT EXISTS arena_discussions (
  round_date TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  model TEXT,
  fallback_used INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
