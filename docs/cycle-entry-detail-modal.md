# 已進場標的專屬詳情（曲線圖＋規則）實作清單

> 狀態：待實作。寫於 2026-09-11。
>
> 背景：user 反饋「點擊已進場標的 → 應跑出該標的專屬曲線圖，參數／歷史勝率與列表一致，並附詳細規則說明，不再遷就 `/backtest`」。
>
> 審查結論：先前某次 AI 回覆宣稱「已完全設計與實作完畢」，但 code review 確認全部未落地（git 工作區乾淨；無 `CycleEntryDetailModal`、無 `/api/cycle-entry/detail`、無 Recharts、無逐筆明細、無規則說明 UI）。點擊仍深鏈到 `/backtest?symbol=..&preset=short`。
>
> 本清單**只列尚未實作項目**。已實作部分集中列於文末「已排除（已有，不需更動）」供對照。

---

## 待實作清單

### 1. 回測引擎逐筆交易輸出

- [ ] 現況 `runSignalBacktest` 只回傳彙總（`packages/cycle-entry/src/rules.ts:186-221`），無逐筆日期／價格。
- [ ] 擴充（於 `rules.ts`）輸出每筆 trade：signalDate、entryDate、entryPrice（次日開盤價）、exitDate、exitPrice、returnPct、holdingDays、exitReason（`win·+8% 停利` / `loss·-5% 停損` / `neutral·40 日`）。
- [ ] 沿用 `passesGate`＋`simulateTrade`，明細加總必須與 `EntryStats`（wins/losses/neutral）完全一致。
- [ ] 驗收：對同一 OHLCV 輸入，明細數與 `btTotalSignals` 相同，勝率公式結果相同。

### 2. 新公開端點 `GET /api/cycle-entry/detail?symbol=`

- [ ] 新建 `apps/web/src/app/api/cycle-entry/detail/route.ts`。
- [ ] 回傳：該版次 signal row（price／score／matchedRules／cycleStage／`bt_win_rate`…）＋近 1 年 OHLCV（畫圖用）＋逐筆 trade ＋今日 R1~R5 符合狀態。
- [ ] symbol 不存在於最新版次或未過 gate → 404。
- [ ] 勝率直接讀 DB `bt_win_rate`（或複算後與之斷言一致）；**禁止**改用 `/backtest` 引擎。
- [ ] 快取與 `revalidateTag('cycle-entry')` 同步失效。
- [ ] 驗收：`detail?symbol=2317` 回傳 4 筆 trades、勝率 50%，與列表顯示一致。

### 3. `CycleEntryDetailModal` 元件

- [ ] 新建 `apps/web/src/components/cycle-entry-detail-modal.tsx`（`'use client'`）。
- [ ] list／card 共用：點「名稱、勝率、曲線圖與詳情」任一入口 → 開 modal（不再跳 `/backtest`）。
- [ ] ESC、遮罩點擊、關閉鈕；RWD（手機全屏）；body scroll lock。
- [ ] URL 直連分享 `?symbol=2317`：mount 時讀 query 自動開對應 modal。
- [ ] 驗收：點列內任一入口開對應 modal；直接開 URL 也開對應 modal。

### 4. 雙互動曲線圖（Recharts）

- [ ] Tab1 股價走勢：近 1 年收盤線（`var(--accent)`）＋ MA20（黃）＋ MA60（藍）＋ 進場日綠點 marker。
- [ ] Tab2 累積報酬曲線（Equity Curve）：依逐筆 trade 依序累積之 % 曲線。
- [ ] 深色質感沿用既有 CSS 變數，不引進額外 UI 框架。
- [ ] 驗收：圖表可 hover、進場點數量 ＝ trade 數。

### 5. 逐筆交易明細表

- [ ] 欄位：訊號日、進場日（次日開盤價）、出場日、出場價、報酬%（勝綠／敗紅）、持有天數、出場原因。
- [ ] 0 筆時顯示空狀態。
- [ ] 驗收：2417／2317 等樣本與 API 回傳逐筆一致。

### 6. 規則與計算公式說明區

- [ ] 勝率公式條目：`wins / (wins + losses)`（排除 neutral），例 `2 / (2 + 2) = 50%`。
- [ ] R1~R5 門檻逐條列出 ＋ 該股「今日」符合與否（讀 signal row 的 matchedRules／score）。
- [ ] 驗收：詳情內顯示 4 次訊號、勝率 50%、平均持有 3.5 天，與列表一致。

### 7. cycle-entry 頁面連結改造

- [ ] `apps/web/src/components/cycle-entry-view.tsx:167`、`:247` 的 `/backtest?symbol=..&preset=short` 深鏈 → 改為觸發 modal（名稱／勝率／曲線圖三入口）。
- [ ] `apps/web/src/app/cycle-entry/page.tsx:194-199` 頁尾「回測實驗室」CTA 保留為次要入口，調整文案避免誤導成「該股曲線圖」。
- [ ] `/backtest` 頁面本身不動。
- [ ] 驗收：單股點擊不再跳 `/backtest`；回測實驗室仍可從頁尾進入。

### 8. i18n

- [ ] `zh-TW`／`en`／`ja`（`apps/web/src/i18n/locales/*.ts`）新增 modal 相關 keys（標題、分頁、表格欄、規則說明、出場原因），同步 `i18n/dictionary-types.ts`。
- [ ] 驗收：三語系 modal 完整顯示、無缺漏 key。

### 9. 品質與驗收

- [ ] 依 `AGENTS.md` 檢查／清理 dev server 後起單一台供 QA。
- [ ] 驗收要點：**列表勝率 50% ＝＝ modal 內 50% ＝＝ API winRate**。
- [ ] `npm run lint`、`npm run typecheck`（或專案對應指令）通過；既有 list／card 樣式不受影響。

---

## 已排除（已有，不需更動）

以下為本次訴求中已存在之基礎，故**不列入**執行清單：

- 勝率一致性核心：`runSignalBacktest`（近 1 年、+8%／-5%／40 日、非重疊鎖、同日雙觸及記為敗）－ `packages/cycle-entry/src/rules.ts:186-221`
- 發布門檻 `passesGate`（score ≥ 3 且 R1 或 R2）－ `rules.ts:141-144`
- `bt_win_rate` 等彙總欄位儲存／讀取（掃描管線寫入 `bt_win_rate`，列表與詳情讀同一欄位）－ `packages/database/src/db.ts`、`apps/web/src/lib/cycle-entry.ts:103`
- 列表／卡片勝率色階與 0~100 向下相容顯示－ `apps/web/src/components/cycle-entry-view.tsx:78-101`
- 近 1 年歷史資料抓取 provider（備妥給新端點複用）－ `apps/web/src/lib/cycle-entry.ts:58-77`