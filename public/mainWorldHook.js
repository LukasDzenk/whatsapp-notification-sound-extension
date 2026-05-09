/**
 * WhatSound — main-world hook.
 *
 * Runs in web.whatsapp.com's JS realm (manifest declares it as a content
 * script with `world: "MAIN"` and `run_at: "document_start"` so it patches
 * the relevant globals before WA's bundle captures references to them).
 *
 * WhatsApp Web no longer caches its notification audio in `caches`; it
 * fetches `https://static.whatsapp.net/rsrc.php/.../<hash>.mp3` straight to
 * the HTTP disk cache. There's nothing to hijack at the Cache Storage layer,
 * so we intercept at the JS layer instead.
 *
 * Strategy: PUSH, not pull.
 *
 *   We track every `<audio>`/`HTMLAudioElement` instance that has ever been
 *   pointed at a notification URL. When the isolated-world content script
 *   posts us new audio bytes, we (a) build a fresh Blob URL and (b) push it
 *   into every tracked element's `src`. Any Audio born later inherits the
 *   then-current Blob URL via the constructor / setter patches. This handles
 *   three otherwise-broken scenarios:
 *
 *     1) Refresh-with-prior-selection: WA may construct its notification
 *        Audio singleton before our publish lands. We retroactively swap
 *        its src once bytes arrive.
 *     2) First-time selection mid-session: new Audio gets the blob URL at
 *        construction.
 *     3) Change-selection mid-session: existing tracked Audio gets its src
 *        rewritten to the new blob URL on the next publish.
 *
 * We do NOT `URL.revokeObjectURL` previous blob URLs on update. WA may still
 * hold an `<audio>` referencing it; revoking would silently break its next
 * play. Cost is one notification clip's bytes per change (~tens of KB), zeroed
 * on reload. Idempotent install via `__WHATSOUND_HOOK_INSTALLED__`.
 */
