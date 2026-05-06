/**
 * Cache-hijack core. Intentionally framework-free so it can be unit-tested
 * by injecting a fake CacheStorage.
 *
 * Why this exists:
 *   WhatsApp Web is a PWA — its notification audio asset is served from
 *   Cache Storage by its service worker. We replace the cached body with
 *   the user's chosen audio, so when WA's UI fetches the notification
 *   sound, the SW serves our bytes from cache.
 *
 *   The flow has to tolerate:
 *     - cold starts (cache may not exist for the first ~5s after page load)
 *     - SW updates that rebuild caches under new names
 *     - multiple WA caches existing at once
 *     - multiple notification_*.mp3 entries in any single cache
 *     - WhatsApp not having seeded the asset yet (nothing in cache to find)
 */

import { resolveAudioSource } from './audioSource'

export const WA_CACHE_PATTERN = /^wa([\d._-]|$)/i
export const NOTIFICATION_ASSET_PATTERN = /notification_.+\.(mp3|wav|ogg|m4a)/i

export const FALLBACK_NOTIFICATION_URL =
  'https://web.whatsapp.com/notification_2a485d84012c106acef03b527bb54635.mp3'

export type SelectedAudio = {
  cardId: string
  src: string
  name?: string
  updatedAt: number
}

export type ApplyReason =
  | 'ok'
  | 'no-selection'
  | 'no-wa-cache'
  | 'no-asset'
  | 'fetch-failed'

export type ApplyResult = {
  success: boolean
  replaced: number
  reason: ApplyReason
}

/**
 * Wait until at least one WA-prefixed cache exists. Tolerates the
 * cache API briefly throwing during page init (rare in modern Chrome
 * but we've seen it under heavy load).
 */
export const waitForWaCache = async (
  cachesApi: CacheStorage = caches,
  timeoutMs = 15000,
  intervalMs = 500
): Promise<boolean> => {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const names = await cachesApi.keys()
      if (names.some((n) => WA_CACHE_PATTERN.test(n))) return true
    } catch {
      // swallow and retry
    }
    if (Date.now() - start + intervalMs >= timeoutMs) break
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  return false
}

/**
 * Replace the notification audio in every WA cache that contains one.
 * If no asset is found, seed the well-known fallback URL on the first
 * matching cache so the SW finds something on its next lookup.
 */
export const replaceInWaCaches = async (
  blob: Blob,
  cachesApi: CacheStorage = caches
): Promise<ApplyResult> => {
  const cacheNames = await cachesApi.keys()
  const waCaches = cacheNames.filter((n) => WA_CACHE_PATTERN.test(n))
  if (waCaches.length === 0) {
    return { success: false, replaced: 0, reason: 'no-wa-cache' }
  }

  let replaced = 0
  let assetFound = false

  for (const name of waCaches) {
    try {
      const cache = await cachesApi.open(name)
      const reqs = await cache.keys()
      const targets = reqs.filter((r) =>
        NOTIFICATION_ASSET_PATTERN.test(r.url)
      )
      if (targets.length === 0) continue
      assetFound = true
      for (const req of targets) {
        try {
          await cache.delete(req.url)
          await cache.put(req.url, new Response(blob))
          replaced++
        } catch (err) {
          console.warn('[WhatSound] cache.put failed', req.url, err)
        }
      }
    } catch (err) {
      console.warn('[WhatSound] cache access failed', name, err)
    }
  }

  if (!assetFound) {
    try {
      const seedCache = await cachesApi.open(waCaches[0])
      await seedCache.delete(FALLBACK_NOTIFICATION_URL)
      await seedCache.put(FALLBACK_NOTIFICATION_URL, new Response(blob))
      replaced++
    } catch (err) {
      console.warn('[WhatSound] fallback seed failed', err)
    }
  }

  return {
    success: replaced > 0,
    replaced,
    reason: replaced > 0 ? 'ok' : 'no-asset',
  }
}

/**
 * Resolve the user's selection to a Blob ready to be put into the cache.
 * Built-in sounds are fetched from the extension origin; data: URLs
 * (custom uploads / Freesound clips) are read inline.
 */
export const fetchSelectedAudioBlob = async (
  selected: SelectedAudio,
  extensionUrlWithSlash: string
): Promise<Blob | null> => {
  try {
    const url = resolveAudioSource(extensionUrlWithSlash, selected.src)
    const res = await fetch(url)
    if (!res.ok) return null
    return await res.blob()
  } catch {
    return null
  }
}
