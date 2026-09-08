-- 011_arena_tick_phases.sql
-- 競技場分段 tick：階段進度防重（arena_round_progress）＋每日股票池固化（arena_round_universe）
-- 讓 premarket / slot0..3 / close 可在不同時間各別觸發、各自冪等，並確保跨階段股票池一致。

CREATE TABLE IF NOT EXISTS arena_round_progress (
  round_date TEXT NOT NULL,
  phase TEXT NOT NULL,
  note TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  PRIMARY KEY (round_date, phase)
);

CREATE TABLE IF NOT EXISTS arena_round_universe (
  round_date TEXT NOT NULL,
  symbol TEXT NOT NULL,
  name TEXT,
  PRIMARY KEY (round_date, symbol)
);