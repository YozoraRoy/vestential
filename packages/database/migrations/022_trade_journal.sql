-- 022_trade_journal.sql
-- Issue #21 交易日誌 CRUD＋AI 覆盤（紀律/勝率歸因）：
-- 新表 trade_journal，供 /journal 日誌 CRUD＋月統計＋AI 覆盤使用。
-- 冪等多語系寫法：
-- SQLite 端由 db.ts ensure 區塊以 CREATE TABLE IF NOT EXISTS 補建（見既有慣例）；
-- Azure SQL 端由 db.ts per-table 獨立守衛補建；本檔供 migrate 追蹤（SQLite）使用。
CREATE TABLE IF NOT EXISTS trade_journal (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  trade_date TEXT NOT NULL,
  symbol TEXT NOT NULL,
  direction TEXT NOT NULL,
  entry_price REAL NOT NULL,
  exit_price REAL NOT NULL,
  shares REAL NOT NULL,
  reason TEXT NOT NULL,
  stop_loss_obeyed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  updated_at TEXT DEFAULT (datetime('now', 'localtime'))
);
CREATE INDEX IF NOT EXISTS idx_trade_journal_user ON trade_journal(user_id, id);
CREATE INDEX IF NOT EXISTS idx_trade_journal_date ON trade_journal(user_id, trade_date);
