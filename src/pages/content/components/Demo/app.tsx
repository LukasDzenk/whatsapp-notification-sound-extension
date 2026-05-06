import { resolveAudioSource } from './audioSource'

export default function App() {
  let extensionIdentifierUrl: string

  const updateCachedAudio = async (selectedAudioUrl: string) => {
    // Get the cache name which has the notification audio asset
    const cacheNames = await caches.keys()
    // Find the cache that contains the asset
    // This is done because cache name is always changing
    const cacheName = cacheNames.find((name) => {
      const regex = /wa\d{1}\./
      return regex.test(name)
    })

    // Open the cache that contains the audio asset
    const cache = await caches.open(cacheName)

    // Get the notification audio asset URL
    const cacheAssets = await caches.open(cacheName)
    const assets = await cacheAssets.keys()
    // Find the asset that we want to update
    const asset = assets.find((asset) => {
      const regex = /notification_.+\.mp3/
      return regex.test(asset.url)
    })
    // Sometimes Whatsapp fails to cache an audio asset in the first place
    // thus leaving the asset.url undefined. In that case, fallback to
    // hardcoded URL
    const assetUrl =
      asset?.url ||
      'https://web.whatsapp.com/notification_2a485d84012c106acef03b527bb54635.mp3'

    const sourceUrl = resolveAudioSource(
      extensionIdentifierUrl,
      selectedAudioUrl
    )

    const extensionAudioResponse = await fetch(sourceUrl)

    const body = extensionAudioResponse.body

    // Create a new mock response with the updated audio
    // to replace the old one in the cache
    const newResponse = new Response(body)

    // Update cache with the new audio
    await cache.delete(assetUrl)

    if (selectedAudioUrl) {
      await cache.put(assetUrl, newResponse)
    }
  }

  // Listen to messages from the popup.tsx
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('message received. message type: ', request.type)
    if (request.type === 'updateCachedAudio') {
      extensionIdentifierUrl = request.extensionIdentifierUrl
      updateCachedAudio(request.selectedAudioUrl)
      sendResponse({ type: 'updateCachedAudioDone' })
    } else if (request.type === 'checkIfWhatsAppWeb') {
      const isWhatsAppWeb = window.location.href.includes('web.whatsapp.com')
      sendResponse({ isWhatsAppWeb: isWhatsAppWeb })
    }

    return true // Needed to ensure that the connection is not closed prematurely
  })

  return <></> // must return something, otherwise it will throw an error
}
