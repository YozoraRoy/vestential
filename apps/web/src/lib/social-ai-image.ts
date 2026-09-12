// ─── Cloudflare Workers AI 資訊圖卡背景生成模組 ─────────────────────
// 使用 FLUX.1-schnell 模型免費額度（每日 10,000 Neurons，約可免費生成 50~60 張）。
// 根據當日市場焦點與新聞行業關鍵字，動態產生符合 Vestential 科技綠色調的高清暗色底圖。

const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID || ''
const CF_AI_TOKEN = process.env.CF_AI_TOKEN || ''

export interface SocialAiImageContext {
  headline?: string
  summary?: string
  items?: { title: string }[]
}

/**
 * 依焦點新聞內容智能推導適合 FLUX 生圖的英文科技 Prompt
 */
export function buildPromptForMarketFocus(ctx: SocialAiImageContext): string {
  const combined = [
    ctx.headline ?? '',
    ctx.summary ?? '',
    ...(ctx.items?.map((i) => i.title) ?? []),
  ].join(' ')

  // 1. 半導體 / 晶圓 / 封裝
  if (/半導體|晶片|晶圓|台積電|聯發科|封裝|CoWoS|製程|ASML|IC/i.test(combined)) {
    return 'minimalist high-tech macro photography of glowing advanced microchip wafer, dark emerald green circuits, sleek modern semiconductor architecture, dark moody cinematic lighting, ultra-clean aesthetic, 8k resolution, no text'
  }

  // 2. AI / 伺服器 / 運算
  if (/AI|人工智慧|伺服器|算力|資料中心|散熱|輝達|NVIDIA|黃仁勳|機器學習/i.test(combined)) {
    return 'futuristic AI neural network data center, glowing emerald green fiber optics and quantum processors, abstract matrix data stream, sleek dark tech atmosphere, cinematic depth of field, 8k resolution, no text'
  }

  // 3. 綠能 / 重電 / 儲能 / 電網
  if (/綠能|重電|儲能|電網|風電|太陽能|台電|電力|核能/i.test(combined)) {
    return 'abstract clean energy electrical power grid, glowing emerald green energy currents and high-voltage transmission network at twilight, futuristic renewable power concept, sleek dark mood, 8k resolution, no text'
  }

  // 4. 航運 / 海運 / 貨櫃
  if (/航運|海運|貨櫃|長榮|陽明|萬海|紅海|運價/i.test(combined)) {
    return 'modern maritime cargo container vessel moving through dark ocean at night, subtle glowing emerald green navigational lights, futuristic marine navigation radar, cinematic moody lighting, 8k resolution, no text'
  }

  // 5. 車用 / 電動車
  if (/車用|電動車|特斯拉|Tesla|電池|車廠/i.test(combined)) {
    return 'sleek futuristic electric vehicle chassis and glowing emerald green battery pack circuit lines, high-tech automotive engineering, minimalist dark studio lighting, 8k resolution, no text'
  }

  // 6. 金融 / 指數 / 大盤
  if (/金融|銀行|降息|升息|聯準會|Fed|ETF|外資|大盤|指數|期貨/i.test(combined)) {
    return 'abstract digital financial stock market visualization, glowing emerald green candlestick chart lines and network nodes on dark reflective glass, sleek modern fintech aesthetic, cinematic lighting, 8k resolution, no text'
  }

  // 預設：Vestential 品牌高階科技投資風格
  return 'abstract financial technology background, subtle dark green glowing circuit patterns and flowing data streams, elegant dark luxury tech wallpaper, minimalist composition, 8k resolution, no text'
}

