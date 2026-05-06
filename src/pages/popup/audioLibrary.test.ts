import {
  MAX_UPLOAD_BYTES,
  TABS,
  buildCustomAudio,
  builtInAudios,
  customCardId,
  customIdFromCardId,
  filterBuiltIns,
  generateCustomId,
  isCustomCardId,
  validateUpload,
} from '@pages/popup/audioLibrary'

describe('audioLibrary', () => {
  describe('builtInAudios shape', () => {
    test('every audio has a unique displayName', () => {
      const names = builtInAudios.map((a) => a.displayName)
      expect(new Set(names).size).toBe(names.length)
    })

    test('every audio has a non-empty emoji and category', () => {
      for (const a of builtInAudios) {
        expect(a.emoji.length).toBeGreaterThan(0)
        expect(['alerts', 'chill', 'playful']).toContain(a.category)
      }
    })

    test('at least one audio is flagged as a top pick', () => {
      expect(builtInAudios.some((a) => a.top === true)).toBe(true)
    })
  })

  describe('filterBuiltIns', () => {
    test('top tab returns only items flagged top: true', () => {
      const result = filterBuiltIns(builtInAudios, 'top')
      expect(result.length).toBeGreaterThan(0)
      expect(result.every((a) => a.top === true)).toBe(true)
    })

    test.each(['alerts', 'chill', 'playful'] as const)(
      '%s tab returns only items in that category',
      (cat) => {
        const result = filterBuiltIns(builtInAudios, cat)
        expect(result.length).toBeGreaterThan(0)
        expect(result.every((a) => a.category === cat)).toBe(true)
      }
    )

    test('custom tab returns empty (uploads handled separately)', () => {
      expect(filterBuiltIns(builtInAudios, 'custom')).toEqual([])
    })

    test('every built-in audio is reachable via some category tab', () => {
      const reached = new Set<string>()
      for (const cat of ['alerts', 'chill', 'playful'] as const) {
        for (const a of filterBuiltIns(builtInAudios, cat)) {
          reached.add(a.displayName)
        }
      }
      expect(reached.size).toBe(builtInAudios.length)
    })
  })

  describe('TABS', () => {
    test('contains a top tab and a custom tab', () => {
      const ids = TABS.map((t) => t.id)
      expect(ids).toContain('top')
      expect(ids).toContain('custom')
    })

    test('all tab ids are unique', () => {
      const ids = TABS.map((t) => t.id)
      expect(new Set(ids).size).toBe(ids.length)
    })

    test('every non-top, non-custom tab matches a real category', () => {
      const categories = TABS.map((t) => t.id).filter(
        (id) => id !== 'top' && id !== 'custom'
      )
      for (const cat of categories) {
        expect(filterBuiltIns(builtInAudios, cat).length).toBeGreaterThan(0)
      }
    })
  })

  describe('validateUpload', () => {
    test('rejects non-audio mime types', () => {
      expect(validateUpload({ type: 'image/png', size: 100 })).toMatch(/audio/i)
      expect(validateUpload({ type: '', size: 100 })).not.toBeNull()
      expect(validateUpload({ type: 'application/pdf', size: 100 })).not.toBeNull()
    })

    test('rejects files larger than the cap', () => {
      const result = validateUpload({
        type: 'audio/mpeg',
        size: MAX_UPLOAD_BYTES + 1,
      })
      expect(result).toMatch(/too big/i)
    })

    test('accepts a small mp3', () => {
      expect(validateUpload({ type: 'audio/mpeg', size: 50_000 })).toBeNull()
    })

    test('accepts a wav at exactly the cap', () => {
      expect(
        validateUpload({ type: 'audio/wav', size: MAX_UPLOAD_BYTES })
      ).toBeNull()
    })
  })

  describe('custom card id helpers', () => {
    test('round-trips through customCardId / customIdFromCardId', () => {
      const id = 'abc-123'
      const card = customCardId({ id })
      expect(card).toBe('custom:abc-123')
      expect(isCustomCardId(card)).toBe(true)
      expect(customIdFromCardId(card)).toBe(id)
    })

    test('built-in URLs are not classified as custom card ids', () => {
      expect(isCustomCardId('chrome-extension://x/audio.mp3')).toBe(false)
      expect(isCustomCardId('/assets/mp3/foo.mp3')).toBe(false)
    })
  })

  describe('buildCustomAudio', () => {
    test('strips the file extension from the display name', () => {
      const item = buildCustomAudio(
        { name: 'My ringtone.mp3', type: 'audio/mpeg', size: 1234 },
        'data:audio/mpeg;base64,abc',
        1700000000000,
        'fixed-id'
      )
      expect(item).toEqual({
        id: 'fixed-id',
        displayName: 'My ringtone',
        dataUrl: 'data:audio/mpeg;base64,abc',
        mime: 'audio/mpeg',
        addedAt: 1700000000000,
        sizeBytes: 1234,
      })
    })

    test('falls back to "My sound" when the name is empty after extension strip', () => {
      const item = buildCustomAudio(
        { name: '.mp3', type: 'audio/mpeg', size: 1 },
        'data:',
        0,
        'x'
      )
      expect(item.displayName).toBe('My sound')
    })

    test('clamps very long names to 40 chars', () => {
      const longName = 'a'.repeat(200) + '.mp3'
      const item = buildCustomAudio(
        { name: longName, type: 'audio/mpeg', size: 1 },
        'data:',
        0,
        'x'
      )
      expect(item.displayName.length).toBe(40)
    })

    test('preserves dataUrl, mime, addedAt and sizeBytes verbatim', () => {
      const item = buildCustomAudio(
        { name: 'song.wav', type: 'audio/wav', size: 9999 },
        'data:audio/wav;base64,XYZ',
        555,
        'id'
      )
      expect(item.dataUrl).toBe('data:audio/wav;base64,XYZ')
      expect(item.mime).toBe('audio/wav')
      expect(item.addedAt).toBe(555)
      expect(item.sizeBytes).toBe(9999)
    })
  })

  describe('generateCustomId', () => {
    test('returns a non-empty string', () => {
      const id = generateCustomId()
      expect(typeof id).toBe('string')
      expect(id.length).toBeGreaterThan(0)
    })

    test('returns a unique value across two consecutive calls', () => {
      expect(generateCustomId()).not.toBe(generateCustomId())
    })
  })
})
