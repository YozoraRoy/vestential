# Azure 部署與維運手冊

本文件提供 Vestential 在 Azure App Service 的部署架構、GitHub Actions 自動化流程、環境變數對應表與常見維運排錯指南。

---

## 1. 部署策略與架構

平台一律採用 **GitHub Actions 自動化 CI/CD** 流程部署至 Azure App Service。

- **繞過雲端 Oryx 建置**：由於 Azure App Service B1 方案記憶體有限（1.75 GB），在雲端直接執行 `npm build` 容易發生記憶體耗盡（OOM 崩潰）。因此採用「**在 GitHub Runner 完成建置並打包相依套件，整包 zipdeploy 上傳**」的策略，徹底解決容器啟動失敗問題。
- **觸發條件**：任何推送到 `main` 分支的提交（`git push origin main`）將自動啟動部署。

---

## 2. GitHub Secrets 與 Azure App Settings 對應表

在 GitHub 倉庫的 **Settings → Secrets and variables → Actions** 設定下列金鑰：

| GitHub Secret 名稱 | 說明與來源 | 對應 Azure App Setting |
| :--- | :--- | :--- |
| `AZURE_CREDENTIALS` | Azure 服務主體 JSON（由 `az ad sp create-for-rbac` 產生） | —（供部署工作流程登入） |
| `OPENAI_API_KEY` | 主要 LLM 服務的金鑰 | `OPENAI_API_KEY` |
| `FALLBACK_DEEP_LLM_BACKEND_URL` | 備援推理模型之 Base URL（如 Groq） | `FALLBACK_DEEP_LLM_BACKEND_URL` |
| `FALLBACK_DEEP_LLM_API_KEY` | 備援推理模型之 API Key | `FALLBACK_DEEP_LLM_API_KEY` |
| `FALLBACK_QUICK_LLM_BACKEND_URL`| 備援快速摘要模型之 Base URL | `FALLBACK_QUICK_LLM_BACKEND_URL` |
| `FALLBACK_QUICK_LLM_API_KEY` | 備援快速摘要模型之 API Key | `FALLBACK_QUICK_LLM_API_KEY` |
| `FALLBACK2_DEEP_LLM_BACKEND_URL` | 第三層備援（tier2）推理模型之 Base URL | `FALLBACK2_DEEP_LLM_BACKEND_URL` |
| `FALLBACK2_DEEP_LLM_API_KEY` | 第三層備援推理模型之 API Key | `FALLBACK2_DEEP_LLM_API_KEY` |
| `FALLBACK2_QUICK_LLM_BACKEND_URL` | 第三層備援快速摘要模型之 Base URL | `FALLBACK2_QUICK_LLM_BACKEND_URL` |
| `FALLBACK2_QUICK_LLM_API_KEY` | 第三層備援快速摘要模型之 API Key | `FALLBACK2_QUICK_LLM_API_KEY` |
| `DATABASE_URL` | Azure SQL Server 連線字串（若留空則使用 SQLite） | `DATABASE_URL` |
| `SYNC_TOKEN` | 內部安全更新端點的 Bearer 驗證金鑰（需 ≥16 字元） | `SYNC_TOKEN` |
| `AUTH_SECRET` | 登入 Session JWT 簽章密鑰（由 `openssl rand -base64 32` 產生） | `AUTH_SECRET` |
| `GOOGLE_CLIENT_ID` | Google Cloud Console 申請之用戶端 ID | `GOOGLE_CLIENT_ID` |
| `GOOGLE_CLIENT_SECRET` | Google Cloud Console 申請之用戶端密鑰 | `GOOGLE_CLIENT_SECRET` |
| `LINE_CLIENT_ID` | LINE Developers 申請之 Channel ID | `LINE_CLIENT_ID` |
| `LINE_CLIENT_SECRET` | LINE Developers 申請之 Channel Secret | `LINE_CLIENT_SECRET` |
| `SMTP_USER` | 官方發信用帳號 | `SMTP_USER` |
| `SMTP_PASS` | 官方發信用應用程式密碼 | `SMTP_PASS` |
| `NOTIFY_TO` | 市場焦點總覽與異常告警接收信箱 | `NOTIFY_TO` |
| `IG_ACCESS_TOKEN` | Instagram 長效型 token（IGAA，60 天） | `IG_ACCESS_TOKEN` |
| `IG_USER_ID` | Instagram business 帳號 ID | `IG_USER_ID` |
| `THREADS_ACCESS_TOKEN` | Threads 長效型 token（THAA，60 天） | `THREADS_ACCESS_TOKEN` |
| `THREADS_USER_ID` | Threads user ID | `THREADS_USER_ID` |
| `THREADS_APP_ID` | Threads Meta App ID（長效 token 換發用） | `THREADS_APP_ID` |
| `THREADS_APP_SECRET` | Threads Meta App Secret（長效 token 換發用） | `THREADS_APP_SECRET` |
| `FB_ACCESS_TOKEN` | Facebook system user token（EAAL…，長期有效） | `FB_ACCESS_TOKEN` |
| `FB_PAGE_ID` | 粉專 ID（發文時自動由 system user 換出 page token） | `FB_PAGE_ID` |

