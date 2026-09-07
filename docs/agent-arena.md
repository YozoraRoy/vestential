# AI Agent 投資競技場 — 功能設計文件 (agent-arena)

> 狀態：**規劃定稿，進入實作** · 首次建立：2026-09-07
> 對應首頁卡片：`AI Agent 投資競技場`（`/apps/web/src/app/page.tsx` features 第 133-140 行，啟用後改 `href:'/agent-arena'`、`developing:false`）。

---

## 1. 願景與目標

讓使用者打造自己的 AI 投資 agent（形象、策略、風險行為），以 **NT$200,000 虛擬資金**參與一個每日運行的價值投資模擬競賽。Agent 在每個交易日收盤後自動對競賽股票池做出買/賣/持有決策，公開榜單即時呈現每個 agent 的決策、持股與績效。

產物面向三種角色：
- **訪客（免登入）**：公開瀏覽排行榜、agent 明細、權益曲線與決策紀錄 —— 行銷展示面。
- **登入使用者**：建立／調整／刪除自己的 agent、選擇組別與策略、加入競賽。
- **維運者（admin）**：手動 tick、重置賽季。

## 2. 範圍與非目標

### 範圍（V1）
- 單一競賽股票池（universe）：TWSE 市值 Top100 台股 + 66 檔 ETF（共 166 檔，參考 `buildDefaultDailyUniverse`；可透過 `ARENA_UNIVERSE` 以逗號分隔代號覆寫）。
- 每 agent 每日一輪決策，決策由輕量 LLM 生成（quick 組 + 三層 fallback）。
- 兩個組別：季報名組、隨時加入組（機制見 §3）。
- 每日收盤後自動一輪（Azure 排程），開賽時可快速重播近期歷史交易日補滿曲線。
- 完整交易成本模型：手續費、證交稅、最小 1 股。
- 公開排行榜 + 登入使用者管理自己的 agent。

### 非目標（V1 明確不做）
- 對戰配對／PvP 賽制、社群互動。
- 自選初始資本、自訂持股上限、做空／融資。
- US 市場、加密貨幣。
- 真金白銀下單。

## 3. 競賽機制

### 3.1 資金與費用（全員一體適用）
- 每 agent 初始資金固定 **NT$200,000**。
- 成交價＝收盤價 × (1 + `ARENA_SLIPPAGE`，預設 0.1%)。
- 手續費 0.1425%（買、賣），最低 1 元；賣出另計證交稅 0.3%。
- 最小成交單位 **1 股**；單一標的最高持有 30% 淨值（控集中度）。
- 現金不足一組訂單時該股從清單中跳過。

### 3.2 輪次
- 每交易日收盤後（TWSE 15:00 收盤，預設 15:20 後）執行一輪。
- 一輪流程：拉取股票池收盤價與近 N 日歷史 → 對每個 active agent 產生決策 → 依規則成交 → 寫入交易 + 快照權益 → 更新排行。
- **idempotent per date**：`arena_agents.last_round_date` 記錄已跑到的日期，排程重跑同一日期不會重複交易。
- 決策失敗（LLM 錯誤／格式無效）視為**該輪 HOLD（不交易）**，並記入 `arena_trades.error` 欄 —— 全員同一規則，不因 API 故障懲罰。

### 3.3 權益與排行
- agent 權益 = 現金 + Σ(持股數 × 當日收盤價)。
- 排行指標 = **累計報酬率** = (當日權益 − 基準權益) ÷ 基準權益。
  - 季報名組基準＝季開賽權益（全員 NT$200,000、同日）。
  - 隨時加入組基準＝該 agent 加入起點權益。
- 平手規則：先比權益絕對值，再比成立時間早者在前。

### 3.4 組別（季報名組 vs 隨時加入組）—— 機制、差異與公平性

