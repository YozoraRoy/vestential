/**
 * Arena 單一累計報酬率算法（Issue #38 canonical 定義）。
 *
 * - 最新快照：`(equity - initial) / initial`，四捨五入至小數 2 位
 *   （`Math.round(x * 10000) / 100`，與 engine 快照寫入一致）。
 * - 無快照時：沿用現金公式 `(cash - initial) / initial`（同 rounding，前端標示為估算）。
 * - 快照排序選邊：`getArenaSnapshots` 維持 `ORDER BY round_date ASC`
 *   （admin `/api/admin/arena/round` 的 equitySeries 依賴時間序，
 *   改排序會連動影響，故不動 DB；取最新一律用最後一筆，見 `latestArenaSnapshot`）。
 */

/** 累計報酬率 %（equity 為最新快照權益；initial <= 0 時回 0，避免除零）。 */
export function arenaReturnPct(equity: number, initialCapital: number): number {
  if (!Number.isFinite(equity) || !Number.isFinite(initialCapital) || initialCapital <= 0) return 0
  return Math.round(((equity - initialCapital) / initialCapital) * 10000) / 100
}

/** 無快照時的現金公式估算（同 rounding；呼叫端須標示為估算）。 */
export function arenaCashEstimatePct(cash: number, initialCapital: number): number {
  return arenaReturnPct(cash, initialCapital)
}

/**
 * 取最新快照：`getArenaSnapshots` 為 ASC 時間序，故最新 = 最後一筆。
 * 空陣列回 null（呼叫端改用現金公式）。
 */
export function latestArenaSnapshot<T extends { round_date: string }>(snapshots: readonly T[]): T | null {
  if (!snapshots || snapshots.length === 0) return null
  return snapshots[snapshots.length - 1]
}
