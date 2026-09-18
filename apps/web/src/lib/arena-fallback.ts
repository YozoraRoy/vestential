/**
 * agent-arena 模板備援 vs 模型備援判定（Issue #14）。
 *
 * 背景：DB `fallback_used=1` 只代表「fallback 模型產出」，不代表內容是模板。
 * 真正的模板原文來自 ai-engine：
 * - discussion：`fallbackDiscussion()`（narration.ts）含「統計資料不足，以原則性結論替代」
 * - briefing：`fallbackBriefing()`（market-briefing.ts）含「統計後備」
 *
 * API route（state／round）用此 helper 計算 `isTemplateFallback` 回傳給前台；
 * DB 歷史值不動、無 migration（歷史誤標僅前台修正）。
 */

export const DISCUSSION_TEMPLATE_MARKER = '統計資料不足，以原則性結論替代'
export const BRIEFING_TEMPLATE_MARKER = '統計後備'

export type ArenaTemplateKind = 'briefing' | 'discussion'

/** content 是否為模板原文（依 kind 比對對應特徵字串）。 */
export function isTemplateFallbackContent(content: string | null | undefined, kind: ArenaTemplateKind): boolean {
  if (!content) return false
  const marker = kind === 'briefing' ? BRIEFING_TEMPLATE_MARKER : DISCUSSION_TEMPLATE_MARKER
  return content.includes(marker)
}

/** 備援種類：template（模板備援）／model（模型備援）／null（無備援）。模板優先判定。 */
export function resolveFallbackKind(
  item: { content?: string | null; fallbackUsed?: boolean | null } | null | undefined,
  kind: ArenaTemplateKind,
): 'template' | 'model' | null {
  if (!item) return null
  if (isTemplateFallbackContent(item.content, kind)) return 'template'
  if (item.fallbackUsed) return 'model'
  return null
}
