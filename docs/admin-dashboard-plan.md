# 後台改版＋社群文案/梗圖（乾跑預覽）整合計畫

> 狀態：已確認需求、尚未動工。寫於 2026-09-09。
>
> 本文統整兩份來源為單一計畫：
> 1. 後台 /admin 儀表板改版（含競技場管理、Agent 設定、用量報表優化）
> 2. 原 `docs/social-dryrun-preview.md`（社群小編乾跑預覽＋梗圖）——**本檔取代之**

---

## 目標概述

把現行 /admin（單頁卡片式）改成**後台專屬儀表板**（獨立於前台設計、左側導覽、獨立路由），
同時補強：競技場管理（按鈕說明＋當輪結果＋每 agent 決策歷程）、Agent 設定
（唯讀欄位與說明、滑價「?」tooltip、競技場 prompt）、用量報表（辨識=OCR 說明），
最後落地社群小編的**乾跑預覽**與**經濟/科技梗圖**。

## 現況問題（動機）

- /admin 全部功能堆在單一垂直卡片頁，無導覽、無分頁、樣式與前台一致所以不像「後台」。
- **社群小編「乾跑生成文案」只印 JSON 橫幅，看不到文案也看不到圖卡**（圖卡 buffer 被丟棄）。
- **競技場管理**：按鈕（Pre-market / Slot0-3 / 收盤結算）無說明、按完看不到當輪
  實際效果、看不到每個 agent 的投資決策歷程（decision log/交易理由其實都在 DB）。
- **Agent 設定**：直接給全部欄位 textarea；平台硬上限（IG 2200 / Threads 500 字）也不該被改；
  滑價 slippage 無解釋。
- **用量報表**「辨識」欄位語意不明（實為照片/對帳單 OCR 辨識次數）。
- 產線 daily alert：`oddlot_stale` 在台灣早盤（今日盤後資料未公布）會**誤報 error**。

## 已確認決策

- 梗圖：**v1 文字梗圖先做（零成本）**，v2 AI 生圖排入 backlog。
- /admin：**獨立路由**（`/admin/market-focus`、`/admin/social`、`/admin/arena`、
  `/admin/settings`、`/admin/usage`…），非單頁 SPA tab。
- 範圍：**全做**。
- **建立並執行「產品經理」opencode 子代理**做後台功能稽核，結果當 backlog。

---

## Phase 0 — 產品經理 agent（稽核 → backlog）

1. 以 customize-opencode 規範建立 `.opencode/agent/product-manager.md` 子代理：
   輸入後台範疇，逐一走讀「後台按鈕 → API → DB/信件副作用 → 使用者所見」，
   輸出《後台功能稽核報告》（作用 / 缺漏 / 風險 / 建議）。
2. 執行稽核，結果（優先序、缺漏）併入本計畫 backlog。

## Phase 1 — 後端資料面

- 新 admin API：
  - `GET /api/admin/arena/agents`：agents 清單（tone/personality/strategy/status/權益）
    + `POST` 調 `updateArenaAgentConfig`（改 personality / tone / strategy_params）。
  - `GET /api/admin/arena/decisions?round_date=&agent_id=`：
    包 `arena_decision_logs`＋`arena_trades`＋holdings（DB accessor 已全 export，免遷移）。
  - `GET /api/admin/arena/round?round_date=`：briefing、discussion、intraday、equity 曲線。
- **Agent 設定 metadata 擴充**（`agent-settings.ts`、`/api/admin/settings` 回傳帶 `editable/help`）：
  - `social.ig_max_chars` / `social.threads_max_chars` → `editable:false`＋說明「平台硬上限」。
  - `arena.slippage` → help：「下單打滑成本：買＝價×(1+slip)、賣＝價×(1−slip)；預設 0.3%」。
  - 新增 `arena.system_prompt`（競技場 global prompt override）。
- **Engine 支援 prompt override**（ai-engine 是純套件，不能直接讀 DB）：
  - `strategist.ts` 的 `ArenaDecisionContext` + `engine.ts` 建 context 處加 `customPrompt?`；
  - `lightweight-strategist.ts` `buildSystemPrompt` 在 `injectionGuardNote()` 之後追加 customPrompt；
  - web 層 `apps/web/src/lib/arena.ts` 讀 `arena.system_prompt` 並傳入 `runArenaRound`。
- **oddlot_stale 情境判斷**（`health.ts`）：TW 15:30（cron 15:10 + 寬限）前、
  且 latest ＝ 前一交易日 → 降為 `warn`（訊息註明「今日盤後資料尚未公布，
  約 TW 15:10 自動補齊」），其餘維持 `error`。另在 `checks.oddLot` 帶
  `waitingPublish` 等上下文供 UI/告警判斷。

## Phase 2 — 後台儀表板（獨立路由）

- `apps/web/src/app/admin/layout.tsx`（server）：admin 守衛（cookie → isAdminUser →
  redirect）+ **左側深色側欄**（後台專屬、獨立前台設計）+ `<main>`。
