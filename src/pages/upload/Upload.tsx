/**
 * Custom-sound upload page.
 *
 * Lives in its own extension page so the OS file dialog doesn't blur the
 * browser-action popup and trigger Chrome's auto-close (a Windows/Linux
 * footgun where the popup's DOM is destroyed mid-pick and the input's
 * `change` listener never fires). This page opens via `chrome.windows.create`
 * from the popup; from here, picking a file and dropping a file both work
 * because the page lives in a regular browser window that keeps focus.
 */
import { ChangeEvent, DragEvent, useEffect, useRef, useState } from 'react'
import {
  CustomAudio,
  buildCustomAudio,
  validateUpload,
} from '@pages/popup/audioLibrary'

type Status =
  | { kind: 'idle' }
  | { kind: 'reading'; name: string }
  | { kind: 'saving'; name: string }
  | { kind: 'done'; name: string }
  | { kind: 'error'; message: string }

const readAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('read failed'))
    reader.readAsDataURL(file)
  })

const loadCustomAudios = (): Promise<CustomAudio[]> =>
  new Promise((resolve) => {
    chrome.storage.local.get(['customAudios'], (result) => {
      const list = Array.isArray(result.customAudios)
        ? (result.customAudios as CustomAudio[])
        : []
      resolve(list)
    })
  })

const saveCustomAudios = (next: CustomAudio[]): Promise<void> =>
  new Promise((resolve) => {
    chrome.storage.local.set({ customAudios: next }, () => resolve())
  })

const Upload = () => {
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // Auto-close shortly after a successful upload — the popup picks up the
  // new entry on next open via its storage listener.
  useEffect(() => {
    if (status.kind !== 'done') return
    const t = window.setTimeout(() => window.close(), 1200)
    return () => window.clearTimeout(t)
  }, [status])

  const ingestFile = async (file: File) => {
    const validationError = validateUpload(file)
    if (validationError) {
      setStatus({ kind: 'error', message: validationError })
      return
    }

    setStatus({ kind: 'reading', name: file.name })
    let dataUrl: string
    try {
      dataUrl = await readAsDataUrl(file)
    } catch {
      setStatus({ kind: 'error', message: 'Could not read that file.' })
      return
    }
    if (!dataUrl) {
      setStatus({ kind: 'error', message: 'File appears to be empty.' })
      return
    }

    setStatus({ kind: 'saving', name: file.name })
    try {
      const item = buildCustomAudio(file, dataUrl)
      const existing = await loadCustomAudios()
      // Prepend so the newest sound shows up first in the popup's Mine tab.
      await saveCustomAudios([item, ...existing])
      setStatus({ kind: 'done', name: item.displayName })
    } catch (err) {
      const message =
        err instanceof Error && err.message
          ? err.message
          : 'Could not save the sound. Try again.'
      setStatus({ kind: 'error', message })
    }
  }

  const handleFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) ingestFile(file)
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer?.files?.[0]
    if (file) ingestFile(file)
  }

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(true)
  }

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(false)
  }

  const isBusy = status.kind === 'reading' || status.kind === 'saving'

  return (
    <div className="upload-page">
      <header className="upload-page__header">
        <h1 className="upload-page__title">Add a sound</h1>
        <p className="upload-page__subtitle">
          MP3 or WAV · max 1 MB
        </p>
      </header>

      <div
        className={[
          'dropzone',
          dragOver ? 'is-over' : '',
          isBusy ? 'is-busy' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        role="button"
        tabIndex={0}
        onClick={() => !isBusy && fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            if (!isBusy) fileInputRef.current?.click()
          }
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          onChange={handleFileInput}
          hidden
          aria-label="Choose audio file"
        />
        <div className="dropzone__icon" aria-hidden="true">
          🎵
        </div>
        <div className="dropzone__primary">
          <strong>Drop an audio file here</strong>
          <span>or click to browse</span>
        </div>
      </div>

      {status.kind === 'reading' && (
        <p className="status status--info">Reading {status.name}…</p>
      )}
      {status.kind === 'saving' && (
        <p className="status status--info">Saving {status.name}…</p>
      )}
      {status.kind === 'done' && (
        <p className="status status--ok" role="status">
          Added “{status.name}”. Closing…
        </p>
      )}
      {status.kind === 'error' && (
        <p className="status status--error" role="alert">
          {status.message}
        </p>
      )}

      <footer className="upload-page__footer">
        <button
          type="button"
          className="ghost-button"
          onClick={() => window.close()}
        >
          Close
        </button>
      </footer>
    </div>
  )
}

export default Upload
