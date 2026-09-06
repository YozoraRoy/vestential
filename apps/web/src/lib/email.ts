import nodemailer from 'nodemailer'
import type { MarketFocusItem, MarketFocusMeta } from '@stock/database'
import { getMarketFocus, getMarketFocusMeta } from '@stock/database'

export const FALLBACK_SUMMARY_PREFIX = '當日市場焦點：'

const FALLBACK_SUMMARY_REGEX = new RegExp(`^${FALLBACK_SUMMARY_PREFIX}`)

export function isSummaryFallback(summary: string): boolean {
  return FALLBACK_SUMMARY_REGEX.test(summary)
}

const SITE_BASE = process.env.AUTH_BASE_URL ?? 'https://vestential.com'
const SITE_LINK = `${SITE_BASE}/market-focus`

// ─── SMTP / 收件人設定 ────────────────────────────────────────────
function smtpConfig() {
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  const to = process.env.NOTIFY_TO
  if (!user || !pass || !to) {
    console.warn('[Notify] SMTP_USER / SMTP_PASS / NOTIFY_TO 未設定,略過寄送')
    return null
  }
  return {
    host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: { user, pass },
    from: process.env.NOTIFY_FROM || user,
    to,
  }
}

async function sendMailCore(subject: string, text: string, html?: string): Promise<boolean> {
  const cfg = smtpConfig()
  if (!cfg) return false
  try {
    const transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: cfg.auth,
    })
    await transporter.sendMail({
      from: `Vestential <${cfg.from}>`,
      to: cfg.to,
      subject,
      text,
      html,
    })
    console.log(`[Notify] email sent: ${subject} -> ${cfg.to}`)
    return true
  } catch (e) {
    console.error('[Notify] email send failed:', subject, e)
    return false
  }
}

// ─── 時間格式化 (Asia/Taipei) ────────────────────────────────────
function formatTwDateTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d)
}

function formatTwDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).format(d)
}

