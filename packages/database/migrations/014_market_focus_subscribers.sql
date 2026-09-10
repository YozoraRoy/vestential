-- 014_market_focus_subscribers.sql
-- 市場焦點電子報訂閱名單：前台訂閱 Email，後台可管理（取消/恢復/刪除）。
-- token 用於退訂驗證（公開退訂連結需帶 email + token，不需登入）。

CREATE TABLE IF NOT EXISTS market_focus_subscribers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active',       -- active | unsubscribed
  token TEXT NOT NULL,                          -- 退訂驗證令牌
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT DEFAULT (datetime('now','localtime')),
  unsubscribed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_market_focus_subscribers_status ON market_focus_subscribers(status);