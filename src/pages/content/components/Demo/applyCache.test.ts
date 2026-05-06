/**
 * @jest-environment node
 */
import {
  FALLBACK_NOTIFICATION_URL,
  NOTIFICATION_ASSET_PATTERN,
  WA_CACHE_PATTERN,
  replaceInWaCaches,
  waitForWaCache,
} from './applyCache'

// ---- Minimal fake CacheStorage / Cache ------------------------------------
//
// The real Cache API isn't exposed by jsdom, so we hand-roll just enough to
// drive the cache-replace flow under test.

class FakeCache {
  private store = new Map<string, Response>()
  putCallCount = 0
  deleteCallCount = 0

  async keys(): Promise<Request[]> {
    return Array.from(this.store.keys()).map((url) => new Request(url))
  }

  async put(url: string, response: Response): Promise<void> {
    this.putCallCount++
    this.store.set(url, response)
  }

  async delete(url: string): Promise<boolean> {
    this.deleteCallCount++
    return this.store.delete(url)
  }

  has(url: string): boolean {
    return this.store.has(url)
  }
}

class FakeCacheStorage {
  caches = new Map<string, FakeCache>()

  setCacheNames(names: string[]): void {
    for (const n of names) {
      if (!this.caches.has(n)) this.caches.set(n, new FakeCache())
    }
  }

  seedAsset(cacheName: string, url: string, body = 'original'): void {
    this.setCacheNames([cacheName])
    const c = this.caches.get(cacheName)!
    c.put(url, new Response(body))
  }

  async keys(): Promise<string[]> {
    return Array.from(this.caches.keys())
  }

  async open(name: string): Promise<FakeCache> {
    if (!this.caches.has(name)) this.caches.set(name, new FakeCache())
    return this.caches.get(name)!
  }
}

const asCacheStorage = (fake: FakeCacheStorage): CacheStorage =>
  fake as unknown as CacheStorage

describe('applyCache regexes', () => {
  describe('WA_CACHE_PATTERN', () => {
    test.each(['wa', 'wa1', 'wa2', 'wa10', 'wa-v1', 'wa.123', 'wa_assets'])(
      'matches WhatsApp cache name %s',
      (n) => {
        expect(WA_CACHE_PATTERN.test(n)).toBe(true)
      }
    )

    test.each(['walk', 'water', 'something-wa', 'awa', '', 'WA something'])(
      'does not match unrelated cache name %s',
      (n) => {
        // 'WA something' has a space after WA which is not in [\d._-] — should fail
        expect(WA_CACHE_PATTERN.test(n)).toBe(false)
      }
    )
  })

  describe('NOTIFICATION_ASSET_PATTERN', () => {
    test.each([
      'https://web.whatsapp.com/notification_abc.mp3',
      '/notification_xyz123.wav',
      'notification_v2.ogg',
      '/notification_anything.m4a',
    ])('matches notification asset URL %s', (u) => {
      expect(NOTIFICATION_ASSET_PATTERN.test(u)).toBe(true)
    })

    test('does not match unrelated assets', () => {
      expect(
        NOTIFICATION_ASSET_PATTERN.test('https://web.whatsapp.com/main.js')
      ).toBe(false)
      expect(NOTIFICATION_ASSET_PATTERN.test('audio_other.mp3')).toBe(false)
      expect(NOTIFICATION_ASSET_PATTERN.test('notification_.txt')).toBe(false)
    })
  })
})

describe('waitForWaCache', () => {
  test('returns true immediately when a wa cache already exists', async () => {
    const fake = new FakeCacheStorage()
    fake.setCacheNames(['wa1.123', 'unrelated'])
    const ok = await waitForWaCache(asCacheStorage(fake), 100, 20)
    expect(ok).toBe(true)
  })

  test('returns false when nothing matches before timeout', async () => {
    const fake = new FakeCacheStorage()
    fake.setCacheNames(['unrelated'])
    const ok = await waitForWaCache(asCacheStorage(fake), 80, 20)
    expect(ok).toBe(false)
  })

  test('returns true once a wa cache appears mid-poll', async () => {
    const fake = new FakeCacheStorage()
    setTimeout(() => fake.setCacheNames(['wa1']), 40)
    const ok = await waitForWaCache(asCacheStorage(fake), 200, 20)
    expect(ok).toBe(true)
  })
})

describe('replaceInWaCaches', () => {
  test('returns no-wa-cache when no wa-style caches exist', async () => {
    const fake = new FakeCacheStorage()
    fake.setCacheNames(['unrelated', 'other-cache'])
    const r = await replaceInWaCaches(
      new Blob(['NEW']),
      asCacheStorage(fake)
    )
    expect(r).toEqual({ success: false, replaced: 0, reason: 'no-wa-cache' })
  })

  test('replaces every matching notification asset across every wa cache', async () => {
    const fake = new FakeCacheStorage()
    fake.seedAsset('wa1', 'https://web.whatsapp.com/notification_a.mp3')
    fake.seedAsset('wa1', 'https://web.whatsapp.com/notification_b.mp3')
    fake.seedAsset('wa-v2', 'https://web.whatsapp.com/notification_c.mp3')
    fake.seedAsset('wa1', 'https://web.whatsapp.com/main.js') // ignored

    const r = await replaceInWaCaches(
      new Blob(['NEW']),
      asCacheStorage(fake)
    )
    expect(r.success).toBe(true)
    expect(r.replaced).toBe(3)
    expect(r.reason).toBe('ok')
    // The unrelated asset is untouched
    expect(fake.caches.get('wa1')!.has('https://web.whatsapp.com/main.js')).toBe(
      true
    )
  })

  test('seeds the fallback URL on the first wa cache when no asset is present', async () => {
    const fake = new FakeCacheStorage()
    fake.setCacheNames(['wa1', 'wa-v2'])
    const r = await replaceInWaCaches(
      new Blob(['NEW']),
      asCacheStorage(fake)
    )
    expect(r.success).toBe(true)
    expect(r.replaced).toBe(1)
    expect(fake.caches.get('wa1')!.has(FALLBACK_NOTIFICATION_URL)).toBe(true)
    expect(fake.caches.get('wa-v2')!.has(FALLBACK_NOTIFICATION_URL)).toBe(false)
  })

  test('does not throw if a single cache.put fails — keeps replacing the rest', async () => {
    const fake = new FakeCacheStorage()
    fake.seedAsset('wa1', 'https://web.whatsapp.com/notification_a.mp3')
    fake.seedAsset('wa-v2', 'https://web.whatsapp.com/notification_b.mp3')

    // Force the first cache's put to throw on the second call (the replace).
    const wa1 = fake.caches.get('wa1')!
    const originalPut = wa1.put.bind(wa1)
    let calls = 0
    wa1.put = async (...args: [string, Response]) => {
      calls++
      if (calls === 1) throw new Error('synthetic put failure')
      return originalPut(...args)
    }

    const r = await replaceInWaCaches(
      new Blob(['NEW']),
      asCacheStorage(fake)
    )

    // wa-v2 should still get replaced.
    expect(r.replaced).toBeGreaterThanOrEqual(1)
    expect(r.success).toBe(true)
  })
})
