/**
 * Thin wrapper around the Freesound v2 REST API.
 *
 * Auth is via a token query string (free signup at
 * https://freesound.org/apiv2/apply). The token below is the project's
 * own key for the "Whatsound" app — replace it if you fork this extension
 * and use it in production.
 *
 * Only the bits we need for in-popup browse are implemented: text search
 * scoped to short clips (~0.3–6s) and a helper that downloads a preview
 * MP3 into a base64 data URL so the existing custom-audio flow can
 * persist + apply it.
 */

const API_BASE = 'https://freesound.org/apiv2'
const API_KEY = '4AFsVfnV0UGeCSV201C1UvS9b8HuM337iItgo4dq'

export const FREESOUND_HOMEPAGE = 'https://freesound.org/'

export type FreesoundResult = {
  id: number
  name: string
  durationSec: number
  previewUrl: string
  license: string
  username: string
}

type FreesoundApiResult = {
  id: number
  name: string
  duration: number
  license: string
  username: string
  previews: {
    'preview-hq-mp3'?: string
    'preview-lq-mp3'?: string
  }
}

export const searchFreesound = async (
  query: string,
  signal?: AbortSignal
): Promise<FreesoundResult[]> => {
  const cleaned = query.trim()
  if (!cleaned) return []

  const params = new URLSearchParams({
    query: cleaned,
    token: API_KEY,
    page_size: '20',
    fields: 'id,name,duration,previews,license,username',
    // Notification sounds are short by definition.
    filter: 'duration:[0.3 TO 6]',
    sort: 'rating_desc',
  })

  const res = await fetch(`${API_BASE}/search/text/?${params.toString()}`, {
    signal,
  })

  if (!res.ok) {
    throw new Error(`Freesound search failed (${res.status})`)
  }

  const data = (await res.json()) as { results?: FreesoundApiResult[] }
  return (data.results ?? [])
    .map((r): FreesoundResult | null => {
      const previewUrl =
        r.previews?.['preview-hq-mp3'] ?? r.previews?.['preview-lq-mp3'] ?? ''
      if (!previewUrl) return null
      return {
        id: r.id,
        name: r.name,
        durationSec: r.duration,
        previewUrl,
        license: r.license,
        username: r.username,
      }
    })
    .filter((r): r is FreesoundResult => r !== null)
}

export const downloadFreesoundPreview = async (
  url: string,
  signal?: AbortSignal
): Promise<{ dataUrl: string; mime: string; sizeBytes: number }> => {
  const res = await fetch(url, { signal })
  if (!res.ok) {
    throw new Error(`Could not download preview (${res.status})`)
  }
  const blob = await res.blob()
  const dataUrl = await blobToDataUrl(blob)
  return {
    dataUrl,
    mime: blob.type || 'audio/mpeg',
    sizeBytes: blob.size,
  }
}

const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })

export const formatDuration = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds < 0) return ''
  if (seconds < 1) return `${(seconds * 1000).toFixed(0)} ms`
  if (seconds < 10) return `${seconds.toFixed(1)} s`
  return `${seconds.toFixed(0)} s`
}
