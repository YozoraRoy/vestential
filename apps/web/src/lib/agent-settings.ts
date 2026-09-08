export const DEFAULT_AGENT_SETTINGS: Record<string, { category: string; label: string; defaultValue: string }> = {
  // 市場焦點小編
  'market_focus.select_count': { category: 'market-focus', label: '精選新聞數量', defaultValue: '10' },
  'market_focus.select_prompt': { category: 'market-focus', label: '選新聞 System Prompt', defaultValue: '' },
  'market_focus.summary_prompt': { category: 'market-focus', label: '每日總覽 System Prompt', defaultValue: '' },
  'market_focus.summary_max_tokens': { category: 'market-focus', label: '每日總覽 max_tokens', defaultValue: '2048' },
  // 社群小編
  'social.ig_prompt': { category: 'social', label: 'IG 文案 System Prompt', defaultValue: '' },
  'social.threads_prompt': { category: 'social', label: 'Threads 文案 System Prompt', defaultValue: '' },
  'social.ig_max_chars': { category: 'social', label: 'IG 上限字數', defaultValue: '2200' },
  'social.threads_max_chars': { category: 'social', label: 'Threads 上限字數', defaultValue: '500' },
  // 競技場
  'arena.slippage': { category: 'arena', label: '滑價 slippage', defaultValue: '0.003' },
}
