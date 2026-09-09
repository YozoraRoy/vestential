-- 013_social_card_images.sql
-- 後台手動發布用的圖卡快照：乾跑選定、要發布的圖以 bytes 存下，
-- 並由公開 /api/social/card-image 端點提供給 IG/Threads 下載，確保圖卡與預覽一致。

CREATE TABLE IF NOT EXISTS social_card_images (
  edition_key TEXT NOT NULL,
  style TEXT NOT NULL,
  image_data BLOB NOT NULL,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  PRIMARY KEY (edition_key, style)
);
