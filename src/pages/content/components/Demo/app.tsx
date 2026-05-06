import { useEffect } from 'react'
import {
  ApplyResult,
  SelectedAudio,
  fetchSelectedAudioBlob,
  replaceInWaCaches,
  waitForWaCache,
} from './applyCache'

const extensionUrl = chrome.runtime.getURL('')

// In-memory cache of the most recently fetched audio bytes, keyed by the
// `selectedAudio.src` they came from. Lets repeated applies (e.g. on SW
// reactivation) skip refetching.
let cachedSrc: string | null = null
let cachedBlob: Blob | null = null

const readSelectedAudio = (): Promise<SelectedAudio | null> =>
  new Promise((resolve) => {
    chrome.storage.local.get(['selectedAudio'], (result) => {
      const stored = (result as { selectedAudio?: SelectedAudio }).selectedAudio
      resolve(stored ?? null)
    })
  })

const applySelectedAudio = async (): Promise<ApplyResult> => {
  const selected = await readSelectedAudio()
  if (!selected) return { success: false, replaced: 0, reason: 'no-selection' }

  const ready = await waitForWaCache()
  if (!ready) return { success: false, replaced: 0, reason: 'no-wa-cache' }

  let blob = cachedBlob
  if (!blob || cachedSrc !== selected.src) {
    blob = await fetchSelectedAudioBlob(selected, extensionUrl)
    if (!blob) return { success: false, replaced: 0, reason: 'fetch-failed' }
    cachedBlob = blob
    cachedSrc = selected.src
  }

  return replaceInWaCaches(blob)
}

const invalidateCachedBlob = () => {
  cachedSrc = null
  cachedBlob = null
}

export default function App() {
  useEffect(() => {
    let cancelled = false

    // Initial application — re-applies whatever the user picked previously
    // without needing them to re-open the popup.
    applySelectedAudio().then((result) => {
      if (cancelled) return
      if (result.success) {
        console.log(
          `[WhatSound] applied selection (${result.replaced} cache entries)`
        )
      } else if (result.reason !== 'no-selection') {
        console.log('[WhatSound] initial apply skipped:', result.reason)
      }
    })

    const onStorageChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string
    ) => {
      if (areaName !== 'local' || !changes.selectedAudio) return
      invalidateCachedBlob()
      applySelectedAudio()
    }
    chrome.storage.onChanged.addListener(onStorageChange)

    // WhatsApp ships SW updates that rebuild caches under fresh names —
    // re-apply once the new SW takes control.
    const onControllerChange = () => {
      window.setTimeout(() => applySelectedAudio(), 1500)
    }
    if (
      typeof navigator !== 'undefined' &&
      navigator.serviceWorker
    ) {
      navigator.serviceWorker.addEventListener(
        'controllerchange',
        onControllerChange
      )
    }

    const onMessage = (
      request: { type?: string },
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response: unknown) => void
    ) => {
      if (request?.type === 'checkIfWhatsAppWeb') {
        sendResponse({
          isWhatsAppWeb: window.location.href.includes('web.whatsapp.com'),
        })
        return true
      }

      if (
        request?.type === 'applySelectedAudio' ||
        // legacy alias retained so older builds still work
        request?.type === 'updateCachedAudio'
      ) {
        applySelectedAudio().then((result) => sendResponse(result))
        return true
      }

      return false
    }
    chrome.runtime.onMessage.addListener(onMessage)

    return () => {
      cancelled = true
      chrome.storage.onChanged.removeListener(onStorageChange)
      chrome.runtime.onMessage.removeListener(onMessage)
      if (
        typeof navigator !== 'undefined' &&
        navigator.serviceWorker
      ) {
        navigator.serviceWorker.removeEventListener(
          'controllerchange',
          onControllerChange
        )
      }
    }
  }, [])

  return <></>
}