- 路由（各自 client page）：
  - `/admin` 總覽：health＋統計＋今日競技場進度
  - `/admin/market-focus`：乾跑預覽區＋發布＋同步社群勾選（原地結果區，非全域橫幅）
  - `/admin/social`：乾跑預覽（文案＋圖卡，接 Phase 3）＋發布 / 強制重發
  - `/admin/arena`：按鈕「?」說明（Pre-market＝晨間建股票池＋市場簡報；Slot0-3＝盤中
    四次決策；收盤結算＝結算權益/報酬）＋按完即時結果表（processed/trades/errors）
    ＋agent 清單（可編輯 prompt/tone/personality）＋**每 agent 決策歷程**
    （decision log → 每筆交易買賣價/股數/理由/模型/fallback）＋權益曲線＋當輪
    briefing/discussion
  - `/admin/settings`：分群設定；唯讀欄顯示資訊列（不給輸入框）；slippage 帶「?」
  - `/admin/usage`：報表「辨識」→「照片辨識(OCR)」＋說明 tooltip
- 共用元件：`ResultBanner`（保留）、`Help`（? hover tooltip）、`InfoRow`、
  `SectionPageWrapper`；後台專屬樣式（沿用既有 design tokens，但獨立 layout）。

## Phase 3 — 社群文案＋梗圖＋乾跑預覽

### 3.1 乾跑預覽（原 social-dryrun-preview.md 計畫）

現況：`triggerSocialPublish({dryRun:true})` 產出文案與圖卡 buffer，但 buffer 丟棄、
UI 只印 JSON。

改法：
1. `apps/web/src/lib/social-trigger.ts` — 在 `dryRun` 時一併回傳：
   - `captions: SocialCaptions`（IG / Threads 文案）
   - `imageDataUrl: string`（renderSocialCard 的 JPEG buffer 轉 base64）
   非 dryRun 不加欄位（cron / 發布路徑 payload 不受影響）。
2. `apps/web/src/app/api/admin/social/publish/route.ts` — 零改動（outcome 已 spread 透傳）。
3. `apps/web/src/app/admin/AdminClient.tsx`（新版改到 `/admin/social` 頁）— 原地渲染
   「乾跑預覽」區塊：IG / Threads 文案（`whitespace-pre-wrap`）＋ 圖卡 `<img>`。

設計取捨：**用 base64 直給而非 og URL**——og 對指定 edition 帶
`Cache-Control: immutable, max-age=3600`，乾跑預覽可能拿到舊圖；base64 與本次渲染
完全一致。payload 約數百 KB，admin 內部可接受。備選（不建議）：前端直接開 og URL。

### 3.2 梗圖（v1 文字梗圖；v2 AI 生圖排後）

- `social.ts`：新增 `generateMemeConcept`（LLM 產「經濟/科技梗」：主標題＋一句
  punchline），未覆寫 prompt 時以 meme 流出「短文案」，取代大段純文字。
- `social-canvas.ts`：支援 `card_style: 'classic' | 'meme'`（讀 `social.card_style`；
  可加 `social.meme_prompt`）；meme 版式＝大字標題＋梗語＋小 footer（仍 1080×1080）。
- `social-trigger.ts`：乾跑回傳 `captions`＋`imageDataUrl`（含 meme 網卡）。
- v2（backlog）：接 image 生成 API（需金鑰＋每次成本）。
- 落地後 `docs/social-dryrun-preview.md` 即完成、由本檔取代。

---

## 驗證／上線

- 每 phase 完成：`packages/database` + `packages/ai-engine` + `apps/web` typecheck/build。
- 小 commit 多支 → push → `gh run watch` deploy → 產線 /admin 逐頁冒煙
  （含 product-manager 子代理複驗）。
- 本機 dev server 依 AGENTS.md 程序起單一台驗證。

## 相關檔案（現況）

- `apps/web/src/app/admin/{page.tsx,AdminClient.tsx}` — 現行卡片式後台（將拆成多頁）。
- `apps/web/src/lib/agent-settings.ts` + `apps/web/src/app/api/admin/settings/route.ts` —
  Agent 設定（需 metadata `editable/help`）。
- `apps/web/src/lib/arena.ts` + `packages/ai-engine/src/arena/{engine,strategist,lightweight-strategist}.ts` —
  競技場（需 prompt override 穿線）。
- `apps/web/src/lib/{social-trigger.ts,social.ts,social-canvas.ts,social-publish.ts}` —
  社群小編（乾跑回傳 + 梗圖）。
- `apps/web/src/lib/health.ts` + `utils/taiwan-calendar.ts` — oddlot 情境判斷。
- `packages/database/src/{db.ts,index.ts}` — arena/settings data accessor（多數已存在）。
- `.opencode/agent/product-manager.md` — 待建立的稽核子代理。