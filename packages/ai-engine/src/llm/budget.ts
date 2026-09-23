/**
 * LLM output-token budget helpers.
 *
 * Groq qwen (tier2) has OTPM=1000 hard cap. Any request with
 * `max_tokens > 1000` on that tier is guaranteed 429. This module
 * provides the safe ceiling constant and greedy-batching utilities
 * so callers never exceed it.
 */

/** Groq qwen tier2 OTPM hard ceiling — never request more than this. */
export const FALLBACK_SAFE_MAX_TOKENS = 1000

// ─── Issue #32：錯峰＋自適應退避（執行期行為，不動靜態 max_tokens）───
// 以下全部是「執行期」參數：預設寫死在 code，僅能以 env 覆寫；
// 靜態 max_tokens（FALLBACK_SAFE_MAX_TOKENS、各呼叫點傳入值）一律不動。

/** refresh/social 鏈相鄰兩次 LLM 呼叫之間的錯峰間隔預設值（ms）。 */
export const DEFAULT_CHAIN_PACE_MS = 8000
/** 當日總覽（daily summary）前後的錯峰間隔預設值（ms；9/23 事故點，給 OTPM 分鐘窗留出重置空間）。 */
export const DEFAULT_SUMMARY_PACE_MS = 20000
/** 429 自適應縮小 budget 的 token 下限（執行期重試用，不動靜態 max_tokens）。 */
export const RETRY_BUDGET_FLOOR_TOKENS = 200

function parsePaceMs(raw: string | undefined, fallback: number): number {
  const n = Number(raw)
  if (raw == null || raw.trim() === '' || !Number.isFinite(n) || n < 0) return fallback
  return Math.round(n)
}

/** 相鄰 LLM 呼叫錯峰間隔（env LLM_CHAIN_PACE_MS 覆寫，預設 8000ms）。 */
export function getChainPaceMs(env: NodeJS.ProcessEnv = process.env): number {
  return parsePaceMs(env.LLM_CHAIN_PACE_MS, DEFAULT_CHAIN_PACE_MS)
}

/** 總覽前後錯峰間隔（env LLM_SUMMARY_PACE_MS 覆寫，預設 20000ms）。 */
export function getSummaryPaceMs(env: NodeJS.ProcessEnv = process.env): number {
  return parsePaceMs(env.LLM_SUMMARY_PACE_MS, DEFAULT_SUMMARY_PACE_MS)
}

/** 可中斷測試的 sleep（呼叫端直接 await）。 */
export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * 對退避等待加 jitter（±25%），避免整鏈多個呼叫在同一分鐘窗邊界「對齊」重試、
 * 集體再打爆 OTPM。純函數（random 可注入，方便單測）。
 */
export function jitterDelay(baseMs: number, random: () => number = Math.random): number {
  if (!Number.isFinite(baseMs) || baseMs <= 0) return 0
  return Math.max(0, Math.round(baseMs * (0.75 + random() * 0.5)))
}

/**
 * 429 後執行期自適應縮小本次重試的 max_tokens（靜態設定不動，只影響當次重試的
 * request body）。每次 ×0.6， floor 200（低於 floor 不再縮）。
 */
export function shrinkBudgetForRetry(
  currentMaxTokens: number,
  floor: number = RETRY_BUDGET_FLOOR_TOKENS,
): number {
  if (!Number.isFinite(currentMaxTokens) || currentMaxTokens <= floor) return currentMaxTokens
  return Math.max(floor, Math.floor(currentMaxTokens * 0.6))
}

/**
 * Greedy fixed-budget chunker.
 *
 * Splits `items` into consecutive batches such that for every batch:
 *   Σ estimate(item) + baseOverhead ≤ budget
 *
 * Special cases:
 * - Empty input → `[]`
 * - Single item whose estimate already exceeds budget → sole-element batch
 *   (caller must handle oversized single items; the chunker never drops them)
 *
 * @param items       - Source array (order preserved across chunks).
 * @param budget      - Token ceiling per batch (typically 850 for summaries,
 *                      leaving headroom below FALLBACK_SAFE_MAX_TOKENS).
 * @param estimate    - Per-item output-token estimate function.
 * @param baseOverhead - Fixed per-batch overhead (system prompt, JSON wrapper, etc.).
 * @returns Array of consecutive slices of `items`.
 */
export function chunkByOutputBudget<T>(
  items: T[],
  budget: number,
  estimate: (item: T) => number,
  baseOverhead: number,
): T[][] {
  if (items.length === 0) return []

  const chunks: T[][] = []
  let current: T[] = []
  let cost = baseOverhead

  for (const item of items) {
    const itemCost = estimate(item)

    if (current.length > 0 && cost + itemCost > budget) {
      chunks.push(current)
      current = []
      cost = baseOverhead
    }

    current.push(item)
    cost += itemCost
  }

  if (current.length > 0) {
    chunks.push(current)
  }

  return chunks
}

/**
 * Merge one chunk's LLM result entries into a shared destination map,
 * adjusting indices by `offset` so local 0-based indices map back to the
 * original item positions.
 *
 * Rules:
 * - `offset` is added to every entry's `index` before writing.
 * - Existing keys in `dst` ARE overwritten by the batch value.
 * - Indices present in `dst` but absent from `entries` are NOT removed
 *   (model may skip some items; previous values are preserved).
 *
 * @param dst     - Mutable `Map<number, string>` that accumulates results across chunks.
 * @param entries - Parsed LLM output entries (`{ index: local, value: "..." }[]`).
 * @param offset  - Chunk's starting index in the original item array.
 */
export function mergeChunkEntries(
  dst: Map<number, string>,
  entries: { index: number; value: string }[],
  offset: number,
): void {
  for (const e of entries) {
    const key = e.index + offset
    if (typeof e.value === 'string' && e.value.trim()) {
      dst.set(key, e.value.trim())
    }
  }
}
