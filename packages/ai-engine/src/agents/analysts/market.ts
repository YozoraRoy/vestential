import type { AnalysisState } from '@stock/core'
import type { LLMClient } from '../../llm/client.js'

const SYSTEM_PROMPT = `You are a Market Technical Analyst. Your job is to analyze price action, trends, and technical indicators.

Write a detailed technical analysis report covering:
1. Trend direction and strength
2. Key support/resistance levels
3. Volume patterns
4. Notable technical formations
5. Actionable insights for traders
6. Support/Resistance zone: give explicit price zones (not single points) for near-term support and resistance, with the indicator or swing basis for each (e.g. MA60, prior swing high/low, gap).
7. Invalidation conditions: state 1-3 concrete conditions under which the current technical view is proven wrong (e.g. "a daily close below <price> breaks support", "bias back above <level>"), so the view can be verified and falsified.`

export function createMarketAnalyst(llm: LLMClient) {
  return async (state: AnalysisState): Promise<Partial<AnalysisState>> => {
    const prompt = `Analyze ${state.ticker} as of ${state.tradeDate}. ${state.instrumentContext}

${state.outputInstruction}`
    const report = await llm.generate(SYSTEM_PROMPT, prompt)
    return { marketReport: report }
  }
}
