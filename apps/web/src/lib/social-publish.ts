import { hasSocialPosted, createSocialPost, updateSocialPost, deleteSocialPostByEdition } from '@stock/database'
import type { SocialPostRow, SocialPostPlatform } from '@stock/database'

// ─── IG / Threads / Facebook 發布層 ───────────────────────────────
// IG/Threads 一律 two-step：建立 container → 輪詢/發布；FB 單步直發。
// token 全部從 env 讀，不落 DB。

const IG_API = 'https://graph.instagram.com/v21.0'
const THREADS_API = 'https://graph.threads.net/v1.0'
const FB_API = 'https://graph.facebook.com/v21.0'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export interface PublishConfig {
  instagram?: { accessToken?: string; userId?: string }
  threads?: {
    accessToken?: string
    userId?: string
    appId?: string
    appSecret?: string
  }
  facebook?: {
    accessToken?: string
    pageId?: string
  }
}

function getPublishConfig(): PublishConfig {
  return {
    instagram: {
      accessToken: process.env.IG_ACCESS_TOKEN,
      userId: process.env.IG_USER_ID,
    },
    threads: {
      accessToken: process.env.THREADS_ACCESS_TOKEN,
      userId: process.env.THREADS_USER_ID,
      appId: process.env.THREADS_APP_ID,
      appSecret: process.env.THREADS_APP_SECRET,
    },
    facebook: {
      accessToken: process.env.FB_ACCESS_TOKEN,
      pageId: process.env.FB_PAGE_ID,
    },
  }
}

/** 從 env 讀取單平台設定；未設定時回傳 null。 */
function platformEnv(platform: SocialPostPlatform): PublishConfig[SocialPostPlatform] | null {
  const c = getPublishConfig()
  return c[platform] ?? null
}

export interface PublishResult {
  platform: SocialPostPlatform
  status: SocialPostRow['status']
  containerId?: string | null
  externalId?: string | null
  error?: string | null
}

/** 偵測此 edition 是否已對平台發布過（含失敗紀錄）。 */
export async function alreadyPosted(platform: SocialPostPlatform, editionKey: string): Promise<boolean> {
  return hasSocialPosted(platform, editionKey)
}

/** 清除該平台該 edition 的發布紀錄（force 重發的前置步驟）。 */
export async function clearSocialPost(platform: SocialPostPlatform, editionKey: string): Promise<void> {
  await deleteSocialPostByEdition(platform, editionKey)
}

/**
 * 發布單一平台。若該 edition 已發布過則直接回傳既有狀態。
 * @param imageUrl 圖卡公開 URL（IG/Threads 需要公開可下載的圖片）。
 * @param dryRun 只寫紀錄不動 Meta API。
 */
export async function publishSocialPost(
  platform: SocialPostPlatform,
  editionKey: string,
  content: string,
  imageUrl: string | null,
  dryRun = false,
  force = false,
): Promise<PublishResult> {
  // dry-run 純模擬：不讀去重、不寫 DB、不動 Meta API。去重（force 清理）只屬發布流程。
  if (dryRun) {
    return { platform, status: 'dry_run', error: null }
  }

  if (await alreadyPosted(platform, editionKey)) {
    if (!force) {
      return { platform, status: 'published', error: 'duplicate edition, skipped' }
    }
    // force 重發：清除既有發布紀錄後重跑，才能再次發布同一 edition。
    await clearSocialPost(platform, editionKey)
  }

  const env = platformEnv(platform)
  if (!env?.accessToken) {
    await recordFailure(platform, editionKey, content, imageUrl, 'missing access token in env')
    return { platform, status: 'failed', error: 'missing access token in env' }
  }

  const row = await createSocialPost({ platform, editionKey, content, imageUrl })

  try {
    if (platform === 'instagram') {
      return await publishInstagram(row, env as NonNullable<PublishConfig['instagram']>, imageUrl)
    }
    if (platform === 'facebook') {
      return await publishFacebook(row, env as NonNullable<PublishConfig['facebook']>, imageUrl)
    }
    return await publishThreads(row, env as NonNullable<PublishConfig['threads']>, imageUrl)
  } catch (e: any) {
    const msg = e?.message || String(e)
    console.error(`[Social/${platform}] publish error:`, msg)
    await updateSocialPost(row.id, { status: 'failed', error: msg.slice(0, 1000) })
    return { platform, status: 'failed', externalId: row.external_id, error: msg.slice(0, 1000) }
  }
}

