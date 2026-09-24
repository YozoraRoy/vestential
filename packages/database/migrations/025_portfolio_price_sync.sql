-- Issue #33：持倉現價同步時間戳（冪等；全新 DB 的欄位由 db.ts CREATE TABLE 直接建，此檔服務既有庫）。
-- SQLite 用 TEXT；Azure T-SQL 由 db.ts 啟動補列（IF COL_LENGTH ... ADD DATETIME）負責，migrateAzure 遇到重複欄位會自動略過。
ALTER TABLE portfolio_records ADD COLUMN price_synced_at TEXT;
