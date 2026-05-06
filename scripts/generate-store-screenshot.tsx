/**
 * Render the 1280x800 Chrome Web Store listing screenshot.
 *
 * Layout is defined declaratively in JSX, rendered to SVG by Satori, then
 * rasterised to PNG by @resvg/resvg-js. Matches the popup's neo-brutalist
 * brand language: bold ink borders, hard offset shadows, pink/green/yellow
 * palette pulled from the popup itself.
 *
 * Run: pnpm gen:screenshot
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import React from 'react'

import { Resvg } from '@resvg/resvg-js'
import satori from 'satori'

import { loadInterFonts } from './fonts.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const OUT_PATH = resolve(ROOT, 'marketing/store-screenshot-1280x800.png')

const W = 1280
const H = 800

// Brand palette (pulled from src/pages/popup/Popup.scss). Cream is the
// dominant surface; pink stays as a localised accent on the popup mockup.
const CREAM = '#fff8ee'
const PINK = '#ffd4e5'
const PINK_SOFT = '#ffe6f0'
const INK = '#1a1a1a'
const GREEN = '#7fae71'
const YELLOW = '#fff6ce'
const PURPLE = '#907fcd'
const WHITE = '#ffffff'

// Reusable building blocks
const card = (
  bg: string,
  shadow = 4,
  borderWidth = 2
): React.CSSProperties => ({
  background: bg,
  border: `${borderWidth}px solid ${INK}`,
  borderRadius: 14,
  boxShadow: `${shadow}px ${shadow}px 0 ${INK}`,
})

const Eyebrow = ({ children }: { children: React.ReactNode }) => (
  <div
    style={{
      display: 'flex',
      alignSelf: 'flex-start',
      background: INK,
      color: YELLOW,
      fontSize: 14,
      fontWeight: 900,
      letterSpacing: 2,
      padding: '6px 14px',
      borderRadius: 6,
    }}
  >
    {children}
  </div>
)

const Pill = ({
  glyph,
  label,
}: {
  glyph: string
  label: string
}) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      ...card(WHITE, 3),
      borderRadius: 999,
      padding: '12px 22px',
      fontSize: 18,
      fontWeight: 700,
    }}
  >
    <span style={{ color: GREEN, fontWeight: 900, fontSize: 22 }}>{glyph}</span>
    <span>{label}</span>
  </div>
)

const StepChip = ({ n, label }: { n: number; label: string }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      flex: 1,
      ...card(WHITE, 2),
      borderRadius: 10,
      padding: '8px 10px',
    }}
  >
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 26,
        height: 26,
        borderRadius: 999,
        background: GREEN,
        color: WHITE,
        border: `2px solid ${INK}`,
        fontWeight: 900,
        fontSize: 14,
      }}
    >
      {n}
    </div>
    <div style={{ fontSize: 14, fontWeight: 700, color: INK }}>{label}</div>
  </div>
)

const Tab = ({ label, active }: { label: string; active?: boolean }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      padding: '5px 12px',
      borderRadius: 999,
      background: active ? INK : WHITE,
      color: active ? YELLOW : INK,
      border: `2px solid ${INK}`,
      fontSize: 12,
      fontWeight: 900,
      letterSpacing: 1,
      boxShadow: active ? 'none' : `2px 2px 0 ${INK}`,
    }}
  >
    {label}
  </div>
)

const SoundCard = ({
  swatch,
  name,
  state,
}: {
  swatch: string
  name: string
  state: 'default' | 'selected'
}) => {
  const bg = state === 'selected' ? GREEN : WHITE
  const fg = state === 'selected' ? WHITE : INK
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '10px 14px',
        gap: 12,
        ...card(bg, 4),
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 32,
          height: 32,
          borderRadius: 8,
          background: swatch,
          border: `2px solid ${INK}`,
          color: INK,
          fontSize: 18,
          fontWeight: 900,
        }}
      >
        ♪
      </div>
      <div
        style={{
          flex: 1,
          fontSize: 18,
          fontWeight: 700,
          color: fg,
        }}
      >
        {name}
      </div>
      {/* Play chip */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 38,
          height: 30,
          borderRadius: 6,
          background: YELLOW,
          border: `2px solid ${INK}`,
          color: INK,
          fontSize: 14,
        }}
      >
        ▶
      </div>
      {/* Pick / Picked chip */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '6px 12px',
          minWidth: 78,
          height: 30,
          borderRadius: 6,
          background: state === 'selected' ? INK : PURPLE,
          color: state === 'selected' ? GREEN : WHITE,
          border: `2px solid ${INK}`,
          fontSize: 12,
          fontWeight: 900,
          letterSpacing: 1,
        }}
      >
        {state === 'selected' ? '✓ PICKED' : 'PICK'}
      </div>
    </div>
  )
}

