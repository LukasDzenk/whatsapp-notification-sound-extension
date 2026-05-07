/**
 * Render the WhatSound Chrome extension icon at 128 / 48 / 16 px.
 *
 * Hand-crafted SVG (kept tiny for a clear, predictable result at 16px) is
 * rasterised with @resvg/resvg-js, then the 128px output is downscaled by
 * sharp to produce the smaller toolbar variants.
 *
 * Run: pnpm gen:icon
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { Resvg } from '@resvg/resvg-js'
import sharp from 'sharp'

import { loadInterFonts } from './fonts.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
// `src/assets/img` feeds the bundled popup logo import; `public/icons` is
// copied verbatim into the dist root and is what the manifest references.
const OUT_DIRS = [resolve(ROOT, 'src/assets/img'), resolve(ROOT, 'public/icons')]

const PINK = '#ffd4e5'
const INK = '#1a1a1a'
const GREEN = '#7fae71'

const SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
  <!-- Pink rounded tile -->
  <rect x="3" y="3" width="122" height="122" rx="24" ry="24"
        fill="${PINK}" stroke="${INK}" stroke-width="3" />

  <!-- Centred ink disc -->
  <circle cx="64" cy="64" r="40" fill="${INK}" />
  <circle cx="64" cy="64" r="34" fill="none" stroke="#2a2a2a" stroke-width="1" />

  <!-- Green W with a soft offset shadow -->
  <g font-family="Inter, sans-serif" font-weight="900" font-size="56"
     text-anchor="middle" dominant-baseline="central">
    <text x="66" y="68" fill="#0a0a0a">W</text>
    <text x="64" y="66" fill="${GREEN}">W</text>
  </g>

  <!-- Three radiating sound arcs in the upper-right -->
  <g fill="none" stroke="${INK}" stroke-width="2.5" stroke-linecap="round">
    <path d="M 91 39 a 7 7 0 0 1 10 0" />
    <path d="M 86 33 a 13 13 0 0 1 20 0" />
    <path d="M 81 27 a 19 19 0 0 1 30 0" />
  </g>
  <circle cx="96" cy="40" r="2" fill="${INK}" />
</svg>
`

async function main() {
  for (const dir of OUT_DIRS) await mkdir(dir, { recursive: true })
  const fonts = await loadInterFonts()

  const resvg = new Resvg(SVG, {
    fitTo: { mode: 'width', value: 128 },
    font: {
      fontBuffers: fonts.map((f) => f.data),
      defaultFontFamily: 'Inter',
      loadSystemFonts: false,
    },
  })

  const png128 = resvg.render().asPng()
  for (const dir of OUT_DIRS) {
    const path128 = resolve(dir, 'icon-128.png')
    await writeFile(path128, png128)
    console.log(`wrote ${path128.replace(ROOT + '/', '')}  (128x128)`)
  }

  for (const size of [48, 16]) {
    const buf = await sharp(png128)
      .resize(size, size, { kernel: 'lanczos3' })
      .png({ compressionLevel: 9 })
      .toBuffer()
    for (const dir of OUT_DIRS) {
      const path = resolve(dir, `icon-${size}.png`)
      await writeFile(path, buf)
      console.log(`wrote ${path.replace(ROOT + '/', '')}  (${size}x${size})`)
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