export const BACKGROUND_PRESETS = [
  { id: 'auto', label: '🤖 AI 智能匹配', prompt: '' },
  {
    id: 'chip',
    label: '🔬 晶片半導體',
    prompt:
      'minimalist high-tech macro photography of glowing advanced microchip wafer, dark emerald green circuits, sleek modern semiconductor architecture, dark moody cinematic lighting, ultra-clean aesthetic, 8k resolution, no text',
  },
  {
    id: 'ai',
    label: '🧠 AI 算力中心',
    prompt:
      'futuristic AI neural network data center, glowing emerald green fiber optics and quantum processors, abstract matrix data stream, sleek dark tech atmosphere, cinematic depth of field, 8k resolution, no text',
  },
  {
    id: 'finance',
    label: '📈 金融趨勢線',
    prompt:
      'abstract digital financial stock market visualization, glowing emerald green candlestick chart lines and network nodes on dark reflective glass, sleek modern fintech aesthetic, cinematic lighting, 8k resolution, no text',
  },
  {
    id: 'energy',
    label: '⚡ 綠能智慧電網',
    prompt:
      'abstract clean energy electrical power grid, glowing emerald green energy currents and high-voltage transmission network at twilight, futuristic renewable power concept, sleek dark mood, 8k resolution, no text',
  },
  {
    id: 'shipping',
    label: '🚢 航運貨櫃巨輪',
    prompt:
      'modern maritime cargo container vessel moving through dark ocean at night, subtle glowing emerald green navigational lights, futuristic marine navigation radar, cinematic moody lighting, 8k resolution, no text',
  },
  { id: 'none', label: '⬛ 純色深色漸層', prompt: '' },
] as const

/**
 * Cloudflare Workers AI FLUX.1-schnell 生圖核心：認證、12 秒逾時、錯誤降級。
 * 失敗回傳 null，由呼叫端決定承接方式。
 */
