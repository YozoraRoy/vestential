# AGENTS.md — 專案規則

## 跑測試 / 冒煙前：Dev Server 檢查（必做）

任何 QA 驗證、冒煙測試、E2E 之前，**先確認 dev server 狀態**，再決定是否要清理：

### 1. 檢查目前狀態

```powershell
Get-NetTCPConnection -LocalPort 3000,3001 -State Listen -ErrorAction SilentlyContinue |
  Select-Object LocalPort, OwningProcess
```

- **只有一台、且跑在 3000** → 乾淨，直接用。
- **3000 + 3001 都有** → 有殘留 server，先清再起：保留「最新起的那台」繼續測，其餘 `Stop-Process -Id <pid> -Force`。
- **兩台都在跑、但你看不出哪台最新** → 全清掉，重起單一台。
- **一台都沒有** → 直接 `npm run dev` 起一台。

### 2. 清理殘留 server

```powershell
Stop-Process -Id <pid> -Force
```

> 只停 server 本體（`start-server.js` / `next dev` / `npm run dev` chain）即可，不需停系統無關程序。
> 殺掉後隔 1~2 秒再 `Get-NetTCPConnection` 確認 port 已釋放。

### 3. 起單一台 dev server

```powershell
npm run dev
```

- 起好後等 log 出現 `Ready`，再用 `Get-NetTCPConnection -LocalPort 3000` 確認只有 3000 在聽。
- **不要同時起第二台**（port 3000 被佔時 Next 會自動改跑 3001，造成「卡住」錯覺）。

### 4. 由 subagent（QA）起 server 時：必須用「完全 detach」方式

若把「起 dev server」交給 subagent 處理（如「QA 起、主 agent 觀測」的協作分工），**不要**用 `Start-Process -NoNewWindow`——child 會繼承 console handle，subagent 的 bash tool call 等不到 child 結束，**整個 task 會看似卡住**（實際 server 已起來）。

務必用完全 detach 的方式，起完立即回傳 pid 就結束：

```powershell
$p = Start-Process -FilePath "powershell" -ArgumentList "-NoProfile","-ExecutionPolicy","Bypass","-Command","npm run dev" `
  -WorkingDirectory "D:\PG\stock-platform" `
  -RedirectStandardOutput "$env:TEMP\opencode\devout.log" `
  -RedirectStandardError "$env:TEMP\opencode\deverr.log" `
  -WindowStyle Hidden -PassThru
$p.Id   # 立即回傳（實測 ~16ms），不要在此 task 內輪詢 Ready
```

- **三要素**：`-RedirectStandardOutput/-RedirectStandardError`（log 導至暫存檔，不繼承父 console handle）、`-WindowStyle Hidden -PassThru`（detach＋拿 pid）、起完**立即回傳**。
- Ready 確認、port 檢查、路由觀測、停機，全部留給 observer（主 agent）做，QA/起 server 的 agent 不要在 task 內自己輪詢長駐程式。

## 重要教訓

- node dev server 用完必須清乾淨。之前曾殘留兩台（3000/3001 各一），新起的 server 因 3000 被佔自動改跑 3001，讓測試誤以為「卡住」。
- QA 驗證時給短 timeout，`curl`/powershell 呼叫太容易卡住。
- subagent 起長駐程式必須 detach（見 §4）；起完立即回傳 pid，由 observer 負責 Ready／port／停機，分工才不會卡。