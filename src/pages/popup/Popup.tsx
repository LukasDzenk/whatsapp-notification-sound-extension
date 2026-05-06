// Images
import logo from '@assets/img/icon-128.png'

// CSS
import '@pages/popup/Popup.scss'

// Other
import { ChangeEvent, useEffect, useRef, useState } from 'react'
import {
  BuiltInAudio,
  CustomAudio,
  LibraryTab,
  TABS,
  buildCustomAudio,
  buildFreesoundAudio,
  builtInAudios,
  customCardId,
  filterBuiltIns,
  validateUpload,
} from '@pages/popup/audioLibrary'
import {
  FREESOUND_HOMEPAGE,
  FreesoundResult,
  downloadFreesoundPreview,
  formatDuration,
  searchFreesound,
} from '@pages/popup/freesound'

type SelectedAudio = {
  cardId: string
  src: string
  name?: string
  updatedAt: number
}

type CardConfig = {
  cardId: string
  emoji: string
  name: string
  meta?: string
  audioSrc: string
  onSelect: () => void
  onDelete?: () => void
}

const SEARCH_DEBOUNCE_MS = 400

const Popup = () => {
  const [openTabId, setOpenTabId] = useState(0)
  const [isWhatsAppWeb, setIsWhatsAppWeb] = useState(false)
  const [selectedAudioId, setSelectedAudioId] = useState('')
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<LibraryTab>('top')
  const [customAudios, setCustomAudios] = useState<CustomAudio[]>([])
  const [uploadError, setUploadError] = useState<string | null>(null)

  // Browse tab state
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<FreesoundResult[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [addingFreesoundId, setAddingFreesoundId] = useState<number | null>(null)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    chrome.storage?.local.get(['selectedAudio', 'customAudios'], (result) => {
      const customs = Array.isArray(result.customAudios)
        ? (result.customAudios as CustomAudio[])
        : []
      if (customs.length) setCustomAudios(customs)

      const stored = result.selectedAudio as SelectedAudio | undefined
      if (stored?.cardId) {
        setSelectedAudioId(stored.cardId)
        return
      }

      // One-time migration from the legacy `localStorage.selectedAudioUrl`
      // key to chrome.storage.local so the content script can read the
      // selection on its own.
      const legacy = localStorage.getItem('selectedAudioUrl')
      if (!legacy) return
      setSelectedAudioId(legacy)

      let migrated: SelectedAudio | null = null
      if (legacy.startsWith('custom:')) {
        const id = legacy.slice('custom:'.length)
        const item = customs.find((c) => c.id === id)
        if (item) {
          migrated = {
            cardId: legacy,
            src: item.dataUrl,
            name: item.displayName,
            updatedAt: Date.now(),
          }
        }
      } else if (legacy) {
        migrated = { cardId: legacy, src: legacy, updatedAt: Date.now() }
      }
      if (migrated) chrome.storage?.local.set({ selectedAudio: migrated })
      localStorage.removeItem('selectedAudioUrl')
    })

    const checkIsWhatsAppWeb = async () => {
      const openTabs = await new Promise<chrome.tabs.Tab[]>((resolve) => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) =>
          resolve(tabs)
        )
      })
      const tabId = openTabs[0]?.id ?? 0
      setOpenTabId(tabId)

      try {
        const response = await sendMessageToContentScript(tabId, {
          type: 'checkIfWhatsAppWeb',
        })
        setIsWhatsAppWeb(Boolean(response?.isWhatsAppWeb))
      } catch {
        setIsWhatsAppWeb(false)
      }
    }
    checkIsWhatsAppWeb()
  }, [])

  // Debounced Freesound search whenever the Browse tab's query changes.
  useEffect(() => {
    if (activeTab !== 'browse') return

    const trimmed = searchQuery.trim()
    if (!trimmed) {
      setSearchResults([])
      setSearchError(null)
      setSearchLoading(false)
      return
    }

    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        setSearchLoading(true)
        setSearchError(null)
        const results = await searchFreesound(trimmed, controller.signal)
        setSearchResults(results)
      } catch (err) {
        if ((err as { name?: string }).name === 'AbortError') return
        setSearchError(
          (err as Error).message || 'Search failed. Try again in a moment.'
        )
        setSearchResults([])
      } finally {
        setSearchLoading(false)
      }
    }, SEARCH_DEBOUNCE_MS)

    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [searchQuery, activeTab])

  const persistCustomAudios = (next: CustomAudio[]) => {
    setCustomAudios(next)
    chrome.storage?.local.set({ customAudios: next })
  }

  const persistSelection = (selected: SelectedAudio) => {
    chrome.storage?.local.set({ selectedAudio: selected })
    // Trigger an immediate apply on the content script. The content script
    // also re-applies on storage change + on SW updates, so this message
    // is just for low-latency feedback when the popup is the trigger.
    sendMessageToContentScript(openTabId, { type: 'applySelectedAudio' })
  }

  const handleSelectBuiltIn = (audio: BuiltInAudio) => {
    setSelectedAudioId(audio.fileUrl)
    persistSelection({
      cardId: audio.fileUrl,
      src: audio.fileUrl,
      name: audio.displayName,
      updatedAt: Date.now(),
    })
  }

  const handleSelectCustom = (custom: CustomAudio) => {
    const cardId = customCardId(custom)
    setSelectedAudioId(cardId)
    persistSelection({
      cardId,
      src: custom.dataUrl,
      name: custom.displayName,
      updatedAt: Date.now(),
    })
  }

  const handlePlay = (id: string, source: string) => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
    const audio = new Audio(source)
    audioRef.current = audio
    setPlayingId(id)
    audio.addEventListener('ended', () => {
      setPlayingId((current) => (current === id ? null : current))
    })
    audio.play().catch(() => setPlayingId(null))
  }

  const handleUpload = (e: ChangeEvent<HTMLInputElement>) => {
    setUploadError(null)
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    const error = validateUpload(file)
    if (error) {
      setUploadError(error)
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = String(reader.result || '')
      const item = buildCustomAudio(file, dataUrl)
      persistCustomAudios([item, ...customAudios])
    }
    reader.onerror = () => setUploadError('Could not read that file.')
    reader.readAsDataURL(file)
  }

  const handleDeleteCustom = (id: string) => {
    persistCustomAudios(customAudios.filter((c) => c.id !== id))
    if (selectedAudioId === customCardId({ id })) {
      setSelectedAudioId('')
      chrome.storage?.local.remove(['selectedAudio'])
    }
  }

  const handleAddFreesound = async (result: FreesoundResult) => {
    setAddingFreesoundId(result.id)
    setSearchError(null)
    try {
      const { dataUrl, mime, sizeBytes } = await downloadFreesoundPreview(
        result.previewUrl
      )
      const item = buildFreesoundAudio({
        freesoundId: result.id,
        name: result.name,
        dataUrl,
        mime,
        sizeBytes,
      })
      const next = [item, ...customAudios]
      persistCustomAudios(next)
      // Auto-select the freshly added clip so a single click is enough.
      const cardId = customCardId(item)
      setSelectedAudioId(cardId)
      persistSelection({
        cardId,
        src: item.dataUrl,
        name: item.displayName,
        updatedAt: Date.now(),
      })
    } catch (err) {
      setSearchError(
        (err as Error).message || 'Could not add that sound. Try again.'
      )
    } finally {
      setAddingFreesoundId(null)
    }
  }

  const visibleBuiltIns = filterBuiltIns(builtInAudios, activeTab)

  const isFreesoundAdded = (id: number) =>
    customAudios.some((c) => c.source === `freesound:${id}`)

  const renderTabs = () => (
    <nav className="tabs" aria-label="Sound categories">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`tab ${activeTab === tab.id ? 'is-active' : ''}`}
          onClick={() => setActiveTab(tab.id)}
        >
          <span className="tab__emoji" aria-hidden="true">
            {tab.emoji}
          </span>
          <span className="tab__label">{tab.label}</span>
        </button>
      ))}
    </nav>
  )

  const renderCard = ({
    cardId,
    emoji,
    name,
    meta,
    audioSrc,
    onSelect,
    onDelete,
  }: CardConfig) => {
    const isSelected = selectedAudioId === cardId
    const isPlaying = playingId === cardId
    return (
      <li
        key={cardId}
        className={['sound-card', isSelected ? 'is-selected' : '']
          .filter(Boolean)
          .join(' ')}
      >
        <button
          type="button"
          className="sound-card__select"
          onClick={onSelect}
          aria-pressed={isSelected}
        >
          <span className="sound-card__emoji" aria-hidden="true">
            {emoji}
          </span>
          <span className="sound-card__text">
            <span className="sound-card__name">{name}</span>
            {meta && <span className="sound-card__meta">{meta}</span>}
          </span>
          {isSelected && (
            <span className="sound-card__check" aria-hidden="true">
              ✓
            </span>
          )}
        </button>
        <button
          type="button"
          className={`sound-card__play ${isPlaying ? 'is-playing' : ''}`}
          onClick={() => handlePlay(cardId, audioSrc)}
          aria-label={`Preview ${name}`}
          title="Preview"
        >
          {isPlaying ? (
            <span className="sound-card__bars" aria-hidden="true">
              <i></i>
              <i></i>
              <i></i>
              <i></i>
            </span>
          ) : (
            <span aria-hidden="true">▶</span>
          )}
        </button>
        {onDelete && (
          <button
            type="button"
            className="sound-card__delete"
            onClick={onDelete}
            aria-label={`Delete ${name}`}
            title="Delete"
          >
            ×
          </button>
        )}
      </li>
    )
  }

  const renderUploadCard = () => (
    <li className="upload-card">
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        onChange={handleUpload}
        hidden
        aria-label="Upload audio file"
      />
      <button
        type="button"
        className="upload-card__button"
        onClick={() => fileInputRef.current?.click()}
      >
        <span className="upload-card__icon" aria-hidden="true">
          +
        </span>
        <span className="upload-card__label">
          <strong>Add your own sound</strong>
          <span className="upload-card__hint">MP3 or WAV · max 1 MB</span>
        </span>
      </button>
    </li>
  )

  const renderBrowsePanel = () => {
    const trimmed = searchQuery.trim()

    return (
      <div className="browse-panel">
        <div className="search">
          <span className="search__icon" aria-hidden="true">
            🔎
          </span>
          <input
            type="search"
            className="search__input"
            placeholder="Search Freesound (e.g. ding, chime, alert)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search the Freesound library"
            autoFocus
          />
          {searchQuery && (
            <button
              type="button"
              className="search__clear"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
              title="Clear"
            >
              ×
            </button>
          )}
        </div>

        {!trimmed && (
          <div className="browse-suggestions">
            <span className="browse-suggestions__label">Try:</span>
            {['ding', 'chime', 'alert', 'pop', 'soft'].map((s) => (
              <button
                key={s}
                type="button"
                className="suggestion-chip"
                onClick={() => setSearchQuery(s)}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {searchLoading && (
          <div className="browse-status">
            <span
              className="browse-status__spinner"
              aria-hidden="true"
            ></span>
            Searching…
          </div>
        )}

        {searchError && !searchLoading && (
          <div className="browse-status browse-status--error" role="alert">
            {searchError}
          </div>
        )}

        {!searchLoading && !searchError && trimmed && searchResults.length === 0 && (
          <div className="browse-status">No matches. Try another word.</div>
        )}

        {searchResults.length > 0 && (
          <ul className="sound-list">
            {searchResults.map((r) => {
              const cardId = `fs:${r.id}`
              const isPlaying = playingId === cardId
              const isAdded = isFreesoundAdded(r.id)
              const isAdding = addingFreesoundId === r.id
              return (
                <li key={r.id} className="sound-card">
                  <button
                    type="button"
                    className="sound-card__select"
                    onClick={() => !isAdded && handleAddFreesound(r)}
                    disabled={isAdded || isAdding}
                    aria-label={
                      isAdded ? `Already added: ${r.name}` : `Add ${r.name}`
                    }
                  >
                    <span className="sound-card__emoji" aria-hidden="true">
                      🌐
                    </span>
                    <span className="sound-card__text">
                      <span className="sound-card__name">{r.name}</span>
                      <span className="sound-card__meta">
                        {formatDuration(r.durationSec)} · @{r.username}
                      </span>
                    </span>
                    {isAdding ? (
                      <span
                        className="sound-card__check sound-card__check--spin"
                        aria-hidden="true"
                      >
                        ⌛
                      </span>
                    ) : isAdded ? (
                      <span className="sound-card__check" aria-hidden="true">
                        ✓
                      </span>
                    ) : (
                      <span
                        className="sound-card__check sound-card__check--add"
                        aria-hidden="true"
                      >
                        +
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    className={`sound-card__play ${isPlaying ? 'is-playing' : ''}`}
                    onClick={() => handlePlay(cardId, r.previewUrl)}
                    aria-label={`Preview ${r.name}`}
                    title="Preview"
                  >
                    {isPlaying ? (
                      <span className="sound-card__bars" aria-hidden="true">
                        <i></i>
                        <i></i>
                        <i></i>
                        <i></i>
                      </span>
                    ) : (
                      <span aria-hidden="true">▶</span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        <p className="browse-attribution">
          Powered by{' '}
          <a href={FREESOUND_HOMEPAGE} target="_blank" rel="noreferrer">
            Freesound
          </a>
          . Sounds are CC-licensed by their creators.
        </p>
      </div>
    )
  }

  const renderList = () => {
    if (activeTab === 'browse') return renderBrowsePanel()

    if (activeTab === 'custom') {
      return (
        <ul className="sound-list">
          {renderUploadCard()}
          {uploadError && (
            <li className="upload-error" role="alert">
              {uploadError}
            </li>
          )}
          {customAudios.length === 0 && !uploadError ? (
            <li className="empty-msg">No custom sounds yet.</li>
          ) : (
            customAudios.map((c) =>
              renderCard({
                cardId: customCardId(c),
                emoji: c.source?.startsWith('freesound:') ? '🌐' : '🎵',
                name: c.displayName,
                audioSrc: c.dataUrl,
                onSelect: () => handleSelectCustom(c),
                onDelete: () => handleDeleteCustom(c.id),
              })
            )
          )}
        </ul>
      )
    }
    return (
      <ul className="sound-list">
        {visibleBuiltIns.map((audio) =>
          renderCard({
            cardId: audio.fileUrl,
            emoji: audio.emoji,
            name: audio.displayName,
            audioSrc: audio.fileUrl,
            onSelect: () => handleSelectBuiltIn(audio),
          })
        )}
      </ul>
    )
  }

  const renderInstructions = () => (
    <div className="not-on-whatsapp">
      <div className="not-on-whatsapp__emoji" aria-hidden="true">
        📱
      </div>
      <h2>Open WhatsApp Web first</h2>
      <p>
        Head to <code>web.whatsapp.com</code> and reopen this popup to choose
        a notification sound.
      </p>
    </div>
  )

  return (
    <div className="App">
      <header className="App__header">
        <img
          src={logo}
          className="App__mark"
          alt=""
          width={40}
          height={40}
        />
        <div className="App__title">
          <h1 className="App__name">WhatSound</h1>
          <p className="App__tagline">
            Change your WhatsApp Web notification sound
          </p>
        </div>
      </header>

      {isWhatsAppWeb ? (
        <main className="App__main">
          {renderTabs()}
          {renderList()}
          {selectedAudioId && (
            <div className="refresh-hint" role="note">
              <span className="refresh-hint__icon" aria-hidden="true">
                ↻
              </span>
              <span>Refresh WhatsApp Web to apply your new sound</span>
            </div>
          )}
        </main>
      ) : (
        renderInstructions()
      )}

      <footer className="App__footer">
        <a className="footer-link" href="mailto:dzenk.lukas@gmail.com">
          feedback
        </a>
      </footer>
    </div>
  )
}

const sendMessageToContentScript = async (
  openTab: number,
  messageObject: object
): Promise<{ [key: string]: string }> => {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(openTab, messageObject, resolve)
  })
}

export default Popup
