-- 010_social_posts.sql
-- 社群小編 Agent：IG / Threads 自動發布紀錄
-- (token 一律存 env，不落 DB：IG_ACCESS_TOKEN/IG_USER_ID/THREADS_ACCESS_TOKEN/THREADS_USER_ID)

CREATE TABLE IF NOT EXISTS social_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT NOT NULL,                    -- 'instagram' | 'threads'
  edition_key TEXT NOT NULL,                 -- 對應市場焦點總覽的 generated_at（新版判斷）
  content TEXT NOT NULL,                     -- 發布文案
  image_url TEXT,                            -- 圖卡公開 URL
  status TEXT NOT NULL DEFAULT 'pending',    -- pending | container_created | published | failed
  container_id TEXT,
  external_id TEXT,
  error TEXT,
  published_at TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  UNIQUE (platform, edition_key)
);

CREATE INDEX IF NOT EXISTS idx_social_posts_platform_created ON social_posts(platform, created_at);