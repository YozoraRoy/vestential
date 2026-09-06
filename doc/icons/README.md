# doc/icons — 品牌識別 Logo 產出資料夾

> 目標：為 Vestential 產製品牌識別 Logo（社群大頭照、網站 icon、甚至 app icon 的來源母版）。
> 產生出的圖檔（`.png`/`.svg`/`.pdf`）一律集中放在本資料夾。

## 品牌簡報（Logo 生成依據）

- **名稱**：Vestential = **Vest**（投資）+ **Essential**（不可或缺）
  → 可用「V」「Vest」字首或「上升曲線 / 折線」元素做識別。
- **定位**：台灣股市 AI 資訊平台（盤後/紀念品預報、個人損益試算、回測、AI 分析）。
- **精神**：價值投資、長期累積、紀律。
- **色彩 tokens**（見 `doc/design-guideline.md` §1）：
  - 主色品牌藍 `#4f8cff`
  - 輔色綠（正向/獲利）`#34d399`
  - 警示紅 `#f87171`
  - 深底 `#0f1118` / 卡面 `#1a1d2e` / `#222639`
- **字型**：系統字型為主（PingFang TC / Noto Sans TC），Logo 建議中性 sans-serif。

## 產出規格

| 用途 | 格式 | 尺寸 |
|---|---|---|
| 社群大頭照母版 | PNG (透明或圓形) | 1024×1024 |
| FB 封面 / X banner 衍生 | PNG | 1200×628（FB 專頁）、1500×500（X） |
| 網站 favicon/app icon | PNG + SVG | 512×512、64×64、180×180 |
| 向量母版 | SVG / PDF | — |

## 現有資產（已產出）

| 檔案 | 說明 |
|---|---|
| `vestential-logo-1024.png` | **icon 母版（現行）**：單一累積弧（valley-V）、藍→綠漸變、右端綠目標點，透明底 1024×1024 |
| `vestential-lockup-1200x628.png` | **主視覺 lockup**：icon + VESTENTIAL 字標（Bahnschrift）+ 標語，深底 1200×628（FB/OG 適用） |
| `vestential-logo-concept.md` | 設計理念「Accumulation Arc」與設計決定（形/色/字） |

### 5 個參考核選版（v1–v5，透明底 1024×1024）

| 檔案 | 方向 | 重點 |
|---|---|---|
| `vestential-logo-v1-monogram-1024.png` | 幾何雙色 V | 左臂藍、右臂綠、谷底收谷 + 右上方目標點；極簡 |
| `vestential-logo-v2-candle-1024.png` | K 線 V 形 | 7 根 K 柱沿 V 形排列，谷底紅 K（進場區）、爬升轉綠、最高點帶綠色目標點 |
| `vestential-logo-v3-channel-1024.png` | 雙軌通道弧 | 累積弧外層 + 內嵌亮色細軌 =「價值累積通道」；藍→綠漸變 |
| `vestential-logo-v4-orbit-1024.png` | 軌道錶盤 | 環 + 刻度錶圈，弧穿入圓內貼底、綠色目標點落在環上（時間/價格雙軸） |
| `vestential-logo-v5-fold-1024.png` | 折疊層次 V | 三層 offset（藍→深藍）營造折疊厚度，前層藍→綠漸變 + 目標點 |

> 決選流程：挑一個方向（或指定混搭）→ 依 `SOP` 切尺寸 → 套用社群帳號。

## SOP
1. 先用設計 skill（`canvas-design`）產出母版圖 → 存這裡。
2. 依上表切出各尺寸 → 同名但標註用途（如 `vestential-logo-1024.png`、`vestential-banner-1500x500.png`）。
3. 社群帳號啟用時（`doc/social-media-plan.md` Phase A2）套用。