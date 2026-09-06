# 社群媒體計畫 — FB / X / Threads 開通與每日盤後自動發文

> 目的：建立 Vestential 社群宣傳管道（FB / X / Threads），以 `vestential@gmail.com` 為基底，
> 內容以「每日盤後行情摘要」自動發文為主、繁中為主偶爾英文。

## 決策（已確認）

- 帳號基礎：**沒有任何現成個人帳號，全部新建**（FB 專頁與 Threads 都需要個人帳號當基礎）。
- 內容來源：**每日盤後自動貼**（把現有 market-focus 摘要改寫成貼文）。
- 語言：**繁體中文為主，偶爾英文**。
- 發文頻率：**每天每家平台 1 則**（以 DB dedupe 確保，即使 refresh 一天跑 4 次也只發一次）。
- 第一期**純文字**，後續再考慮加圖（chart）。

---

## Phase A — 帳號申請（手動，Meta 需要真實身份）

### A0. 名稱檢查（最先做）
- 查 `@vestential` 在 x.com / instagram / facebook.com / threads.net 是否可用。
- 衝突就用後備 handle（`@vestentialtw`、`@vestential_ai` 等），三家統一。

### A1. 依序建立帳號
1. **個人 FB 帳號**（`vestential@gmail.com`）→ 建立 **Vestential 專頁**。
2. **IG 商務帳號**（`vestential+ig@gmail.com` 別名；同一 email 不能在 Meta 建兩個帳號）→ 開通 **Threads** 並綁定。
3. **X 帳號**（`vestential+x@gmail.com`）獨立註冊。
4. 全部開啟 **2FA**；大頭照 / 簡介 / Bio 一致，Bio 放 `vestential.com`。

> ⚠️ Meta 個人帳號需真實姓名 / 手機驗證，這是 FB 專頁與 Threads 的必要前提，無法繞過。

### A2. 品牌資產
- 目前 repo 沒有品牌 logo → 用 `doc/icons/` 產出品牌識別 logo（大頭照、banner、app icon 衍伸）。
- 三平台 profile / banner / bio 規格一致化。

---

## Phase B — 自動發文功能（程式）

**資料流**：
`sync-market-focus`（每 4 小時，TW 14/18/22/02 時）→ `/api/market-focus/refresh`
→ 產生 summary → 寄 email → 若當天該平台尚未發文，自動 POST 到 X / Threads / FB 專頁。

### 新增檔
- `apps/web/src/lib/social.ts`
  - `postToX(text)` / `postToThreads(text)` / `postToFbPage(text)`
  - `buildDailySocialPost(meta, items)`：summary + 精選新聞 → 繁中貼文（hashtag、連結、免責「僅供參考不構成投資建議」）

### DB
- 新增 `social_posts` 表（`date` / `platform` / `status` / `message` / `error`）→ 每日每平台一次（dedupe）。

### Hook
- `apps/web/src/app/api/market-focus/refresh/route.ts`（email 送出後呼叫）。

### Secrets / App Settings
- `X_*`、`THREADS_*`、`FB_*`（長效 tokens）加入 `deploy.yml` + Azure App Settings。

### 錯誤處理
- 失敗 → 記 log + 沿用 `sendMarketFocusAlert` 通知。

---

## Phase C — Developer App 與 Tokens

| 平台 | 需要 | 時程 |
|---|---|---|
| X | Developer 帳號 + App → OAuth tokens（免費版可發文但每月有上限） | 數小時審核 |
| Threads | Meta for Developers App + Threads API + IG 綁定 | 審核約 3–7 天 |
| FB 專頁 | Graph API + 長效 Page token（綁 Business Manager） | 同日可完成 |

*> 取得 tokens 後填入 secrets 與接線。*

---

## Phase D — 上線後
- 自動：每日盤後 1 貼文（繁中），偶爾英文另行手動補。
- 觀察前兩週觸及 / 互動，再決定是否加圖片版或排程工具。