async function callFluxImage(prompt: string): Promise<Buffer | null> {
  if (!CF_ACCOUNT_ID || !CF_AI_TOKEN) {
    console.warn('[SocialAiImage] 缺少 Cloudflare Workers AI 憑證，跳過生圖')
    return null
  }
  if (!prompt) return null

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 12000) // 12 秒逾時保護

    const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/@cf/black-forest-labs/flux-1-schnell`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${CF_AI_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
      }),
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      console.warn(`[SocialAiImage] Cloudflare API 錯誤 HTTP ${res.status}:`, errText)
      return null
    }

    const data = await res.json()
    if (!data.success || !data.result?.image) {
      console.warn('[SocialAiImage] Cloudflare API 回傳格式不符合預期:', data.errors)
      return null
    }

    return Buffer.from(data.result.image, 'base64')
  } catch (err: any) {
    if (err.name === 'AbortError') {
      console.warn('[SocialAiImage] Cloudflare Workers AI 生圖逾時 (12s)')
    } else {
      console.warn('[SocialAiImage] 生成圖像失敗，使用兜底:', err.message || err)
    }
    return null
  }
}

/**
 * 呼叫 Cloudflare Workers AI FLUX.1-schnell 生成科技底圖 Buffer。
 * 包含超時控制與容錯降級（失敗時回傳 null，圖卡將平滑回退至純色漸層）。
 */
export async function generateSocialBackgroundImage(
  ctx: SocialAiImageContext,
  options?: { prompt?: string; preset?: string },
): Promise<Buffer | null> {
  if (options?.preset === 'none') {
    return null
  }

  let prompt = options?.prompt?.trim()
  if (!prompt && options?.preset && options.preset !== 'auto') {
    const matched = BACKGROUND_PRESETS.find((p) => p.id === options.preset)
    if (matched?.prompt) {
      prompt = matched.prompt
    }
  }
  if (!prompt) {
    prompt = buildPromptForMarketFocus(ctx)
  }

  return callFluxImage(prompt)
}

/**
 * 依梗圖概念（主標題＋punchline）判斷行情情緒，回傳吉祥物表情段落。
 * 跌勢最優先（恐慌）、再來是事件（緊張），接著漲勢（開心），其餘（理性）。
 */
function detectRobotEmotion(combined: string): 'panic' | 'stress' | 'bull' | 'neutral' {
  if (/跌|崩|重挫|大跌|跳水|破底|下修|利空|下殺|走弱|暴跌|狂跌/i.test(combined)) return 'panic'
  if (/戰|衝突|制裁|地震|颱風|危機|缺電|召回|罷工|斷鏈|封鎖|動盪/i.test(combined)) return 'stress'
  if (/漲|噴|飆|創高|新高|大漲|暴漲|上漲|突破|利多|放量|獲利|上調/i.test(combined)) return 'bull'
  return 'neutral'
}

const ROBOT_EMOTIONS: Record<'panic' | 'stress' | 'bull' | 'neutral', string> = {
  bull: 'the cute mascot robot jumping with joy raising its little arms, sparkles and golden coins floating around, a huge bright green rising arrow behind it',
  panic: 'the cute mascot robot with enormous shocked eyes, sweat drops flying in panic, desperately clinging to a tiny broken candlestick chart',
  stress: 'the cute mascot robot wearing a tiny hard hat, worried but determined, staring at a glowing holographic warning screen',
  neutral: 'the cute mascot robot calmly analyzing floating holographic stock charts, glowing data streams swirling around it',
}

/** Vestential 品牌吉祥物：圓潤 chibi 投資機器人，綠光護目鏡，命名 Vesty。 */
const VESTY = 'the recurring cute chibi fintech mascot robot named Vesty, round chunky metal body, glowing emerald visor eyes, small antenna'

/** 依產業關鍵字挑出吉祥物所在的「世界」構圖（不直接含情緒，情緒另外疊加）。 */
function pickRobotScene(combined: string): string {
  if (/半導體|晶片|晶圓|台積電|聯發科|封裝|CoWoS|製程|ASML|IC/i.test(combined)) {
    return 'standing proudly beside a giant glowing microchip wafer with emerald circuit light beams'
  }
  if (/AI|人工智慧|伺服器|算力|資料中心|散熱|輝達|NVIDIA|黃仁勳|機器學習/i.test(combined)) {
    return 'surrounded by a colossal glowing AI neural network brain built from fiber optics and data streams'
  }
  if (/綠能|重電|儲能|電網|風電|太陽能|台電|電力|核能/i.test(combined)) {
    return 'standing before a tower of glowing emerald electricity arcs and spinning wind turbines'
  }
  if (/航運|海運|貨櫃|長榮|陽明|萬海|紅海|運價/i.test(combined)) {
    return 'on the bridge of a massive container ship crossing dark ocean swells with glowing navigational lights'
  }
  if (/車用|電動車|特斯拉|Tesla|電池|車廠/i.test(combined)) {
    return "high-fiving a sleek electric sports car with glowing emerald charging cables"
  }
  if (/金融|銀行|降息|升息|聯準會|Fed|ETF|外資|大盤|指數|期貨/i.test(combined)) {
    return 'riding a wave of glowing emerald candlesticks surging upward through dark reflective glass'
  }
  return 'floating in a luxurious dark data-trading room woven with emerald circuit patterns and flowing data streams'
}

/**
 * 依梗圖概念（主標題＋punchline）智能推導適合 FLUX 生圖的「吉祥物全圖」英文 Prompt。
 * 由 Vesty 機器人主角＋行業世界＋行情情緒組成一張角色向漫畫構圖，
 * 刻意不打字：上方保留大字排版區，由 canvas 疊上精準中文。
 */
export function buildArtPromptForMeme(meme: { title: string; punchline: string }): string {
  const combined = [meme.title, meme.punchline].join(' ')
  const emotion = ROBOT_EMOTIONS[detectRobotEmotion(combined)]
  const scene = pickRobotScene(combined)

  return `${VESTY} ${scene}, ${emotion}, bold modern vector comic panel illustration with thick clean outlines, vivid emerald and dark teal palette on deep dark background, kawaii chibi proportions, cinematic contrast, bright empty upper third reserved for bold caption, no text, 8k`
}

/**
 * 呼叫 Cloudflare Workers AI FLUX.1-schnell 生成「AI 全圖卡」專屬藝術構圖 Buffer。
 * 依梗圖主軸產出不打字的完整海報式構圖，再由 canvas 疊上精準中文文案。
 * 失敗回傳 null，呼叫端以一般底圖或純色漸層兜底。
 */
export async function generateSocialArtworkImage(meme: { title: string; punchline: string }): Promise<Buffer | null> {
  return callFluxImage(buildArtPromptForMeme(meme))
}
