import { NextResponse } from 'next/server'
import { runHealthChecks } from '@/lib/health'

export async function GET() {
  try {
    const report = await runHealthChecks()
    return NextResponse.json(report, { status: report.ok ? 200 : 500 })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message, issues: [] }, { status: 500 })
  }
}