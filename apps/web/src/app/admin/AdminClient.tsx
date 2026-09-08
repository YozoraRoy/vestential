'use client'

import { useCallback, useEffect, useState } from 'react'

type Result = { ok: boolean; message: string } | null

interface StatusData {
  success: boolean
  generatedAt?: string
  health?: { ok: boolean; issues: Array<{ code: string; severity: string; message: string }>; checks: Record<string, any> }
  summary?: Record<string, number>
  arenaProgress?: Array<{ phase: string; note: string | null; created_at: string | null }>
  usage?: { totalUsers: number }
}

interface UsageUser {
  userId: number
  displayName: string | null
  email: string | null
  createdAt: string | null
  apiUsageCount: number
  recognitionCount: number
  arenaAgentCount: number
}

interface AgentSetting {
  key: string
  category: string
  label: string
  value: string
  updatedAt: string | null
}

interface ArenaProgress {
  success: boolean
  roundDate?: string
  season?: { id: number; name?: string } | null
  progress?: Array<{ phase: string; note: string | null; created_at: string | null }>
  agents?: Array<{ id: number; name: string; division: string; status: string }>
  leaderboard?: Array<{ agent_name: string; owner_name: string | null; equity: number; return_pct: number; round_date: string | null }>
}

const btn =
  'inline-flex items-center justify-center px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition'
const btnGhost =
  'inline-flex items-center justify-center px-4 py-2 rounded-lg border border-white/15 text-[var(--text-primary)] text-sm font-medium hover:border-[var(--accent)]/60 hover:text-[var(--accent)] disabled:opacity-50 transition'
const input =
  'w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]/60'

function ResultBanner({ result, onDismiss }: { result: Result; onDismiss: () => void }) {
  if (!result) return null
  return (
    <div
      className={`mb-6 px-4 py-3 rounded-lg text-sm border ${
        result.ok ? 'bg-[var(--accent-green)]/10 border-[var(--accent-green)]/30 text-[var(--accent-green)]' : 'bg-[var(--accent-red)]/10 border-[var(--accent-red)]/30 text-[var(--accent-red)]'
      }`}
    >
      <span className="whitespace-pre-wrap">{result.message}</span>
      <button onClick={onDismiss} className="float-right text-xs opacity-70 hover:opacity-100">✕</button>
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-[var(--bg-card)] rounded-2xl border border-white/5 p-6">
      <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">{title}</h2>
      {children}
    </section>
  )
}

const post = (url: string, body?: unknown) =>
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  }).then(async (r) => ({ ok: r.ok, body: await r.json().catch(() => ({})) }))

const getJson = (url: string) => fetch(url).then(async (r) => ({ ok: r.ok, body: await r.json().catch(() => ({})) }))

