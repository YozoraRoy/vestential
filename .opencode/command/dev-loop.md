---
description: 開發鏈路一鍵流水線 — PM 規格 → Developer 實作 → QA 驗收 → 自動 commit/push/deploy → 生產驗證 → 關閉 Issue。用法：`/dev-loop <issue# 或 功能描述>`。
agent: build
---

你將執行 Vestential 的 Issue 驅動開發鏈路。`$ARGUMENTS` 內是 **issue number** 或**功能描述**，依此走完下列階段。用 `task` tool 委派子 agent（`pm`／`developer`／`qa-verifier`），全程以 GitHub Issue 為單一資料源。

## 輸入判讀

- `$ARGUMENTS` 為純數字 → 既有 Issue：`gh issue view <N> --repo YozoraRoy/vestential --comments` 讀現況，接續未完成階段。
- 其餘文字 → 功能描述：先委派 `pm` 開規格 Issue（含 `status/spec` label），拿回 `#<N>`。

## 階段（依序執行）

1. **P0 規格（pm）**：委派 `task(subagent_type="pm")`（傳 issue# 或功能描述）→ 確保證 Issue body 含 `## ACCEPTANCE` 清單。
2. **P1 實作（developer）**：委派 `task(subagent_type="developer")`（傳 issue#）→ 收回完成度自評（typecheck/lint/build + ACCEPTANCE 勾選）。
3. **P2 驗收（qa-verifier）**：委派 `task(subagent_type="qa-verifier")`（傳 issue#，`REALM=local`）→ 收回 PASS/FAIL matrix。
   - 出現 FAIL → `gh issue edit <N> --add-label status/needs-fix` → 回到 P1 修 → 重 P2，**直到全 PASS**。
4. **P3 自動上線**（本 agent 親自做）：
   - `gh issue edit <N> --add-label status/qa-pass --remove-label status/needs-fix`
   - 檢查 `git status`／`git diff`，只 stage 本次功能相關檔案；commit message 以 repo 現行風格描述並含 `Closes #<N>`；`git push origin main`（將觸發 `.github/workflows/deploy.yml`）。
   - 觀測 GitHub 部署（`gh run list`／`gh run watch`），等成功或失敗判定。
5. **P4 生產驗證（qa-verifier）**：委派 `task(subagent_type="qa-verifier")`（傳 issue#，`REALM=production`）→ 驗生產環境。
   - 通過 → `gh issue edit <N> --add-label status/released` 並 `gh issue close <N> --reason completed`。
   - 未過 → 回 P1 修 → 重跑 P3/P4。

## 執行紀律

- 每一階段結束給出一行狀態（issue#、完成/卡住、產物）。
- QA 的 local smoke 需要 dev server 時，依 AGENTS.md §4：由 QA detach 起 server 並立刻回傳 pid；**Ready／port 檢查／停機由你（observer）負責**，不在 QA task 內輪詢長駐程式。
- curl/powershell 呼叫一律給短 timeout；觀測 deploy 時用 `gh` 而非輪詢網頁。
- 上游 agent 回報「待確認」而擋路 → 停下來向使用者提問，不要擅自改範圍。
- 全部完成後回報：`Closes #<N>`、QA matrix 摘要、deploy run 結果、生產驗證結果。