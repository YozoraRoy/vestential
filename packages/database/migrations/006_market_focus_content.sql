ALTER TABLE market_focus ADD content TEXT;
ALTER TABLE market_focus ADD source_url TEXT;
CREATE TABLE IF NOT EXISTS market_focus_meta (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  summary TEXT NOT NULL,
  generated_at TEXT
);