| 面向 | 季報名組（Season League） | 隨時加入組（Open League） |
|---|---|---|
| 參加時機 | 季初報名窗（預設每月 1–7 日） | 任何交易日，隨時建立加入 |
| 起點 | 全員同輪、同資本（直接可比） | 各自加入輪為基準 |
| 名單 | 開賽後**鎖定**（季中不增員） | 動態進出 |
| 排行基準 | 季內累計報酬（同一起跑線） | 加入後累計報酬（個別基準） |
| 策略調整 | 每季最多 `ARENA_MAX_ADJUST_PER_SEASON`（預設 2）次，並標示 | 不限次，照樣標示 |
| 刪除重建 | 季中無法回組，等下季報名窗（或轉隨時組） | 隨時可刪除重建，回到初始基準重新起算 |
| 適合 | 證明「同一起跑線誰勝出」 | 輕鬆隨時入場、不怕基準不同 |

**公平性原則（兩組共同適用）**：
1. 統一成本模型與統一行情源（同一 universe、同收盤價、同輪序、同費用規則）。
2. LLM 失敗一律視為 HOLD（§3.2），規則全員一致。
3. 上榜資訊完全透明：agent 卡顯示組別、加入日、已跑輪數、策略調整次數與時間、錯誤輪數。
4. 「刪除重灌刷榜」防護：每人限 1 個 active agent；重設會在歷史榜加註「已重設」。
5. 隨時加入組因起點不同，排行以「加入後報酬」為主、「參與天數 / 近 30 日報酬 / 月報酬」為佐證欄，讓比較基準透明化。

### 3.5 賽季
- 預設每月 1 季：報名窗＝每月 1–7 日；開賽＝8 日首輪；結算＝次月 7 日收盤後（參數 `ARENA_SEASON_DAYS` / `ARENA_REGISTRATION_WINDOW_DAYS` 可調）。
- 結算後自動洗牌進入下季報名窗；歷史季保留在列表供查閱。
- 季中建立並選季報名組者 → 引導「預約下季」或轉隨時加入組（V1 只做引導文字，不做預約資料）。
- 無進行中賽季時自動建立「<年> 常駐賽季」（live），確保賽場隨時可加入。

### 3.6 系統示範 Agent
- 每季（含自動建立的常駐賽季）內建 4 隻系統 agent，立場與規則和一般使用者**完全相同**：20 萬虛擬資金、每日收盤跑同一 tick、買賣白名單同為「市值 Top100 + 66 檔 ETF」股票池。
- 身分識別：`owner_user_id = 0` 且 `is_system = 1` → 不佔「每人 1 隻」名額、不會出現在 `/my`、一般使用者無法改/刪（只允許 admin）。
- 掛「系統」徽章顯示在公開排行榜（自由加入組 open），與參賽者一起排名。
- 內建名單（`ensureSystemArenaAgents(seasonId)`，冪等 seed）：
  | 名稱 | strategy | tone |
  |---|---|---|
  | 存股老阿伯 | buffett | conservative |
  | 少年股神阿虎 | growth | aggressive |
  | 股息包租嬤 | dividend | conservative |
  | 佛系平衡嬤 | balanced | neutral |

## 4. 帳號與權限

- **公開讀**：`GET /api/agent-arena/state`（榜 + 明細）免登入。
- **登入才可**：建立 agent（選組別/策略/行為）、調整策略、刪除重建、暫停/復活。
- **每人 1 個 active agent**（`ARENA_MAX_AGENTS_PER_USER` 預設 1）。超過 → 406 並提示先刪除或復用。
- Admin（`isAdminUser`）才可：`POST /api/agent-arena/tick`（手動跑一輪）、`POST /api/agent-arena/reset`（清空重來，保留歷史季封存）。

## 5. 資料模型（新增 5 表，SQLite + Azure SQL 雙後端 + migration `008_agent_arena.sql`）

### `arena_seasons`
| 欄位 | 型別 | 說明 |
|---|---|---|
| id | INTEGER PK | 季編號 |
| name | TEXT | 季名，如「2026-09 季」 |
| start_date / end_date | TEXT | 開賽 / 結算日期 |
| registration_start / registration_end | TEXT | 報名窗 |
| status | TEXT | `registration / live / closed` |
| created_at | TEXT | |

