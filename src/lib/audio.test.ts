import { resolveAudioSource } from './audio'

describe('resolveAudioSource', () => {
  const EXT = 'chrome-extension://abcdef/'

  test('built-in audio paths are concatenated to the extension origin', () => {
    expect(resolveAudioSource(EXT, '/assets/mp3/foo.chunk.mp3')).toBe(
      'chrome-extension://abcdef/assets/mp3/foo.chunk.mp3'
    )
  })

  test('does not produce a double slash between origin and path', () => {
    const result = resolveAudioSource(EXT, '/assets/mp3/foo.mp3')
    expect(result.split('://')[1]).not.toMatch(/\/\//)
  })

  test('handles an extension URL without a trailing slash', () => {
    expect(
      resolveAudioSource('chrome-extension://abcdef', '/assets/mp3/foo.mp3')
    ).toBe('chrome-extension://abcdef/assets/mp3/foo.mp3')
  })

  test('returns data: URLs verbatim — never prefixed with the extension origin', () => {
    const dataUrl = 'data:audio/mpeg;base64,SUQzAwAA'
    expect(resolveAudioSource(EXT, dataUrl)).toBe(dataUrl)
  })

  test('long base64 data: URLs are returned unchanged', () => {
    const dataUrl = 'data:audio/wav;base64,' + 'A'.repeat(5000)
    expect(resolveAudioSource(EXT, dataUrl)).toBe(dataUrl)
  })
})