> 註：此外尚有幾個「硬編進 deploy.yml App Settings、不需當 GitHub Secret」的值：

| Azure App Setting | 值說明 |
| :--- | :--- |
| `ADMIN_LINE_USER_IDS` | 後台管理員 LINE user id（逗號分隔） |
| `ADMIN_EMAILS` | 後台管理員 email（逗號分隔） |
| `ARENA_CRON_ENABLED` | `true`＝啟用 in-process 台灣時間競技場排程（主要時鐘） |
| `LLM_DISABLE_THINKING` / `LLM_TIMEOUT_MS` / `LLM_MAX_TOKENS` | LLM 推理參數調校（`true` / `180000` / `8192`） |
| `ANALYZE_MAX_TOKENS` | 分析輸出 token 上限（`2048`） |

> 註：`AUTH_BASE_URL` 在部署工作流程中已固定為 `https://vestential.com`，無需重複設定。
>
> **生產資料庫（Azure SQL）**：Server `sql-stock-platform.database.windows.net`（canadacentral，Resource Group `rg-yuzora_roy_ai`）、Database `stockdb`。
> 目前階層為 **Basic（5 DTU）／上限 2 GB**（於 2026-09-11 由「Free tier（僅 32 MB）」升級，原因與排除步驟見 §4 Q3）。

---

## 3. 定時自動化排程

系統以 GitHub Actions **8 個 workflow**（皆以台灣時間表示）維持行情、健康狀態與社群發布：

1. **零股行情同步 (`sync-oddlot.yml`)**：
   - 時間：台灣時間每個工作日 **15:10**（TWSE 盤後零股公布後）。
   - 行為：自動呼叫 `POST /api/odd-lot/refresh?date=YYYYMMDD`，透過 `SYNC_TOKEN` 驗證更新最新零股行情。
2. **市場焦點新聞同步 (`sync-market-focus.yml`)**：
   - 時間：**每 6 小時**（`0 */6 * * *`，UTC 00/06/12/18 → 台灣 08/14/20/02）。
   - 行為：抓取鉅亨、經濟日報、Yahoo 股市最新資訊，產生 AI 重點摘要並寄送總覽電子郵件。
3. **健康檢查與自動修復 (`health-report.yml`)**：
   - 時間：每 4 小時輕量檢查，每日台灣時間 08:00 進行完整盤查。
   - 行為：主動診斷各端點狀態，若有異常自動呼叫修復端點，修復無效才向維護人員發送告警信。
4. **台股資料同步 (`sync-data.yml`)**：
   - 時間：每日台灣時間 **02:30**；每週一再加跑一次。
   - 行為：同步股東會紀念品與 MOPS 公告等批次資料（`SYNC_TOKEN` 驗證）。
5. **週期進場掃描 (`sync-cycle-entry.yml`)**：
   - 時間：每個交易日台灣時間 **16:00**。
   - 行為：跑週期進場訊號掃描，產生 `/cycle-entry` 的當日進場標的。
6. **AI 競技場 (`arena-tick.yml`)**：
   - 時間：每個交易日 09:00（premarket）、09:35 / 10:35 / 11:35 / 13:05（四個 slot）、15:30（close）。
   - 行為：驅動 `/agent-arena` 五階段（briefing → 4 agent 決策 → discussion → 裁決 → 排行榜）。為 GH 排程備援，主要時鐘為 in-process 的 `arena-scheduler.ts`（`ARENA_CRON_ENABLED=true`）。
7. **社群 token 健康檢查 (`check-social-tokens.yml`)**：
   - 時間：每日台灣時間 **03:30**。
   - 行為：呼叫 `/api/social/token-health`，檢查 IG/Threads/FB 憑證；異常即寄發告警信（換發步驟見 §5）。
8. **部署 (`deploy.yml`)**：
   - 觸發：任何 push 至 `main` 分支。
   - 行為：GitHub Runner 建置→zipdeploy 至 Azure App Service，並同步 App Settings（含所有社群 token）。

---

## 4. 常見維運問題與排除方法

### Q1：推送後網站出現 502 Bad Gateway 或 503 Service Unavailable？
- **原因**：Node 服務正在重啟中，或相依套件啟動階段異常。
- **排除步驟**：
  1. 等待 30~60 秒，容器通常在部署完成後需片刻熱機。
  2. 使用 Azure CLI 查看即時日誌：
     ```bash
     az webapp log tail --name stock-platform-roy --resource-group rg-yuzora_roy_ai
     ```
  3. 檢視是否有缺漏的環境變數（特別是 `AUTH_SECRET` 或 `OPENAI_API_KEY`）。

