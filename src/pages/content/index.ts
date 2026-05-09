/**
 * Content script (isolated world). Runs on web.whatsapp.com at document_start.
 *
 * Responsibilities:
 *   - Read the user's selected sound from `chrome.storage.local`.
 *   - Fetch its bytes (works for both `chrome-extension://` web-accessible
 *     URLs and `data:` URLs).
 *   - Forward those bytes to the main-world hook (public/mainWorldHook.js)
 *     via `window.postMessage`. The hook turns them into a Blob URL valid in
 *     WhatsApp's JS realm and substitutes it for any notification-audio load.
 *
 * No DOM, no React. Kept as a single small file so the bundler emits one
 * 1–2 KB script that can run at document_start without waiting on chunk
 * fetches or framework boot.
 */

import { debugLog, debugWarn } from '@src/lib/log'
import { SelectedAudio, resolveAudioSource } from '@src/lib/audio'

const extensionUrl = chrome.runtime.getURL('')

// Cache the most recently published bytes keyed by `selected.src` so we
// don't refetch on every re-publish. Cleared whenever the selection changes.
let cachedSrc: string | null = null
let cachedBuffer: ArrayBuffer | null = null
let cachedMime: string | null = null

const readSelectedAudio = (): Promise<SelectedAudio | null> =>
  new Promise((resolve) => {
    try {
      chrome.storage.local.get(['selectedAudio'], (result) => {
        if (chrome.runtime.lastError) {
          debugWarn('storage.get error', chrome.runtime.lastError.message)
          resolve(null)
          return
        }
        const stored = (result as { selectedAudio?: SelectedAudio })
          .selectedAudio
        resolve(stored ?? null)
      })
    } catch (err) {
      debugWarn('storage.get threw', err)
      resolve(null)
    }
  })

const fetchSelectedBytes = async (
  selected: SelectedAudio
): Promise<{ buffer: ArrayBuffer; mime: string } | null> => {
  try {
    const url = resolveAudioSource(extensionUrl, selected.src)
    const res = await fetch(url)
    if (!res.ok) {
      debugWarn(`fetch ${url} → ${res.status}`)
      return null
    }
    const buffer = await res.arrayBuffer()
    if (buffer.byteLength === 0) {
      debugWarn(`fetch ${url} returned 0 bytes`)
      return null
    }
    const mime = res.headers.get('content-type') || 'audio/mpeg'
    return { buffer, mime }
  } catch (err) {
    debugWarn('fetchSelectedBytes failed', err)
    return null
  }
}

type OutboundMessage =
  | { kind: 'audio-bytes'; buffer: ArrayBuffer; mime: string }
  | { kind: 'clear' }
  | { kind: 'reset' }

const postToMainWorld = (msg: OutboundMessage): void => {
  // We're in the isolated world; posting to `window` reaches the main-world
  // hook installed by `public/mainWorldHook.js`. Origin is restricted to the
  // page itself so messages can't leak into / be spoofed by other frames.
  try {
    window.postMessage({ __whatsound: true, ...msg }, window.location.origin)
  } catch (err) {
    debugWarn('postMessage failed', err)
  }
}

let publishInFlight: Promise<void> | null = null

/**
 * Read storage, fetch bytes, push them to the main world. Coalesces
 * concurrent calls so a flurry of rapid reselects only causes one fetch.
 */
const publishSelectedAudio = (): Promise<void> => {
  if (publishInFlight) return publishInFlight
  publishInFlight = (async () => {
    try {
      const selected = await readSelectedAudio()
      if (!selected) {
        postToMainWorld({ kind: 'clear' })
        cachedSrc = null
        cachedBuffer = null
        cachedMime = null
        debugLog('no selection — sent clear')
        return
      }

      if (cachedSrc === selected.src && cachedBuffer && cachedMime) {
        postToMainWorld({
          kind: 'audio-bytes',
          buffer: cachedBuffer,
          mime: cachedMime,
        })
        debugLog('republished cached bytes for', selected.cardId)
        return
      }

      const bytes = await fetchSelectedBytes(selected)
      if (!bytes) {
        debugWarn('publishSelectedAudio: no bytes to publish')
        return
      }
      cachedSrc = selected.src
      cachedBuffer = bytes.buffer
      cachedMime = bytes.mime
      postToMainWorld({
        kind: 'audio-bytes',
        buffer: bytes.buffer,
        mime: bytes.mime,
      })
      debugLog(
        `published ${bytes.buffer.byteLength} bytes (${bytes.mime}) for`,
        selected.cardId
      )
    } finally {
      publishInFlight = null
    }
  })()
  return publishInFlight
}

const invalidateCache = (): void => {
  cachedSrc = null
  cachedBuffer = null
  cachedMime = null
}

/**
 * Best-effort sweep of stale Cache Storage entries written by older
 * versions of this extension (which seeded a fake `notification_*.mp3`
 * into `wa_*` caches before we moved to JS-layer interception). Modern WA
 * doesn't use those entries, but they're cosmetic noise we should clean
 * up when the user resets.
 */
const purgeLegacyCacheHijacks = async (): Promise<number> => {
  if (typeof caches === 'undefined') return 0
  let removed = 0
  try {
    const names = await caches.keys()
    for (const name of names) {
      if (!/^wa/i.test(name)) continue
      try {
        const cache = await caches.open(name)
        const reqs = await cache.keys()
        for (const req of reqs) {
          if (/notification_[^/]+\.(mp3|wav|ogg|m4a)/i.test(req.url)) {
            if (await cache.delete(req.url)) removed++
          }
        }
      } catch (err) {
        debugWarn('purge: cache access failed', name, err)
      }
    }
  } catch (err) {
    debugWarn('purge: caches.keys() failed', err)
  }
  return removed
}

/**
 * Hard reset: drop the user's selection from storage, clean up legacy
 * cache pollution, and tell the main-world hook to revert each tracked
 * audio element to its original WhatsApp URL.
 */
const resetToDefault = async (): Promise<void> => {
  invalidateCache()
  try {
    await new Promise<void>((resolve) => {
      chrome.storage.local.remove(['selectedAudio'], () => resolve())
    })
  } catch (err) {
    debugWarn('storage.remove failed', err)
  }
  const removed = await purgeLegacyCacheHijacks()
  if (removed > 0) debugLog(`purged ${removed} legacy notification entries`)
  postToMainWorld({ kind: 'reset' })
  debugLog('reset: posted reset to main world')
}

// --- wire-up -------------------------------------------------------------

debugLog('content script loaded at', document.readyState)

// Initial publish. `publishSelectedAudio` is async; the first postMessage
// fires after a microtask + a fetch, by which point the main-world hook's
// `message` listener is installed (it also runs at document_start).
publishSelectedAudio()

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.selectedAudio) return
  invalidateCache()
  publishSelectedAudio()
})

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request?.type === 'checkIfWhatsAppWeb') {
    sendResponse({
      isWhatsAppWeb: window.location.href.includes('web.whatsapp.com'),
    })
    return true
  }
  if (
    request?.type === 'applySelectedAudio' ||
    // legacy alias retained so older popups still work
    request?.type === 'updateCachedAudio'
  ) {
    publishSelectedAudio().then(() =>
      sendResponse({ success: true, reason: 'ok' })
    )
    return true
  }
  if (request?.type === 'resetAudio') {
    resetToDefault().then(() => sendResponse({ success: true }))
    return true
  }
  return false
})
