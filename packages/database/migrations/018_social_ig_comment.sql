-- 018_social_ig_comment.sql
-- IG 導流改放「第一則留言」：social_posts 補記留言發布狀態，
-- 避免 force 重發／重試時重複留言，並供後台瀏覽留言是否貼上。
-- 語法沿 003~007 慣例（SQLite 與 T-SQL 皆相容：不加 COLUMN 關鍵字）。
ALTER TABLE social_posts ADD comment_status NVARCHAR(30);
ALTER TABLE social_posts ADD comment_external_id NVARCHAR(100);
ALTER TABLE social_posts ADD comment_error NVARCHAR(MAX);