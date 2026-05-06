/**
 * Resolve where to fetch the replacement notification audio from.
 *
 * Built-in sounds arrive as a path relative to the extension origin (e.g.
 * `/assets/mp3/foo.chunk.mp3`) and have to be prefixed with the extension's
 * `chrome-extension://...` URL. Custom uploads arrive as a `data:` URL and
 * are returned unchanged so `fetch()` reads the embedded bytes.
 */
export const resolveAudioSource = (
  extensionIdentifierUrl: string,
  selectedAudioUrl: string
): string => {
  if (selectedAudioUrl.startsWith('data:')) {
    return selectedAudioUrl
  }
  // The extension URL ends in '/', and the asset path begins with '/', so we
  // drop the trailing slash before concatenating.
  return extensionIdentifierUrl.replace(/\/$/, '') + selectedAudioUrl
}
