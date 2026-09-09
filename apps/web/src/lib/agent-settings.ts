export interface AgentSettingMeta {
  category: string
  label: string
  defaultValue: string
  /** false 表示唯讀（平台硬上限／系統值），後台只顯示不給輸入框。 */
  editable?: boolean
  /** 設定旁的「?」說明（hover 顯示）。 */
  help?: string
}

export const DEFAULT_AGENT_SETTINGS: Record<string, AgentSettingMeta> = {
  // 市場焦點小編
  'market_focus.select_count': {
    category: 'market-focus',
    label: '精選新聞數量',
    defaultValue: '10',
    help: '每日從新聞池中挑選幾則精選（乾跑/發布皆適用）。',
  },
  'market_focus.select_prompt': {
    category: 'market-focus',
    label: '選新聞 System Prompt',
    defaultValue: '',
    help: '覆寫「篩選新聞」的系統提示詞；空白＝用內建預設。',
  },
  'market_focus.summary_prompt': {
    category: 'market-focus',
    label: '每日總覽 System Prompt',
    defaultValue: '',
    help: '覆寫「每日總覽」的系統提示詞；空白＝用內建預設。',
  },
  'market_focus.summary_max_tokens': {
    category: 'market-focus',
    label: '每日總覽 max_tokens',
    defaultValue: '2048',
    help: '生成每日總覽時 LLM 的 token 上限。',
  },
  // 社群小編
  'social.ig_prompt': {
    category: 'social',
    label: 'IG 文案 System Prompt',
    defaultValue: '',
    help: '覆寫 IG 文案生成提示詞；空白＝用內建預設。',
  },
  'social.threads_prompt': {
    category: 'social',
    label: 'Threads 文案 System Prompt',
    defaultValue: '',
    help: '覆寫 Threads 文案生成提示詞；空白＝用內建預設。',
  },
  'social.ig_max_chars': {
    category: 'social',
    label: 'IG 上限字數',
    defaultValue: '2200',
    editable: false,
    help: 'Instagram 平台文案上限，為硬性限制，不可調整。',
  },
  'social.threads_max_chars': {
    category: 'social',
    label: 'Threads 上限字數',
    defaultValue: '500',
    editable: false,
    help: 'Threads 平台文案上限，為硬性限制，不可調整。',
  },
  'social.card_style': {
    category: 'social',
    label: '圖卡樣式',
    defaultValue: 'classic',
    help: 'classic＝品牌資訊卡；meme＝經濟/科技梗圖大字版式。',
  },
  'social.meme_prompt': {
    category: 'social',
    label: '梗圖 System Prompt',
    defaultValue: '',
    help: '覆寫「梗圖概念」生成提示詞；空白＝用內建預設。',
  },
  // 競技場
  'arena.slippage': {
    category: 'arena',
    label: '滑價 slippage',
    defaultValue: '0.003',
    help: '下單打滑成本：買＝價×(1+slip)、賣＝價×(1−slip)。預設 0.3% 模擬無法剛好成交在收盤價。',
  },
  'arena.system_prompt': {
    category: 'arena',
    label: '競技場 Agent System Prompt',
    defaultValue: '',
    help: '附加到每個競技場 agent 決策提示詞末尾的全域覆寫（空白＝不用）。',
  },
}