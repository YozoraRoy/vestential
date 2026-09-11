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

> 註：`AUTH_BASE_URL` 在部署工作流程中已固定為 `https://vestential.com`，無需重複設定。
>
> **生產資料庫（Azure SQL）**：Server `sql-stock-platform.database.windows.net`（canadacentral，Resource Group `rg-yuzora_roy_ai`）、Database `stockdb`。
> 目前階層為 **Basic（5 DTU）／上限 2 GB**（於 2026-09-11 由「Free tier（僅 32 MB）」升級，原因與排除步驟見 §4 Q3）。

---

## 3. 定時自動化排程

系統運行三組關鍵排程，確保行情與健康狀態保持最新：

1. **零股行情同步 (`sync-oddlot.yml`)**：
   - 時間：台灣時間每個工作日 **15:10**（TWSE 盤後零股公布後）。
   - 行為：自動呼叫 `POST /api/odd-lot/refresh?date=YYYYMMDD`，透過 `SYNC_TOKEN` 驗證更新最新零股行情。
2. **市場焦點新聞同步 (`sync-market-focus.yml`)**：
   - 時間：每 **4 小時** 執行一次。
   - 行為：抓取鉅亨、經濟日報、Yahoo 股市最新資訊，產生 AI 重點摘要並寄送總覽電子郵件。
3. **健康檢查與自動修復 (`health-report.yml`)**：
   - 時間：每 4 小時輕量檢查，每日台灣時間 08:00 進行完整盤查。
   - 行為：主動診斷各端點狀態，若有異常自動呼叫修復端點，修復無效才向維護人員發送告警信。

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