(() => {
  'use strict'

  if (window.__WHATSOUND_HOOK_INSTALLED__) return
  window.__WHATSOUND_HOOK_INSTALLED__ = true

  // Match either the legacy `notification_<hash>.<ext>` URL pattern (older
  // WA Web builds) or the current `static.whatsapp.net/rsrc.php/<…>.mp3`
  // CDN path. Both are anchored enough that we won't catch unrelated audio
  // (voice messages live on `media.*.fna.whatsapp.net`, stickers/media
  // separately).
  const NOTIFICATION_URL_PATTERN = new RegExp(
    [
      'notification_[^/]+\\.(?:mp3|wav|ogg|m4a)',
      'static\\.whatsapp\\.net/rsrc\\.php/[^?#]+\\.mp3',
    ].join('|'),
    'i'
  )

  /** Current Blob URL serving the user's chosen audio, or null. */
  let replacementUrl = null

  /**
   * HTMLAudioElement instances we've classified as "for the notification
   * sound" — either because they were constructed with a notification URL
   * or had one assigned via the src setter. Strong refs: at most a handful
   * of entries, lifetime bounded by the page.
   */
  const trackedAudios = new Set()

  /**
   * Maps each tracked audio to the *original* notification URL WhatsApp
   * gave us — the URL we'd want to restore on a "reset to default". We use
   * a WeakMap so it doesn't keep audios alive past their natural lifetime.
   */
  const originalUrls = new WeakMap()

  const isNotificationUrl = (u) =>
    typeof u === 'string' && u.length > 0 && NOTIFICATION_URL_PATTERN.test(u)

  // Capture the original `src` accessor up front so all helpers below can
  // use it without re-resolving. If the descriptor is missing or
  // non-configurable we degrade gracefully.
  const srcDesc = Object.getOwnPropertyDescriptor(
    HTMLMediaElement.prototype,
    'src'
  )
  const canPatchSrc =
    !!srcDesc &&
    typeof srcDesc.set === 'function' &&
    typeof srcDesc.get === 'function'

  const readSrc = (el) => {
    try {
      return canPatchSrc ? srcDesc.get.call(el) : el.src
    } catch {
      return ''
    }
  }
  const writeSrcDirect = (el, url) => {
    try {
      if (canPatchSrc) srcDesc.set.call(el, url)
      else el.src = url
    } catch {
      // Defensive: never crash WA's main world over a single failed swap.
    }
  }

  /**
   * Push the current `replacementUrl` into every tracked audio whose src
   * doesn't already match. Setting src triggers an HTMLMediaElement reload
   * (fast for blob URLs since the bytes are local memory).
   */
  const pushToTracked = () => {
    if (!replacementUrl) return
    for (const audio of trackedAudios) {
      if (readSrc(audio) !== replacementUrl) {
        writeSrcDirect(audio, replacementUrl)
      }
    }
  }

  /**
   * Revert every tracked audio to the original WA URL it was first born
   * with (or the URL last assigned via the src setter). Used by the popup
   * "Reset to default" action to give WhatsApp's original sound back
   * without requiring a page reload.
   */
  const revertTracked = () => {
    for (const audio of trackedAudios) {
      const orig = originalUrls.get(audio)
      if (orig && readSrc(audio) !== orig) {
        writeSrcDirect(audio, orig)
      }
    }
  }

  // ------- Inbox: bytes from the isolated-world content script ----------
  window.addEventListener('message', (e) => {
    if (e.source !== window) return
    const data = e.data
    if (!data || typeof data !== 'object' || data.__whatsound !== true) return

    try {
      if (data.kind === 'audio-bytes') {
        if (
          !(data.buffer instanceof ArrayBuffer) ||
          data.buffer.byteLength === 0
        ) {
          return
        }
        const mime =
          typeof data.mime === 'string' && data.mime.length > 0
            ? data.mime
            : 'audio/mpeg'
        const blob = new Blob([data.buffer], { type: mime })
        replacementUrl = URL.createObjectURL(blob)
        pushToTracked()
      } else if (data.kind === 'clear') {
        replacementUrl = null
        // Intentionally do not touch tracked audios — leaving the last
        // good blob URL in place is preferable to silencing them.
      } else if (data.kind === 'reset') {
        // Hard reset: forget our replacement *and* swap each tracked audio
        // back to the URL WhatsApp originally gave it. WA reloads from the
        // HTTP cache / network on the next play and gets its default sound.
        replacementUrl = null
        revertTracked()
      }
    } catch {
      // A malformed payload must never tear down WA.
    }
  })

  // ------- Patch 1: `new Audio(url)` ------------------------------------
  const OrigAudio = window.Audio
  function PatchedAudio(src) {
    // `new Audio()` (no-arg) is valid; pass through unchanged.
    if (arguments.length === 0) return new OrigAudio()
    const audio = new OrigAudio()
    if (isNotificationUrl(src)) {
      trackedAudios.add(audio)
      // Remember the original so we can revert on a reset.
      if (!originalUrls.has(audio)) originalUrls.set(audio, src)
      // Substitute upfront if we already have a replacement; otherwise the
      // pushToTracked call after the first byte-publish will swap it in.
      writeSrcDirect(audio, replacementUrl || src)
    } else {
      writeSrcDirect(audio, src)
    }
    return audio
  }
  // Preserve `instanceof Audio` and prototype-chain expectations so any
  // duck-typing in WA's bundle continues to recognise our shim.
  PatchedAudio.prototype = OrigAudio.prototype
  Object.setPrototypeOf(PatchedAudio, OrigAudio)
  try {
    window.Audio = PatchedAudio
  } catch {
    // Some pages freeze `window.Audio`; ignore — the other patches still help.
  }

  // ------- Patch 2: HTMLMediaElement.prototype `src` setter -------------
  // Covers both `<audio src="…">` parsed from HTML (the parser writes the
  // attribute, which the IDL setter normalises) and JS-driven assignments
  // like `audioEl.src = url` after construction.
  if (canPatchSrc && srcDesc.configurable) {
    try {
      Object.defineProperty(HTMLMediaElement.prototype, 'src', {
        configurable: true,
        enumerable: srcDesc.enumerable,
        get() {
          return srcDesc.get.call(this)
        },
        set(value) {
          if (isNotificationUrl(value)) {
            trackedAudios.add(this)
            if (!originalUrls.has(this)) originalUrls.set(this, value)
            srcDesc.set.call(this, replacementUrl || value)
          } else {
            srcDesc.set.call(this, value)
          }
        },
      })
    } catch {
      // Frozen descriptor — drop this patch, others still apply.
    }
  }

  // ------- Patch 3: `window.fetch` --------------------------------------
  // Catch the rare path where WA pulls bytes itself (e.g. into an
  // AudioBuffer) before constructing an audio element.
  const origFetch = window.fetch
  if (typeof origFetch === 'function') {
    window.fetch = function patchedFetch(input, init) {
      try {
        const url =
          typeof input === 'string'
            ? input
            : input && typeof input === 'object' && typeof input.url === 'string'
            ? input.url
            : null
        if (replacementUrl && isNotificationUrl(url)) {
          return origFetch.call(this, replacementUrl)
        }
      } catch {
        // Fall through on any inspection failure.
      }
      return origFetch.call(this, input, init)
    }
  }
})()
