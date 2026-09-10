import { NextResponse } from 'next/server'
import { migrate, unsubscribeMarketFocusByToken } from '@stock/database'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

const PAGE_CSS = `
  body{margin:0;background:#0f172a;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft JhengHei",sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;}
  .card{max-width:420px;width:100%;margin:24px;padding:32px;border-radius:16px;background:#1e293b;border:1px solid #334155;text-align:center;}
  h1{font-size:20px;margin:0 0 12px;}
  p{font-size:14px;line-height:1.8;color:#94a3b8;margin:0 0 20px;}
  a{display:inline-block;color:#60a5fa;text-decoration:none;font-size:14px;font-weight:600;}
  .tag{display:inline-block;font-size:12px;padding:4px 12px;border-radius:9999px;background:#334155;color:#94a3b8;margin-bottom:16px;}
`

function renderPage(title: string, tag: string, message: string): Response {
  return new Response(
    `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${PAGE_CSS}</style></head><body><div class="card"><span class="tag">${tag}</span><h1>${title}</h1><p>${message}</p><a href="/market-focus">← 返回市場焦點</a></div></body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } },
  )
}

/** 公開退訂：電子報 footer 的連結會帶 email + token。 */
export async function GET(req: Request) {
  await migrate()
  const { searchParams } = new URL(req.url)
  const email = (searchParams.get('email') ?? '').trim().toLowerCase()
  const token = (searchParams.get('token') ?? '').trim()

  if (!email || !token) {
    return NextResponse.json({ success: false, error: '缺少 email 或 token' }, { status: 400 })
  }

  const ok = await unsubscribeMarketFocusByToken(email, token).catch(() => false)
  if (ok) {
    return renderPage('已成功退訂', 'Vestential 市場焦點', `您的信箱 ${email} 已從市場焦點電子報中移除，之後不會再收到我們的電子報。若想重新訂閱，隨時可以回到市場焦點頁面再次訂閱。`)
  }
  return renderPage('退訂連結無效', 'Vestential 市場焦點', '無法完成退訂：連結可能已失效，或該信箱已非有效訂閱狀態。若持續遇到問題，請寄信至 service@vestential.com。')
}