### Q2：本地開發 Port 3000 被佔用卡住？
- **原因**：前次除錯未正常終止 Node 程序。
- **排除步驟**（遵循 `AGENTS.md` 規則）：
  ```powershell
  Get-NetTCPConnection -LocalPort 3000,3001 -State Listen -ErrorAction SilentlyContinue |
    Select-Object LocalPort, OwningProcess
  Stop-Process -Id <pid> -Force
  npm run dev
  ```

### Q3：收到「資料庫 size quota」異常通知或 refresh 失敗？
- **症狀**：電子郵件告警出現 `The database 'stockdb' has reached its size quota. Partition or delete data...`，特定排程 refresh（如 `sync-data.yml` / `sync-market-focus.yml`）寫入失敗。
- **原因**：生產 Azure SQL `stockdb` 曾為 **Free tier（上限僅 32 MB）**，資料一多 INSERT 即撞硬上限。
- **立即排除**（保留所有資料，升級階層即可解除容量限制）：
  ```powershell
  az sql db list-usages --resource-group rg-yuzora_roy_ai --server sql-stock-platform --name stockdb
  az sql db update --resource-group rg-yuzora_roy_ai --server sql-stock-platform --name stockdb `
    --edition Basic --capacity 5 --max-size 2GB
  ```
- **監控用量**：可執行 `node scripts/diag-size.mjs`（`packages/database` 下，唯讀列出 DB 大小、各表佔用與行數；需 `DATABASE_URL` 與白名單 IP 才能連線）。
- **防火牆注意**：Azure SQL 預設拒絕所有 IP。診斷連線前需在 portal / CLI 新增來源 IP 的防火牆規則，用完即刪；**切勿**開放整個網際網路範圍（`0.0.0.0/0`）。
- **長期對策**：Basic 2 GB 對本平台目前資料量十分充裕；若未來再成長，可考慮 serverless（閒置自動暫停）或對大表（圖檔／分析紀錄）加保留期清理。

---

## 5. 社群憑證（IG / Threads / Facebook）維運

`check-social-tokens.yml` 每日台灣時間 03:30 呼叫 `/api/social/token-health` 檢查三平台憑證，任一失效即在健康檢查回信通知中夾帶告警。**Token 一旦過期，社群自動發文（`social-publish.ts`）與乾跑預覽的圖卡上傳都會失敗。**

### 5.1 三種 token 壽命一覽

| 平台 | 型態 | 效期 | 取得管道 |
| :--- | :--- | :--- | :--- |
| Instagram | 長效 IGAA | 60 天 | Meta App（`ib_exchange_token` 換發） |
| Threads | 長效 THAA | 60 天 | Meta App（`exchange_token` 換發） |
| Facebook 粉專 | system user token（`EAAL…`） | 長期 | Meta Business Suite → System Users |

> FB 發文流程：系統內用 system user token 呼叫 `/me/accounts` 自動換出粉專專用 page token（`resolveFbPageToken`，自動配對 `FB_PAGE_ID`）。換發時須確保新 system user **有指派該粉專權限**，否則會回「FB 找不到粉專」。

### 5.2 換發 SOP

1. **收到告警** → 到 Meta Graph API Explorer / Business Suite 確認是哪筆 token 失效：
   - IG：`GET https://graph.facebook.com/{ig-user-id}?fields=id,username&access_token={IG_ACCESS_TOKEN}` 回 `error` 即失效。
   - Threads：同上以 THAA 對應的 user id 驗證。
   - FB：`GET https://graph.facebook.com/me/accounts?access_token={FB_ACCESS_TOKEN}` 回 190/`invalid token` 即失效。
2. **重新換發**（各平台長效 token 換發，需 `THREADS_APP_ID`／`THREADS_APP_SECRET`／Meta App 權限）：
   - IG：取得新的短效 access token 後，用 `grant_type=fb_exchange_token` 換出 60 天 IGAA。
   - Threads：同 IG 方式換出 60 天 THAA。
   - FB：在 Business Suite → System Users 內 generate 新的 system user token（並確認已指派粉專）。
3. **更新 GitHub Secrets**：`IG_ACCESS_TOKEN`／`THREADS_ACCESS_TOKEN`／`FB_ACCESS_TOKEN`（如 `IG_USER_ID`／`FB_PAGE_ID` 有變也一併更新）。
4. **重新部署**：push 任一變更或手動 rerun `deploy.yml`，讓 GH Secrets 同步進 Azure App Settings。
5. **驗證**：起本地 `npm run dev`，呼叫 `/api/social/token-health`（帶 `Authorization: Bearer $SYNC_TOKEN`）應回 `200`；或等隔日 03:30 workflow 自動確認。