### `arena_agents`
| 欄位 | 型別 | 說明 |
|---|---|---|
| id | INTEGER PK | |
| season_id | INT FK | 所屬季 |
| owner_user_id | INT | 使用者（0 = 系統範例） |
| name | TEXT | 使用者命名 |
| division | TEXT | `season` / `open` |
| strategy_id | TEXT | INVESTMENT_FRAMEWORKS 5 套之一 |
| tone | TEXT | `aggressive` / `neutral` / `conservative` |
| initial_capital | REAL | 固定 200000 |
| status | TEXT | `active` / `paused` / `reset`（已重設） |
| is_system | INT | 1 = 內建系統示範 agent（`owner_user_id = 0`） |
| joined_at | TEXT | 加入日（起算基準日） |
| adjust_count | INT | 本季策略調整次數 |
| last_round_date | TEXT | 已跑到的最後交易日（防重跑） |
| reset_note | TEXT | 「已重設」加註 |

### `arena_holdings`（每 agent 每標的 1 列）
`agent_id, symbol, symbol_name, shares REAL, avg_cost REAL, updated_round_date TEXT`，UNIQUE(agent_id, symbol)。

### `arena_trades`
`id, agent_id, round_date, action('BUY'|'SELL'|'HOLD'), symbol, symbol_name, shares REAL, price REAL, fee REAL, tax REAL, reason TEXT, model TEXT, fallback_used INT, error TEXT, created_at`。

### `arena_equity_snapshots`（每 agent 每輪 1 列，供曲線與排行）
`id, agent_id, season_id, round_date, cash REAL, equity REAL, return_pct REAL, PRIMARY(agent_id, round_date)`。

### 存取層
`packages/database/src/db.ts` 擴充 arena CRUD（沿用 `dbQueryAll/dbQueryFirst/dbExecute` 雙後端慣例）；新增 migration 檔與 migration 登錄。

## 6. AI 決策設計

### 6.1 角色組合
每 agent 的人格 = **策略框架（strategy_id）× 風險行為（tone）**：
- strategy：`INVESTMENT_FRAMEWORKS`（buffett / growth / dividend / momentum / balanced）的 doctrine 注入 prompt。
- tone：`aggressive`（大膽加碼、集中）/ `neutral`（均衡）/ `conservative`（保守減碼、強調停損）—— 對照 ai-engine 已定義但未接線的 3 位風險辯論家 persona。

### 6.2 決策接口（seam，預留未來升級）
```
interface ArenaStrategist {
  decide(ctx: ArenaDecisionContext): Promise<ArenaDecision>
}
```
V1 實作 `LightweightStrategist`：單次 quick LLM `generateObject`，輸出 zod schema：
```
{ actions: [{ symbol, action: 'BUY'|'SELL'|'HOLD', shares?, reason }] }
```
輸入脈絡 = 現金/持股清單 + 股票池當日收盤與近 5 日漲跌 + 自身 doctrine/tone 指令。驗證：標的必須在股票池、股數 ≤ 上限、現金/持股足夠；不合法 → 拒收並重試 1 次，再失敗視為 HOLD。
未來可加 `EngineStrategist` 包 `TradingEngine.analyze`（成本高，需嚴格限流）。

### 6.3 LLM 用工與成本
- 走 quick 組 `createQuickLLM`（含 `FALLBACK_*`/`FALLBACK2_*` 三層備援），決策 schema 小、`ARENA_MAX_TOKENS`（預設 800）。
- 每 agent 每輪約 1 次呼叫（~1.5–3k token 上下）。估算：10 agent × 20 交易日 ≈ 200 呼叫/月，落在免費/低價額度內。
- 重播一次性成本：開賽重播近 N 日，可依 `ARENA_REPLAY_DAYS` 分批（預設每晚 ≤5 日）避免集中在單次部署。

## 7. API 設計

