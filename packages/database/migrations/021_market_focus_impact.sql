-- 021_market_focus_impact.sql
-- Issue #19 交易策略閉環（A3+B3 新聞影響結構化）：
-- market_focus 新增新聞影響欄位，供 filterNewsByAI / generateArticleSummaries 寫入、
-- 新聞卡（NewsCard）呈現。冪等多語系寫法：
-- SQLite 端由 db.ts ensure 區塊以 try/catch ALTER 補欄（見 006/007 既有慣例）；
-- Azure SQL 端由 db.ts COL_LENGTH 守衛補欄；本檔供 migrate 追蹤（SQLite）使用。
ALTER TABLE market_focus ADD impact_direction TEXT;
ALTER TABLE market_focus ADD scope TEXT;
ALTER TABLE market_focus ADD horizon TEXT;
ALTER TABLE market_focus ADD affected_sectors TEXT;
ALTER TABLE market_focus ADD action TEXT;
ALTER TABLE market_focus ADD related_symbols TEXT;
