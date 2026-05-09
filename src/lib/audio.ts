/**
 * Shared types + helpers for the user's selected notification sound.
 * Imported by both the popup (writer) and the content script (reader).
 */

export type SelectedAudio = {
  /** Stable identifier for the sound card in the popup. */
  cardId: string
  /**
   * The playable source. Either a path relative to the extension origin
   * (built-ins, e.g. `/assets/mp3/foo.chunk.mp3`) or a `data:` URL
   * (custom uploads / Freesound previews).
   */
  src: string
  /** Display name for diagnostics; not relied on by the playback path. */
  name?: string
  /** Wall-clock ms; used to dedupe storage events on rapid reselection. */
  updatedAt: number
}

/**
 * Resolve a `SelectedAudio.src` into a URL the content script can `fetch`.
 *
 * Built-in sound URLs arrive as a path relative to the extension origin
 * (e.g. `/assets/mp3/foo.chunk.mp3`) and need the `chrome-extension://...`
 * prefix. Custom uploads / Freesound clips arrive as a `data:` URL and pass
 * through unchanged.
 */
export const resolveAudioSource = (
  extensionIdentifierUrl: string,
  selectedAudioUrl: string
): string => {
  if (selectedAudioUrl.startsWith('data:')) return selectedAudioUrl
  // Extension URL ends in '/', asset paths start with '/'. Drop one to
  // avoid `//` after `://`.
  return extensionIdentifierUrl.replace(/\/$/, '') + selectedAudioUrl
}
