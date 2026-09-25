-- Issue #35：TWSE 除息快取表（TWT48U 每日 CSV 落庫，供 /portfolio 當年 YTD 估算）。
-- 冪等多語系寫法：
-- SQLite 端由 db.ts ensure 區塊以 CREATE TABLE IF NOT EXISTS 補建（見既有慣例）；
-- Azure SQL 端由 db.ts per-table 獨立守衛補建；本檔供 migrate 追蹤（SQLite）使用。
-- 語法沿 022 慣例（SQLite 與 T-SQL 皆相容；TEXT 語義同 NVARCHAR；UNIQUE 防重抓冪等）。
CREATE TABLE IF NOT EXISTS twse_dividends (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  ex_date TEXT NOT NULL,
  cash_dividend REAL NOT NULL,
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  UNIQUE (symbol, ex_date)
);
CREATE INDEX IF NOT EXISTS idx_twse_dividends_ex_date ON twse_dividends(ex_date);
CREATE INDEX IF NOT EXISTS idx_twse_dividends_symbol ON twse_dividends(symbol);