async function recordFailure(
  platform: SocialPostPlatform,
  editionKey: string,
  content: string,
  imageUrl: string | null,
  error: string,
) {
  try {
    const row = await createSocialPost({ platform, editionKey, content, imageUrl })
    await updateSocialPost(row.id, { status: 'failed', error: error.slice(0, 1000) })
  } catch (e) {
    console.error('[Social] recordFailure failed:', e)
  }
}

// ─── Instagram：container → publish ───────────────────────────────
async function publishInstagram(
  row: SocialPostRow,
  env: NonNullable<PublishConfig['instagram']>,
  imageUrl: string | null,
): Promise<PublishResult> {
  const accessToken = env.accessToken
  if (!accessToken) throw new Error('IG_ACCESS_TOKEN 未設定')

  // user_id 未提供時，用 /me 解析 token 對應帳號
  const igUserId = env.userId || (await resolveIgUserId(accessToken))
  if (!igUserId) throw new Error('無法解析 IG user id（IG_USER_ID 或 /me）')

  // IG Content Publishing API 不接受純文字貼文，且只接受 JPEG（透過公開 URL）。
  if (!imageUrl) throw new Error('Instagram 必須提供圖卡（IG 不支援純文字貼文）')

  const mediaUrl = `${IG_API}/${igUserId}/media`
  const createBody: Record<string, string> = {
    access_token: accessToken,
    caption: row.content,
    image_url: imageUrl,
  }
  const created = await graphPost(mediaUrl, createBody)
  const containerId = String(created.id ?? '')
  await updateSocialPost(row.id, { status: 'container_created', container_id: containerId })

  // 等待 container 準備就緒後發布
  await waitForContainer(igUserId, containerId, accessToken, 'instagram')

  const publishBody: Record<string, string> = {
    creation_id: containerId,
    access_token: accessToken,
  }
  const pub = await graphPost(`${IG_API}/${igUserId}/media_publish`, publishBody)
  const externalId = pub.id ? String(pub.id) : null
  await updateSocialPost(row.id, {
    status: 'published',
    external_id: externalId,
    error: null,
    published_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
  })
  return { platform: 'instagram', status: 'published', containerId, externalId }
}

// ─── Threads：container → publish ─────────────────────────────────
async function publishThreads(
  row: SocialPostRow,
  env: NonNullable<PublishConfig['threads']>,
  imageUrl: string | null,
): Promise<PublishResult> {
  const { accessToken: thAccessToken, userId: threadsUserId } = env
  if (!thAccessToken) throw new Error('THREADS_ACCESS_TOKEN 未設定')
  if (!threadsUserId) throw new Error('THREADS_USER_ID 未設定')

  const createBody: Record<string, string> = { access_token: thAccessToken }
  if (imageUrl) {
    createBody.image_url = imageUrl
    createBody.media_type = 'IMAGE'
  }
  createBody.text = row.content

  const created = await graphPost(`${THREADS_API}/${threadsUserId}/threads`, createBody)
  const containerId = String(created.id ?? '')
  await updateSocialPost(row.id, { status: 'container_created', container_id: containerId })

  await waitForContainer(threadsUserId, containerId, thAccessToken, 'threads')

  const pub = await graphPost(`${THREADS_API}/${threadsUserId}/threads_publish`, {
    creation_id: containerId,
    access_token: thAccessToken,
  })
  const externalId = pub.id ? String(pub.id) : null
  await updateSocialPost(row.id, {
    status: 'published',
    external_id: externalId,
    error: null,
    published_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
  })
  return { platform: 'threads', status: 'published', containerId, externalId }
}

