/**
 * Arena 單一累計報酬率算法（client-safe 鏡像，Issue #38）。
 *
 * Canonical 定義：`packages/ai-engine/src/arena/returns.ts`
 *（engine 快照寫入用該檔）。本檔為同一公式的 client-safe 實作，
 * 供 `agent-arena-view.tsx` 的排行榜與歷程兩處共用，保證
 * 同一快照、同一 rounding（小數 2 位四捨五入）。
 * 兩處實作一致性由 `arena-return.test.ts` 鎖定。
 *
 * 快照排序選邊：`getArenaSnapshots` 為 `ORDER BY round_date ASC`，
 * 最新快照一律取最後一筆（不動 DB 排序，避免影響 admin
 * `/api/admin/arena/round` 共用 query 的 equitySeries 時間序）。
 */

export interface ArenaSnapshotLike {
  round_date: string
  equity: number
  cash: number
  return_pct: number
}

/** 累計報酬率 %（最新快照權益；initial <= 0 回 0）。 */
export function arenaReturnPct(equity: number, initialCapital: number): number {
  if (!Number.isFinite(equity) || !Number.isFinite(initialCapital) || initialCapital <= 0) return 0
  return Math.round(((equity - initialCapital) / initialCapital) * 10000) / 100
}

/** 無快照時的現金公式估算（同 rounding；呼叫端須標示為估算）。 */
export function arenaCashEstimatePct(cash: number, initialCapital: number): number {
  return arenaReturnPct(cash, initialCapital)
}

/** 取最新快照（ASC 時間序 → 最後一筆；空陣列回 null）。 */
export function latestArenaSnapshot<T extends { round_date: string }>(snapshots: readonly T[]): T | null {
  if (!snapshots || snapshots.length === 0) return null
  return snapshots[snapshots.length - 1]
}

export interface UnifiedReturn {
  /** 顯示用報酬率 %（小數 2 位）。 */
  pct: number
  /** 該報酬率所依據的快照截至日期；null = 無快照（現金估算）。 */
  asOf: string | null
  /** true = 無快照，以現金公式估算（UI 須標示）。 */
  estimated: boolean
}

/**
 * 排行榜與歷程共用的統一報酬率：
 * 有快照 → 最新快照 equity 重算（與 DB return_pct 同算法，防舊快照 rounding 漂移）；
 * 無快照 → 現金公式估算。
 */
export function unifiedArenaReturn(
  snapshots: readonly ArenaSnapshotLike[] | undefined | null,
  initialCapital: number,
  cash: number,
): UnifiedReturn {
  const latest = snapshots ? latestArenaSnapshot(snapshots) : null
  if (latest) {
    return { pct: arenaReturnPct(latest.equity, initialCapital), asOf: latest.round_date, estimated: false }
  }
  return { pct: arenaCashEstimatePct(cash, initialCapital), asOf: null, estimated: true }
}
