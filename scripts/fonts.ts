/**
 * Download + cache Inter font weights used by the asset generators.
 * Downloads happen once and are stored under scripts/.fonts/ (gitignored).
 */
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const CACHE_DIR = resolve(HERE, '.fonts')

// rsms/inter v3.19 ships per-weight OTF/WOFF — no TTF. Both Satori and
// @resvg/resvg-js handle OTF, so we use that format.
const INTER_BASE =
  'https://github.com/rsms/inter/raw/v3.19/docs/font-files'

const SOURCES = {
  Regular: `${INTER_BASE}/Inter-Regular.otf`,
  Bold: `${INTER_BASE}/Inter-Bold.otf`,
  Black: `${INTER_BASE}/Inter-Black.otf`,
} as const

export type Weight = keyof typeof SOURCES

async function ensureFile(weight: Weight): Promise<Buffer> {
  await mkdir(CACHE_DIR, { recursive: true })
  const file = resolve(CACHE_DIR, `Inter-${weight}.otf`)
  if (existsSync(file)) return readFile(file)

  console.log(`fetching Inter-${weight}.otf …`)
  const res = await fetch(SOURCES[weight])
  if (!res.ok) {
    throw new Error(`Failed to download Inter-${weight}: ${res.status}`)
  }
  const buf = Buffer.from(await res.arrayBuffer())
  await writeFile(file, buf)
  return buf
}

export type LoadedFont = {
  name: string
  data: Buffer
  weight: number
  style: 'normal'
}

export async function loadInterFonts(): Promise<LoadedFont[]> {
  const [regular, bold, black] = await Promise.all([
    ensureFile('Regular'),
    ensureFile('Bold'),
    ensureFile('Black'),
  ])
  return [
    { name: 'Inter', data: regular, weight: 400, style: 'normal' },
    { name: 'Inter', data: bold, weight: 700, style: 'normal' },
    { name: 'Inter', data: black, weight: 900, style: 'normal' },
  ]
}