// ─── Facebook：單步驟直發（photos / feed）────────────────────────
async function publishFacebook(
  row: SocialPostRow,
  env: NonNullable<PublishConfig['facebook']>,
  imageUrl: string | null,
): Promise<PublishResult> {
  const { accessToken, pageId } = env
  if (!accessToken) throw new Error('FB_ACCESS_TOKEN 未設定')
  if (!pageId) throw new Error('FB_PAGE_ID 未設定')

  // 系統使用者 token 不能直接貼文：先 /me/accounts 換出粉專的 page access token。
  const pageToken = await resolveFbPageToken(accessToken, pageId)

  // 有圖 → POST /{pageId}/photos（url＋message）；無圖 → POST /{pageId}/feed（純文字）。
  const endpoint = imageUrl ? `${FB_API}/${pageId}/photos` : `${FB_API}/${pageId}/feed`
  const params = new URLSearchParams({ access_token: pageToken, message: row.content })
  if (imageUrl) params.set('url', imageUrl)

  const pub = await graphPost(`${endpoint}?${params.toString()}`, {})
  const externalId = pub.post_id || pub.id ? String(pub.post_id || pub.id) : null
  await updateSocialPost(row.id, {
    status: 'published',
    external_id: externalId,
    error: null,
    published_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
  })
  return { platform: 'facebook', status: 'published', externalId }
}

/** 用 FB system user token 換出粉專專用的 page access token（自動配對 FB_PAGE_ID）。 */
async function resolveFbPageToken(systemUserToken: string, pageId: string): Promise<string> {
  const res = await fetch(
    `${FB_API}/me/accounts?fields=id,access_token&access_token=${encodeURIComponent(systemUserToken)}`,
  )
  const json = await res.json()
  if (!res.ok) {
    throw new Error(`FB /me/accounts fail: ${json?.error?.message || res.status}`)
  }
  const page = (json?.data || []).find((p: any) => String(p?.id) === String(pageId))
  if (!page?.access_token) {
    throw new Error(`FB 找不到粉專 ${pageId}（system user 未指派此粉專）`)
  }
  return page.access_token
}

// ─── 輔助 ─────────────────────────────────────────────────────────

/** 解析 IG token 對應的 user id（/me），作為 user_id 未設定時的 fallback。 */
export async function resolveIgUserId(accessToken: string): Promise<string> {
  const res = await fetch(`${IG_API}/me?fields=id&access_token=${encodeURIComponent(accessToken)}`, {
    headers: { 'Content-Type': 'application/json' },
  })
  const json = await res.json()
  if (!res.ok || !json?.id) {
    throw new Error(`IG /me fail: ${json?.error?.message || res.status}`)
  }
  return json.id
}

/** 輪詢 container 狀態直到就緒（FINISHED）或失敗。 */
export async function waitForContainer(
  userId: string,
  containerId: string,
  accessToken: string,
  platform: SocialPostPlatform,
  timeoutMs = 60_000,
): Promise<void> {
  const base = platform === 'instagram' ? IG_API : THREADS_API
  // IG 用 status_code / Threads 用 status（Threads 沒有 status_code 欄位）
  const fields = platform === 'instagram' ? 'status_code,error_message' : 'status,error_message'
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    await sleep(3000)
    const res = await fetch(
      `${base}/${containerId}?fields=${fields}&access_token=${encodeURIComponent(accessToken)}`,
    )
    const json = await res.json()
    if (!res.ok) {
      throw new Error(`[${platform}] container status fetch fail: ${json?.error?.message || res.status}`)
    }
    const status = json.status_code || json.status
    if (status === 'FINISHED') return
    if (status === 'ERROR' || status === 'FAILED') {
      throw new Error(`[${platform}] container error: ${json.error_message || status}`)
    }
  }
  throw new Error(`[${platform}] container not ready (timeout)`)
}

/** 簡易 Graph POST（回傳 JSON body）。 */
export async function graphPost(url: string, body: Record<string, string>): Promise<any> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(
      `Graph POST fail: ${json?.error?.message || json?.error?.error_message || res.status} (${json?.error?.code ?? ''})`,
    )
  }
  return json
}