| 方法/路徑 | 權限 | 說明 |
|---|---|---|
| `GET /api/agent-arena/state` | 公開 | 目前季榜（兩組別）、agent 明細、快照、最近交易 |
| `GET /api/agent-arena/seasons` | 公開 | 歷史季列表 |
| `POST /api/agent-arena/agents` | 登入 | 建立 agent：`{ name, division, strategyId, tone }` → 選季/擇日加入 |
| `GET /api/agent-arena/my` | 登入 | 我的 agent（含未上線預覽） |
| `PUT /api/agent-arena/agents/:id` | 登入(owner) | 調整 `strategyId` / `tone` / `name`（續跑，不重設帳戶） |
| `DELETE /api/agent-arena/agents/:id` | 登入(owner) | 刪除（季報名組季中不可；加註重設） |
| `POST /api/agent-arena/agents/:id/pause` · `resume` | 登入(owner) | 暫停/復活 |
| `POST /api/agent-arena/tick` | admin | 手動跑當日一輪 |
| `POST /api/agent-arena/reset` | admin | 重置（封存現季） |

## 8. 頁面設計（`/agent-arena`）

- Client page（仿 `backtest/page.tsx`）；免登入可見「公開榜」。
- 上層：季資訊卡（季別、報名窗、規則摘要連結）+ 組別 tab（季報名組 / 隨時加入組）各自榜單。
- 排行榜表：排名、agent 名、策略/行為、權益、報酬率、已跑輪數、（隨時組）參與天數；sortable。
- 展開 agent：權益曲線（recharts `LineChart`）、持股表、決策紀錄（round_date/action/symbol/reason/model/fallback/error）。
- 「我的 Agent」區：未登入 → 顯示登入入口（`/login?redirect=/agent-arena`）；登入後 → 建立精靈（組別→策略→行為→命名）、編輯續跑、暫停/復活、刪除。
- 輪詢 `GET /state` 每 30–60s；SSE 不必要。
- i18n：`dict.agentArena` 新增三語 + `dictionary-types`；首頁卡片啟用（`href:'/agent-arena'`、`developing:false`，保留 violet accent）。

## 9. 排程與維運

- 每日 tick：`packages/database/seed/scheduler.ts` 加 step（TW 每交易日 15:20 後），呼叫 arena 每日一輪。
- env（`.env.example` + Azure App Settings + deploy.yml）：
  `ARENA_UNIVERSE`（預設內建 30 檔）、`ARENA_REPLAY_DAYS`（開賽重播天數）、`ARENA_SLIPPAGE`、`ARENA_MAX_TOKENS`、`ARENA_MAX_AGENTS_PER_USER`、`ARENA_MAX_ADJUST_PER_SEASON`、`ARENA_SEASON_DAYS`、`ARENA_REGISTRATION_WINDOW_DAYS`、`ARENA_TICK_HOUR`。
- 錯誤輪次與 LLM 失敗計入 agent 卡（透明）；tick idempotent，duplicate run 安全。

## 10. 里程碑

- **M1** 本設計文件。✅ 本檔
- **M2** 資料層：5 表 + migration 008 + CRUD。
- **M3** ai-engine 競賽核心：ledger、`ArenaStrategist` seam、V1 輕量決策、重播引擎、`advanceRound()`。
- **M4** API 路由、每日排程、`/agent-arena` 頁面 + i18n、首頁卡片啟用。
- **M5** typecheck/lint、本機重播 + 單輪 tick + 建 agent 流程驗證、部署、生產驗證。

## 11. 風險與開放問題

- **Yahoo 限流**：重播/每日拉價需分塊 + sleep + 沿用 15min TTL cache；Top100 市值 + ETF 全池（166 檔）採 `fetchBatchQuotes`（v7, crumb cache, 每批≤100, 批間 300ms），市值用 `/v7/finance/quote` 的 marketCap，ETF 用 shortName。
- **重播一次性成本**：分晚跑；`ARENA_REPLAY_DAYS` 控制。
- **LLM 幻覺標的/股數**：schema 驗證 + 股票池白名單 + 重試 1 次 + 失敗視為 HOLD。
- **排程時差**：tick 以日期為 key idempotent；Azure 時區用 `Asia/Taipei` 校正。
- **開放問題**：季報名組「預約下季」資料（V1 僅文字引導）；隨時組公平性佐證欄是否再加 Sharpe/回撤（V1 不做）；重置後歷史季封存展示深度。