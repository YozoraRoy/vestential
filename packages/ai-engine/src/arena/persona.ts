import { dataBlock, sanitizeDataField } from './prompt-utils.js'
import type { ArenaStrategyParams } from './types.js'

/** 交易性格預設清單。personality 值為預設 id 即套用對應特質；否則視為自訂描述文字。 */
export const ARENA_PERSONALITY_PRESETS: Array<{ id: string; nameZh: string; trait: string }> = [
  {
    id: 'decisive',
    nameZh: '決斷型',
    trait: '快速反應、敢於下手，換手較頻繁；對當日資訊採即時行動主義，看到明確訊號就執行。',
  },
  {
    id: 'zen',
    nameZh: '佛系',
    trait: '低換手、讓獲利奔跑；除非基本面或趨勢明顯轉變，否則長期持有、很少盤中進出。',
  },
  {
    id: 'data',
    nameZh: '數據控',
    trait: '嚴格依數字與紀律操作，忽略消息面與情緒，只在數據支持時出手。',
  },
  {
    id: 'risk_averse',
    nameZh: '風險趨避',
    trait: '極度保護本金：嚴格停損、維持較高現金比例、避免集中持股。',
  },
  {
    id: 'contrarian',
    nameZh: '逆向',
    trait: '敢在恐慌時分批低接、在過熱時調節，偏好與群眾相反的時點。',
  },
]

export function getPersonalityTrait(personality: string | null | undefined): string | null {
  if (!personality?.trim()) return null
  const p = ARENA_PERSONALITY_PRESETS.find((x) => x.id === personality.trim())
  if (p) return `${p.nameZh}：${p.trait}`
  const custom = sanitizeDataField(personality, 40)
  return custom ? `自訂：${custom}` : null
}

/** 組進 system prompt 的性格資料區塊（不可信文字的縱深防護）。 */
export function personalityDataBlock(personality: string | null | undefined): string {
  const trait = getPersonalityTrait(personality)
  if (!trait) return ''
  return dataBlock('personality', trait, 120)
}

export function strategyParamsText(params: ArenaStrategyParams): string {
  return [
    `單檔持倉上限 ${params.maxPositionPct}%`,
    `個股自成本虧損達 ${params.stopLossPct}% 時強制減碼一半`,
    `現金低於總權益 ${params.minCashBufferPct}% 時不得買入`,
    `每個盤中時點最多下單 ${params.maxTradesPerSlot} 筆`,
  ].join('；') + '。'
}

export function strategyParamsDataBlock(params: ArenaStrategyParams): string {
  return dataBlock('strategy_params', strategyParamsText(params), 200)
}