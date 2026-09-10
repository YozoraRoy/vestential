-- 015_cycle_entry_signals.sql
-- 週期進場模型預估：每日盤後掃描市值前 100 大台股，記錄通過規則門檻的「已現合適進場點」標的。
-- 保留歷史版次（以 edition_date + symbol 為唯一鍵），供前台展示與後台瀏覽。

CREATE TABLE IF NOT EXISTS cycle_entry_signals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  edition_date TEXT NOT NULL,                 -- 版次（台灣交易日 YYYY-MM-DD）
  symbol TEXT NOT NULL,                       -- Yahoo 代號，如 "2330.TW"
  name TEXT,                                  -- 標的名稱（Yahoo 短名，缺失時用宇宙清單中文名）
  market_cap REAL,                            -- 市值（美元）
  signal_rank INTEGER,                        -- 當日排序（score 高 → 市值高）
  price REAL,                                 -- 訊號日收盤
  entry_price_hint REAL,                      -- 進場價提示：
  score INTEGER NOT NULL DEFAULT 0,           -- 命中規則數
  matched_rules TEXT NOT NULL DEFAULT '',     -- 逗號分隔，如 "R1,R4,R5"
  cycle_stage TEXT,                           -- near-high | mild-pullback | pullback | deep-pullback
  pct_off_52w_high REAL,                      -- 距 52 週高點 %（負值）
  pct_off_52w_low REAL,                       -- 距 52 週低點 %（正值）
  rsi REAL,                                   -- RSI(14)
  ma20 REAL,
  ma60 REAL,
  macd_hist REAL,                             -- MACD 柱狀值
  llm_note TEXT,                              -- AI 評述（失敗時 NULL，不整批失敗）
  bt_total_signals INTEGER DEFAULT 0,         -- 進場後擬合回測：歷史訊號次數
  bt_wins INTEGER DEFAULT 0,
  bt_losses INTEGER DEFAULT 0,
  bt_neutral INTEGER DEFAULT 0,
  bt_win_rate REAL,                           -- 勝率（0~1）
  bt_avg_days REAL,                           -- 獲利交易平均達成天數
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_cycle_entry_signals_date ON cycle_entry_signals(edition_date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cycle_entry_signals_unique ON cycle_entry_signals(edition_date, symbol);

CREATE TABLE IF NOT EXISTS cycle_entry_meta (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  edition_date TEXT NOT NULL UNIQUE,
  summary TEXT,                               -- 當日 AI 總覽評述
  signal_count INTEGER NOT NULL DEFAULT 0,
  generated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_cycle_entry_meta_date ON cycle_entry_meta(edition_date);