// ─── HTML 逃逸 ───────────────────────────────────────────────────
function escapeHtml(s: string | null | undefined): string {
  return (s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// ─── ① 每日市場焦點總覽信 ──────────────────────────────────────
const BRAND_HEADER = `
  <div style="background:#111827;color:#ffffff;padding:20px 24px;border-radius:12px 12px 0 0;">
    <span style="font-size:18px;font-weight:700;letter-spacing:1px;">Vestential · 市場焦點</span>
  </div>`

function buildSummaryHtml(summary: string, items: MarketFocusItem[]): string {
  const listHtml = items
    .map((it, i) => {
      const link = it.source_url ?? it.url
      const reason = it.reason ? `<div style="color:#4b5563;margin:6px 0 2px;">💬 選取理由:${escapeHtml(it.reason)}</div>` : ''
      const time = it.published_at ? `<span style="color:#9ca3af;">🕒 ${escapeHtml(formatTwDateTime(it.published_at))}</span>` : ''
      return `
      <div style="border:1px solid #e5e7eb;border-radius:10px;padding:14px 16px;margin:10px 0;">
        <div style="font-size:15px;font-weight:600;color:#111827;">${i + 1}. ${escapeHtml(it.title)}</div>
        ${time ? `<div style="color:#9ca3af;margin-top:4px;font-size:13px;">${time}</div>` : ''}
        ${reason}
        <div style="margin-top:8px;font-size:13px;">🔗 <a href="${escapeHtml(link)}" style="color:#2563eb;word-break:break-all;">前往原文 →</a></div>
      </div>`
    })
    .join('\n')

  return `
    <div style="background:#f3f4f6;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,Microsoft JhengHei,sans-serif;">
      <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;">
        ${BRAND_HEADER}
        <div style="padding:24px;">
          <div style="font-size:20px;font-weight:800;color:#111827;margin-bottom:12px;">✨ 今日市場總覽</div>
          <div style="font-size:15px;line-height:1.8;color:#374151;white-space:pre-wrap;">${escapeHtml(summary)}</div>
          <div style="text-align:center;margin:22px 0;">
            <a href="${escapeHtml(SITE_LINK)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 28px;border-radius:9999px;">查看完整頁面 →</a>
          </div>
          <div style="border-top:1px solid #e5e7eb;padding-top:16px;">
            <div style="font-size:16px;font-weight:700;color:#111827;margin-bottom:6px;">📰 本日精選新聞</div>
            ${listHtml}
          </div>
        </div>
        <div style="background:#f9fafb;padding:16px 24px;font-size:12px;color:#6b7280;line-height:1.7;">
          本信由 Vestential 自動產生並寄送。<br/>
          資料來源:鉅亨網;內容僅供參考,不構成投資建議。<br/>
          <a href="${escapeHtml(SITE_BASE)}" style="color:#9ca3af;">Vestential</a> — 價值投資路上的必備工具
        </div>
      </div>
    </div>`
}

function buildSummaryText(summary: string, items: MarketFocusItem[]): string {
  const list = items
    .map((it, i) => {
      const link = it.source_url ?? it.url
      const reason = it.reason ? `   選取理由:${it.reason}\n` : ''
      const time = it.published_at ? ` (${formatTwDateTime(it.published_at)})` : ''
      return `${i + 1}. ${it.title}${time}\n${reason}   前往原文: ${link}`
    })
    .join('\n')
  return `今日市場焦點 (Vestential) - ${formatTwDate(new Date().toISOString())}

今日市場總覽:
${summary}

本日精選新聞:
${list}

查看完整頁面: ${SITE_LINK}

本信由 Vestential 自動產生並寄送。
資料來源:鉅亨網;內容僅供參考,不構成投資建議。`
}

/** 將最新一輪市場焦點總覽寄給 NOTIFY_TO。回傳是否成功送出。 */
export async function sendMarketFocusSummary(): Promise<boolean> {
  const [meta, items] = await Promise.all([getMarketFocusMeta(), getMarketFocus(6)])
  if (!meta?.summary) {
    console.warn('[Notify] market_focus_meta 無內容,略過寄送')
    return false
  }
  const subject = `📬 今日市場焦點 (Vestential) — ${formatTwDate(meta.generated_at ?? new Date().toISOString())}`
  return sendMailCore(subject, buildSummaryText(meta.summary, items), buildSummaryHtml(meta.summary, items))
}

// ─── ② 異常告警信 ───────────────────────────────────────────────
export async function sendMarketFocusAlert(topic: string, message: string): Promise<boolean> {
  const ts = formatTwDateTime(new Date().toISOString())
  const env = process.env.NODE_ENV ?? 'development'
  const text = `Vestential 市場焦點排程異常

時間 : ${ts}
類型 : ${topic}
錯誤 : ${message}
環境 : ${env}

建議 : 查看 GitHub Actions run 或 Azure 容器 log
       ${SITE_LINK}`
  const html = `
    <div style="background:#fef2f2;padding:24px;font-family:-apple-system,Segoe UI,Roboto,sans-serif;">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #fecaca;border-radius:12px;overflow:hidden;">
        <div style="background:#b91c1c;color:#ffffff;padding:16px 24px;font-weight:800;font-size:16px;">⚠️ Vestential 市場焦點異常</div>
        <div style="padding:20px 24px;font-size:14px;color:#374151;line-height:1.8;">
          <div><b>時間</b>: ${escapeHtml(ts)}</div>
          <div><b>類型</b>: ${escapeHtml(topic)}</div>
          <div><b>錯誤</b>: ${escapeHtml(message)}</div>
          <div><b>環境</b>: ${escapeHtml(env)}</div>
          <div style="margin-top:14px;font-size:13px;color:#6b7280;">建議查看 GitHub Actions run 或 Azure 容器 log:<br/>${escapeHtml(SITE_LINK)}</div>
        </div>
      </div>
    </div>`
  return sendMailCore(`⚠️ Vestential 市場焦點異常 — ${topic}`, text, html)
}