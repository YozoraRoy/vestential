-- 024_social_first_reply.sql
-- Issue #31 首回覆問 Meta AI：social_posts 補「首回覆」去重＋驗證記錄欄位。
-- 定案（developer）：沿用 social_posts 加欄（不另建表），去重鍵為同
-- (platform, edition_key) 列的 first_reply_status='posted'；驗證協議記錄用
-- first_reply_checked_at＋first_reply_verdict（pending｜keep_tag｜downgraded）。
-- 語法沿 018 慣例（SQLite 與 T-SQL 皆相容：不加 COLUMN 關鍵字；
-- TEXT 語義同 NVARCHAR(MAX)，冪等可重跑，runner 遇到 duplicate column 即 skip）。
ALTER TABLE social_posts ADD first_reply_status NVARCHAR(30);
ALTER TABLE social_posts ADD first_reply_external_id NVARCHAR(100);
ALTER TABLE social_posts ADD first_reply_error TEXT;
ALTER TABLE social_posts ADD first_reply_category NVARCHAR(20);
ALTER TABLE social_posts ADD first_reply_text TEXT;
ALTER TABLE social_posts ADD first_reply_checked_at NVARCHAR(50);
ALTER TABLE social_posts ADD first_reply_verdict NVARCHAR(20);