const PopupMockup = () => (
  <div
    style={{
      display: 'flex',
      flexDirection: 'column',
      width: 440,
      padding: 20,
      background: CREAM,
      border: `3px solid ${INK}`,
      borderRadius: 22,
      boxShadow: `10px 10px 0 ${INK}`,
    }}
  >
    {/* Window dots */}
    <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
      {['#ff7a7a', YELLOW, GREEN].map((c) => (
        <div
          key={c}
          style={{
            width: 12,
            height: 12,
            borderRadius: 999,
            background: c,
            border: `1.5px solid ${INK}`,
          }}
        />
      ))}
    </div>

    {/* Logo tile */}
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        marginBottom: 16,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 88,
          height: 88,
          borderRadius: 14,
          background: PINK_SOFT,
          border: `3px solid ${INK}`,
          color: GREEN,
          fontSize: 64,
          fontWeight: 900,
          fontFamily: 'Inter',
          boxShadow: `4px 4px 0 ${INK}`,
        }}
      >
        W
      </div>
      <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 3 }}>
        WHATSOUND
      </div>
    </div>

    {/* Step chips */}
    <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
      <StepChip n={1} label="Pick" />
      <StepChip n={2} label="Refresh" />
      <StepChip n={3} label="Enjoy" />
    </div>

    {/* Tabs */}
    <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
      <Tab label="⭐ TOP" active />
      <Tab label="ALERTS" />
      <Tab label="CHILL" />
      <Tab label="FUN" />
      <Tab label="MINE" />
    </div>

    {/* Sound cards */}
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <SoundCard swatch={GREEN} name="Chill guitar" state="selected" />
      <SoundCard swatch={PINK_SOFT} name="Pop" state="default" />
      <SoundCard swatch={YELLOW} name="Soft chime" state="default" />
    </div>
  </div>
)

const Marketing = () => (
  <div
    style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 24,
      maxWidth: 640,
    }}
  >
    <Eyebrow>WHATSOUND · CHROME EXTENSION</Eyebrow>

    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'Inter',
        fontWeight: 900,
        fontSize: 86,
        lineHeight: 1.02,
        letterSpacing: -2,
        color: INK,
      }}
    >
      <span>Pick a sound.</span>
      <span>Refresh.</span>
      <span
        style={{
          color: GREEN,
          textDecoration: 'underline',
          textDecorationThickness: 8,
        }}
      >
        Vibe.
      </span>
    </div>

    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        fontSize: 22,
        lineHeight: 1.45,
        color: '#2a2a2a',
        maxWidth: 560,
      }}
    >
      <span>Free Chrome extension that swaps WhatsApp Web's notification</span>
      <span>sound for one of nine hand-picked alerts — or upload your own.</span>
      <span>No tracking. No accounts.</span>
    </div>

    <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
      <Pill glyph="✓" label="Free forever" />
      <Pill glyph="★" label="Open source" />
      <Pill glyph="↑" label="Upload your own" />
    </div>
  </div>
)

const Screenshot = () => (
  <div
    style={{
      display: 'flex',
      width: W,
      height: H,
      background: CREAM,
      fontFamily: 'Inter',
      color: INK,
      padding: '90px 80px',
      gap: 60,
      alignItems: 'center',
    }}
  >
    <div style={{ display: 'flex', flex: 1 }}>
      <Marketing />
    </div>
    <div style={{ display: 'flex', marginRight: 20 }}>
      <PopupMockup />
    </div>
  </div>
)

async function main() {
  await mkdir(dirname(OUT_PATH), { recursive: true })
  const fonts = await loadInterFonts()

  const svg = await satori(<Screenshot />, {
    width: W,
    height: H,
    fonts,
  })

  const png = new Resvg(svg, {
    fitTo: { mode: 'width', value: W },
    font: {
      fontBuffers: fonts.map((f) => f.data),
      defaultFontFamily: 'Inter',
      loadSystemFonts: false,
    },
  })
    .render()
    .asPng()

  await writeFile(OUT_PATH, png)
  console.log(`wrote ${OUT_PATH.replace(ROOT + '/', '')}  (${W}x${H})`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
