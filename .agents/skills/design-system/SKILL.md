---
name: design-system
description: |
  Vestential 全站設計系統技能。當使用者要求「新增頁面」、「建立新頁面」、「改版面」、「套用全站視覺規範」、「畫出與首頁一致的卡片/按鈕/區塊」時使用。
  本技能提供全站設計 tokens、元件詞彙表、頁面版式範本與新增頁面 SOP，避免逐頁考古複製 class 而重造輪子。
---

# Vestential 設計系統技能

本專案的設計權威文件為 `doc/design-guideline.md`。動手前**先讀該文件**，並依以下重點速查執行。

## 必要步驟

1. 讀 `doc/design-guideline.md`（tokens、元件詞彙、版式、SOP、i18n/SEO 慣例）。
2. 參照既有頁面出處（文件內附 `file_path` 指引）確認樣式現況。
3. 配色一律用 `var(--token)`，**禁止硬編碼色碼**。

## 速查

- 容器：hub `max-w-5xl mx-auto w-full px-4 py-8 md:py-10`；閱讀頁 `max-w-3xl mx-auto px-4 py-16`；header `max-w-6xl`。
- 卡片：`bg-[var(--bg-card)] rounded-xl border border-white/5 p-4/5`。
- 主 CTA：`bg-[var(--accent)] text-white font-semibold rounded-xl px-6 py-3`。
- 免責框：`rounded-xl border border-[var(--accent-red)]/30 bg-[var(--accent-red)]/5 px-6 py-5`。
- 標題：一頁一 `<h1>`；區塊 `<h2>` 帶 icon + 徽章為可選。
- 間距節奏：區塊間 `mb-10~14`；卡間 `gap-4 md:gap-5`。

## 慣例

- 三語 UI 字串：`dictionary-types.ts` 先定義 → zh-TW/en/ja 補值；**內容類資料（新聞）不翻譯**。
- SEO：`generateMetadata`（title/description/buildAlternates/OG/twitter）+ JSON-LD `@graph` + `sitemap.ts` 加路由。
- 開發中功能：`opacity-80 select-none` + 「開發中」徽章，不給可點連結。

## 驗證

- contrast：`--text-secondary` 只當輔助文字。
- `aria-labelledby`/`aria-label` 補齊。
- 行動版 1 欄 → `sm:grid-cols-2` → 依內容 `lg:grid-cols-3`。