export function AdminClient() {
  const [status, setStatus] = useState<StatusData | null>(null)
  const [usage, setUsage] = useState<UsageUser[]>([])
  const [settings, setSettings] = useState<AgentSetting[]>([])
  const [arena, setArena] = useState<ArenaProgress | null>(null)
  const [result, setResult] = useState<Result>(null)
  const [settingsDrafts, setSettingsDrafts] = useState<Record<string, string>>({})
  const [mfPreview, setMfPreview] = useState<{ summary: string; items: Array<{ title: string; source: string; reason: string | null }> } | null>(null)
  const [alsoSocial, setAlsoSocial] = useState(false)
  const [arenaBusy, setArenaBusy] = useState<{ roundDate?: string }>({})

  const load = useCallback(async () => {
    const [s, u, st, a] = await Promise.all([
      getJson('/api/admin/status'),
      getJson('/api/admin/usage'),
      getJson('/api/admin/settings'),
      getJson('/api/admin/arena/progress'),
    ])
    if (s.ok && s.body.success) setStatus(s.body)
    if (u.ok && u.body.success) setUsage(u.body.users ?? [])
    if (st.ok && st.body.success) {
      setSettings(st.body.settings ?? [])
      const drafts: Record<string, string> = {}
      for (const x of st.body.settings ?? []) drafts[x.key] = x.value
      setSettingsDrafts(drafts)
    }
    if (a.ok && a.body.success) setArena(a.body)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const showResult = (ok: boolean, message: string) => setResult({ ok, message })

  const saveSetting = async (key: string) => {
    const r = await post('/api/admin/settings', { key, value: settingsDrafts[key] ?? '' })
    showResult(r.ok, r.ok ? `已儲存 ${key}` : `儲存失敗：${r.body.error ?? ''}`)
  }

  const runMfDry = async () => {
    setArenaBusy({ roundDate: 'mf_dry' })
    const r = await post('/api/admin/market-focus', { mode: 'dry' })
    setArenaBusy({})
    if (r.ok && r.body.success) {
      setMfPreview({ summary: r.body.summary ?? '', items: r.body.items ?? [] })
      showResult(true, `乾跑完成：精選 ${r.body.count} 則（未寫入 DB）`)
    } else {
      showResult(false, `乾跑失敗：${r.body.error ?? ''}`)
    }
  }

  const runMfPublish = async () => {
    const r = await post('/api/admin/market-focus', { mode: 'publish', alsoSocial })
    showResult(r.ok, r.ok ? `已發布 ${r.body.count} 則新聞` + (alsoSocial ? `，社群：${JSON.stringify(r.body.social?.results ?? r.body.social ?? {})}` : '') : `發布失敗：${r.body.error ?? ''}`)
  }

  const runSocial = async (dry: boolean, force: boolean) => {
    const r = await post('/api/admin/social/publish', { dryRun: dry, force })
    showResult(r.ok, r.ok ? JSON.stringify(r.body) : `失敗：${r.body.error ?? ''}`)
  }

  const runArena = async (phase: 'premarket' | 'slot' | 'close', slot?: number, force = false) => {
    setArenaBusy({ roundDate: `${phase}${slot ?? ''}` })
    const r = await post('/api/admin/arena/tick', { phase, slot, force })
    setArenaBusy({})
    showResult(
      r.ok,
      r.ok
        ? `${phase}${slot != null ? ` slot${slot}` : ''} 完成：processed=${r.body.processed ?? 0} trades=${r.body.trades ?? 0} errors=${JSON.stringify(r.body.errors ?? [])}${r.body.alreadyRun ? '（已跑過）' : ''}`
        : `${phase} 失敗：${r.body.error ?? ''}`,
    )
    load()
  }

  const health = status?.health
  const groups = ['market-focus', 'social', 'arena', 'custom']

  return (
    <div className="space-y-6">
      <ResultBanner result={result} onDismiss={() => setResult(null)} />

      {/* 系統狀態 */}
      <Card title="系統狀態">
        {!status ? (
          <p className="text-sm text-[var(--text-secondary)]">載入中…</p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-3 text-sm">
              <Badge label="Health" ok={health?.ok} />
              <Stat label="使用者" value={status.summary?.users} />
              <Stat label="競技場 Agent" value={status.summary?.agents} />
              <Stat label="市場焦點" value={status.summary?.marketFocus} />
              <Stat label="社群貼文" value={status.summary?.socialPosts} />
              <Stat label="競技場輪次" value={status.summary?.arenaRounds} />
              <Stat label="用量使用者" value={status.usage?.totalUsers} />
            </div>
            {(health?.issues?.length ?? 0) > 0 ? (
              <ul className="text-sm space-y-1.5">
                {health!.issues.map((i) => (
                  <li key={i.code} className={i.severity === 'error' ? 'text-[var(--accent-red)]' : 'text-[var(--accent-violet)]'}>
                    {i.severity === 'error' ? '⚠' : '◆'} <code>{i.code}</code> {i.message}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-[var(--accent-green)]">✓ 全部檢查通過 (生成時間 {status.generatedAt})</p>
            )}
            <div>
              <h3 className="text-xs font-semibold text-[var(--text-secondary)] mb-2 uppercase tracking-wide">今日競技場階段進度</h3>
              {(status.arenaProgress?.length ?? 0) === 0 ? (
                <p className="text-sm text-[var(--text-secondary)]">今日尚未有階段完成</p>
              ) : (
                <ul className="text-sm space-y-1">
                  {status.arenaProgress!.map((p) => (
                    <li key={p.phase}>
                      <code className="text-[var(--accent)]">{p.phase}</code> <span className="text-[var(--text-secondary)]">— {p.note ?? ''} ({p.created_at})</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Card>

      {/* 市場焦點 agent */}
      <Card title="市場焦點 Agent">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <button className={btn} onClick={runMfDry} disabled={Object.keys(arenaBusy).length > 0}>乾跑預覽（不寫 DB）</button>
            <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)] cursor-pointer">
              <input type="checkbox" checked={alsoSocial} onChange={(e) => setAlsoSocial(e.target.checked)} />
              發布後同步觸發社群
            </label>
            <button className={btnGhost} onClick={runMfPublish} disabled={Object.keys(arenaBusy).length > 0}>發布（寫入 DB）</button>
          </div>
          {mfPreview && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm">
              <h3 className="font-semibold text-[var(--text-primary)] mb-2">乾跑每日總覽</h3>
              <p className="text-[var(--text-secondary)] whitespace-pre-wrap mb-3">{mfPreview.summary}</p>
              <h3 className="font-semibold text-[var(--text-primary)] mb-2">精選新聞</h3>
              <ul className="space-y-1.5 text-[var(--text-secondary)]">
                {mfPreview.items.map((it, i) => (
                  <li key={i}>• <span className="text-[var(--text-primary)]">{it.title}</span>{it.reason ? `（${it.reason}）` : ''} <span className="text-xs opacity-70">[{it.source}]</span></li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Card>

      {/* 社群 agent */}
      <Card title="社群小編 Agent">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <button className={btn} onClick={() => runSocial(true, false)}>乾跑生成文案</button>
            <button className={btnGhost} onClick={() => runSocial(false, false)}>發布（僅未發布平台）</button>
            <button className={btnGhost} onClick={() => runSocial(false, true)}>強制重發全部（清去重）</button>
          </div>
        </div>
      </Card>

      {/* Agent 設定 */}
      <Card title="Agent 設定">
        <p className="text-sm text-[var(--text-secondary)] mb-4">未填空白代表使用內建預設。市場焦點 / 社群產出會即時套用。</p>
        <div className="grid md:grid-cols-2 gap-6">
          {groups.map((g) => {
            const list = settings.filter((s) => s.category === g)
            if (list.length === 0) return null
            return (
              <div key={g}>
                <h3 className="text-sm font-semibold text-[var(--accent)] mb-3">{groupLabel(g)}</h3>
                <div className="space-y-4">
                  {list.map((s) => (
                    <div key={s.key}>
                      <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">{s.label}</label>
                      <div className="flex gap-2">
                        <textarea
                          className={input + ' min-h-[72px]'}
                          value={settingsDrafts[s.key] ?? ''}
                          onChange={(e) => setSettingsDrafts((d) => ({ ...d, [s.key]: e.target.value }))}
                        />
                        <button className={btnGhost + ' shrink-0 self-start'} onClick={() => saveSetting(s.key)}>存</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      {/* 競技場管理 */}
      <Card title="競技場管理">
        <div className="space-y-4">
          <p className="text-sm text-[var(--text-secondary)]">
            目前輪次 <code className="text-[var(--accent)]">{arena?.roundDate ?? '—'}</code>
            {arena?.season?.name ? `・${arena.season.name}` : ''}
          </p>
          <div className="flex flex-wrap gap-2">
            <button className={btn} onClick={() => runArena('premarket')} disabled={Object.keys(arenaBusy).length > 0}>跑 Pre-market</button>
            {[0, 1, 2, 3].map((s) => (
              <button key={s} className={btnGhost} onClick={() => runArena('slot', s)} disabled={Object.keys(arenaBusy).length > 0}>Slot {s}</button>
            ))}
            <button className={btnGhost} onClick={() => runArena('close')} disabled={Object.keys(arenaBusy).length > 0}>收盤結算</button>
          </div>
          <div>
            <h3 className="text-xs font-semibold text-[var(--text-secondary)] mb-2 uppercase tracking-wide">階段進度</h3>
            {(arena?.progress?.length ?? 0) === 0 ? (
              <p className="text-sm text-[var(--text-secondary)]">今日無階段完成紀錄</p>
            ) : (
              <ul className="text-sm space-y-1">
                {arena!.progress!.map((p) => (
                  <li key={p.phase}><code className="text-[var(--accent)]">{p.phase}</code> <span className="text-[var(--text-secondary)]">— {p.note ?? ''}</span></li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="text-xs font-semibold text-[var(--text-secondary)] mb-2 uppercase tracking-wide">排行榜（最新輪次）</h3>
            {(arena?.leaderboard?.length ?? 0) === 0 ? (
              <p className="text-sm text-[var(--text-secondary)]">尚無資料</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-[var(--text-secondary)] uppercase tracking-wide">
                      <th className="py-2 pr-4">Agent</th>
                      <th className="py-2 pr-4">擁有者</th>
                      <th className="py-2 pr-4 text-right">權益</th>
                      <th className="py-2 text-right">報酬率</th>
                    </tr>
                  </thead>
                  <tbody>
                    {arena!.leaderboard!.map((a, i) => (
                      <tr key={i} className="border-t border-white/5">
                        <td className="py-2 pr-4 text-[var(--text-primary)]">{a.agent_name}</td>
                        <td className="py-2 pr-4 text-[var(--text-secondary)]">{a.owner_name ?? '—'}</td>
                        <td className="py-2 pr-4 text-right text-[var(--text-primary)]">{Number(a.equity).toLocaleString()}</td>
                        <td className={`py-2 text-right ${Number(a.return_pct) >= 0 ? 'text-[var(--accent-green)]' : 'text-[var(--accent-red)]'}`}>
                          {Number(a.return_pct) >= 0 ? '+' : ''}{Number(a.return_pct).toFixed(2)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* 用量報表 */}
      <Card title="使用者用量報表">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--text-secondary)] uppercase tracking-wide">
                <th className="py-2 pr-4">ID</th>
                <th className="py-2 pr-4">名稱</th>
                <th className="py-2 pr-4">Email</th>
                <th className="py-2 pr-4 text-right">API 次數</th>
                <th className="py-2 pr-4 text-right">辨識</th>
                <th className="py-2 text-right">競技場 Agent</th>
              </tr>
            </thead>
            <tbody>
              {usage.length === 0 ? (
                <tr><td colSpan={6} className="py-4 text-[var(--text-secondary)]">尚無使用者</td></tr>
              ) : (
                usage.map((u) => (
                  <tr key={u.userId} className="border-t border-white/5">
                    <td className="py-2 pr-4 text-[var(--text-secondary)]">{u.userId}</td>
                    <td className="py-2 pr-4 text-[var(--text-primary)]">{u.displayName ?? '—'}</td>
                    <td className="py-2 pr-4 text-[var(--text-secondary)]">{u.email ?? '—'}</td>
                    <td className="py-2 pr-4 text-right">{u.apiUsageCount}</td>
                    <td className="py-2 pr-4 text-right">{u.recognitionCount}</td>
                    <td className="py-2 text-right">{u.arenaAgentCount}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

function Badge({ label, ok }: { label: string; ok?: boolean }) {
  return (
    <span
      className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
        ok === true ? 'bg-[var(--accent-green)]/15 text-[var(--accent-green)]' : ok === false ? 'bg-[var(--accent-red)]/15 text-[var(--accent-red)]' : 'bg-white/10 text-[var(--text-secondary)]'
      }`}
    >
      {label}: {ok === true ? 'OK' : ok === false ? 'FAIL' : '…'}
    </span>
  )
}

function Stat({ label, value }: { label: string; value?: number }) {
  return (
    <span className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-xs">
      {label} <b className="text-[var(--text-primary)]">{value ?? '—'}</b>
    </span>
  )
}

function groupLabel(g: string) {
  return { 'market-focus': '市場焦點小編', social: '社群小編', arena: '競技場', custom: '自訂' }[g] ?? g
}
