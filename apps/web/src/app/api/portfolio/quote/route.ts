import { NextRequest, NextResponse } from 'next/server'
import { fetchLiveQuote, type Market } from '../../../../lib/portfolio'

function parseMarket(raw: string | null): Market | null {
  return raw === 'tw' || raw === 'us' ? raw : null
}

export async function GET(req: NextRequest) {
  const market = parseMarket(req.nextUrl.searchParams.get('market'))
  const symbol = req.nextUrl.searchParams.get('symbol')?.trim()
  if (!market || !symbol) {
    return NextResponse.json({ error: 'symbol and market required' }, { status: 400 })
  }

  const quote = await fetchLiveQuote(symbol, market)
  if (!quote) {
    return NextResponse.json({ error: '無法取得該股票的即時報價，請確認代號或改用手動輸入現價。' }, { status: 404 })
  }
  return NextResponse.json({ symbol: quote.symbol, price: quote.price, name: quote.name })
}