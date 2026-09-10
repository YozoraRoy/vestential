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

/**
 * 呼叫 Cloudflare Workers AI FLUX.1-schnell 生成科技底圖 Buffer。
 * 包含超時控制與容錯降級（失敗時回傳 null，圖卡將平滑回退至純色漸層）。
 */
export async function generateSocialBackgroundImage(ctx: SocialAiImageContext): Promise<Buffer | null> {
  if (!CF_ACCOUNT_ID || !CF_AI_TOKEN) {
    console.warn('[SocialAiImage] 缺少 Cloudflare Workers AI 憑證，跳過底圖生成')
    return null
  }

  const prompt = buildPromptForMarketFocus(ctx)

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
        num_steps: 4,
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

    const buffer = Buffer.from(data.result.image, 'base64')
    return buffer
  } catch (err: any) {
    if (err.name === 'AbortError') {
      console.warn('[SocialAiImage] Cloudflare Workers AI 生圖逾時 (12s)')
    } else {
      console.warn('[SocialAiImage] 生成底圖失敗，使用漸層兜底:', err.message || err)
    }
    return null
  }
}
