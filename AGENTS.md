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

## 重要教訓

- node dev server 用完必須清乾淨。之前曾殘留兩台（3000/3001 各一），新起的 server 因 3000 被佔自動改跑 3001，讓測試誤以為「卡住」。
- QA 驗證時給短 timeout，`curl`/powershell 呼叫太容易卡住。