import { createCanvas, GlobalFonts } from '@napi-rs/canvas'
import path from 'node:path'
import fs from 'node:fs'
import type { MarketFocusItem, MarketFocusMeta } from '@stock/database'

// ─── 圖卡 (OG-style) 生成 ─────────────────────────────────────────
// 1080×1080 深色品牌卡：Vestential / 日期 / 主標題 / 總覽 / footer。
// 字體：bundle 進 repo 的 Noto Sans CJK TC（Azure Linux 無系統中文字型）。

const CARD_W = 1080
const CARD_H = 1080
const FONT_NAME = 'Noto Sans CJK TC'

let fontLoaded = false
function ensureFont() {
  if (fontLoaded) return
  const candidates = [
    path.join(process.cwd(), 'apps/web/public/fonts/NotoSansTC-Regular.otf'),
    path.join(process.cwd(), 'public/fonts/NotoSansTC-Regular.otf'),
  ]
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        GlobalFonts.registerFromPath(p, FONT_NAME)
        fontLoaded = true
        return
      }
    } catch (e) {
      console.warn('[SocialCanvas] font register failed:', p, e)
    }
  }
  console.warn('[SocialCanvas] Noto Sans CJK TC not found; card text may render as boxes')
}

export interface SocialCardData {
  meta: MarketFocusMeta
  items: MarketFocusItem[]
}

/** 依市場焦點總覽與新聞生成 1080×1080 PNG buffer。 */
export async function renderSocialCard(data: SocialCardData): Promise<Buffer> {
  ensureFont()
  const canvas = createCanvas(CARD_W, CARD_H)
  const ctx = canvas.getContext('2d')

  // ── 背景：深色漸層 ────────────────────────────────────────────
  const bg = ctx.createLinearGradient(0, 0, 0, CARD_H)
  bg.addColorStop(0, '#10131a')
  bg.addColorStop(1, '#0b0d13')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, CARD_W, CARD_H)

  // 裝飾：右上小色塊（品牌綠）與底部細線
  ctx.fillStyle = '#22c55e'
  ctx.fillRect(CARD_W - 260, 0, 260, 10)
  ctx.fillStyle = 'rgba(255,255,255,0.08)'
  ctx.fillRect(72, CARD_H - 120, CARD_W - 144, 1)

  // ── 品牌列 ─────────────────────────────────────────────────────
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.font = `700 40px "${FONT_NAME}"`
  ctx.fillStyle = '#22c55e'
  ctx.fillText('Vestential', 72, 96)

  const dateStr = data.meta.generated_at ?? ''
  ctx.font = `400 28px "${FONT_NAME}"`
  ctx.fillStyle = '#9ca3af'
  ctx.textAlign = 'right'
  ctx.fillText(dateStr.slice(0, 10), CARD_W - 72, 96)

  // ── 主標題（auto-wrap，最多 3 行）─────────────────────────────
  const headline = data.items[0]?.title ?? data.meta.summary ?? '今日市場焦點'
  ctx.textAlign = 'left'
  ctx.font = `700 58px "${FONT_NAME}"`
  ctx.fillStyle = '#ffffff'
  const maxWidth = CARD_W - 144
  const lines = wrapText(ctx, headline, maxWidth, 3)
  let y = 220
  const lineH = 78
  for (const line of lines) {
    ctx.fillText(line, 72, y)
    y += lineH
  }

  // ── 總覽摘要（auto-wrap，最多 7 行，保留底部 CTA 空間）────────────
  const summary = data.meta.summary ?? ''
  ctx.font = `400 34px "${FONT_NAME}"`
  ctx.fillStyle = '#d1d5db'
  const summaryLines = wrapText(ctx, summary, maxWidth, 7)
  y += 24
  const summaryLineH = 52
  for (const line of summaryLines) {
    ctx.fillText(line, 72, y)
    y += summaryLineH
  }

  // ── 梗圖式 CTA 底列：導流網址 ─────────────────────────────────
  const ctaX = 72
  const ctaY = CARD_H - 196
  const ctaW = CARD_W - 144
  const ctaH = 80
  ctx.fillStyle = '#14532d'
  roundRect(ctx, ctaX, ctaY, ctaW, ctaH, 18)
  ctx.fill()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  let ctaFontSize = 44
  ctx.font = `700 ${ctaFontSize}px "${FONT_NAME}"`
  while (ctx.measureText(`完整分析 → vestential.com/market-focus`).width > ctaW - 32 && ctaFontSize > 28) {
    ctaFontSize -= 2
    ctx.font = `700 ${ctaFontSize}px "${FONT_NAME}"`
  }
  ctx.fillStyle = '#ffffff'
  ctx.fillText('完整分析 → vestential.com/market-focus', CARD_W / 2, ctaY + ctaH / 2)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'

  // ── Footer ────────────────────────────────────────────────────
  ctx.font = `400 26px "${FONT_NAME}"`
  ctx.fillStyle = '#6b7280'
  ctx.fillText('Vestential 市場焦點 · 價值投資陪你透過數據看台灣股市', 72, CARD_H - 60)

  // IG 只接受 JPEG; Threads 亦支援 JPEG。以高品質 JPEG 輸出。
  return canvas.toBuffer('image/jpeg', 92)
}

/** 依 UTF-8 斷詞做換行（對中文逐字斷行防止中文標點被切），超過 maxLines 以 … 收尾。 */
function wrapText(ctx: { measureText: (t: string) => { width: number } }, text: string, maxWidth: number, maxLines: number): string[] {
  const chars = Array.from(text)
  const lines: string[] = []
  let line = ''
  let idx = 0
  while (idx < chars.length) {
    const ch = chars[idx]
    const test = line + ch
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line)
      if (lines.length >= maxLines) {
        lines[maxLines - 1] = line.slice(0, Math.max(1, line.length - 1)).replace(/\s+$/, '') + '…'
        return lines
      }
      line = ch
    } else {
      line = test
    }
    idx += 1
  }
  if (line) lines.push(line)
  return lines
}

/** 繪製圓角矩形路徑（不 fill/stroke，需自行呼叫）。 */
function roundRect(ctx: any, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}
