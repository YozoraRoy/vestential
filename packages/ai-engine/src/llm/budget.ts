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
