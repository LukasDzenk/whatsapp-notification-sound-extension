// Images
import logo from '@assets/img/whatsound_logo.png'

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
  builtInAudios,
  customCardId,
  filterBuiltIns,
  validateUpload,
} from '@pages/popup/audioLibrary'

const extensionIdentifierUrl = chrome.runtime.getURL('')

const Popup = () => {
  const [openTabId, setOpenTabId] = useState(0)
  const [isWhatsAppWeb, setIsWhatsAppWeb] = useState(false)
  const [selectedAudioId, setSelectedAudioId] = useState('')
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<LibraryTab>('top')
  const [customAudios, setCustomAudios] = useState<CustomAudio[]>([])
  const [uploadError, setUploadError] = useState<string | null>(null)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const savedAudio = localStorage.getItem('selectedAudioUrl')
    if (savedAudio) setSelectedAudioId(savedAudio)

    chrome.storage?.local.get(['customAudios'], (result) => {
      if (Array.isArray(result.customAudios)) {
        setCustomAudios(result.customAudios as CustomAudio[])
      }
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

  const persistCustomAudios = (next: CustomAudio[]) => {
    setCustomAudios(next)
    chrome.storage?.local.set({ customAudios: next })
  }

  const sendApply = (audioPayload: string) => {
    sendMessageToContentScript(openTabId, {
      type: 'updateCachedAudio',
      extensionIdentifierUrl: extensionIdentifierUrl,
      selectedAudioUrl: audioPayload,
    })
  }

  const handleSelectBuiltIn = (audio: BuiltInAudio) => {
    setSelectedAudioId(audio.fileUrl)
    sendApply(audio.fileUrl)
    localStorage.setItem('selectedAudioUrl', audio.fileUrl)
  }

  const handleSelectCustom = (custom: CustomAudio) => {
    const cardId = customCardId(custom)
    setSelectedAudioId(cardId)
    sendApply(custom.dataUrl)
    localStorage.setItem('selectedAudioUrl', cardId)
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
    e.target.value = '' // allow re-selecting the same file
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
      localStorage.removeItem('selectedAudioUrl')
    }
  }

  const visibleBuiltIns = filterBuiltIns(builtInAudios, activeTab)

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

  const cardClass = (isSelected: boolean, isPlaying: boolean) =>
    ['sound-card', isSelected && 'is-selected', isPlaying && 'is-playing']
      .filter(Boolean)
      .join(' ')

  const renderBuiltInCard = (audio: BuiltInAudio) => {
    const isSelected = selectedAudioId === audio.fileUrl
    const isPlaying = playingId === audio.fileUrl
    return (
      <li key={audio.fileUrl} className={cardClass(isSelected, isPlaying)}>
        <div className="sound-card__main">
          <span className="sound-card__emoji" aria-hidden="true">
            {audio.emoji}
          </span>
          <span className="sound-card__name">{audio.displayName}</span>
          {isPlaying ? (
            <span className="sound-card__bars" aria-hidden="true">
              <i></i>
              <i></i>
              <i></i>
              <i></i>
            </span>
          ) : isSelected ? (
            <span className="sound-card__badge">PICKED</span>
          ) : null}
        </div>
        <div className="sound-card__actions">
          <button
            type="button"
            className="btn btn--play"
            onClick={() => handlePlay(audio.fileUrl, audio.fileUrl)}
            aria-label={`Preview ${audio.displayName}`}
            title="Preview"
          >
            ▶
          </button>
          <button
            type="button"
            className={`btn btn--select ${isSelected ? 'is-active' : ''}`}
            onClick={() => handleSelectBuiltIn(audio)}
            disabled={isSelected}
          >
            {isSelected ? '✓ Picked' : 'Pick'}
          </button>
        </div>
      </li>
    )
  }

  const renderCustomCard = (custom: CustomAudio) => {
    const cardId = customCardId(custom)
    const isSelected = selectedAudioId === cardId
    const isPlaying = playingId === cardId
    return (
      <li key={custom.id} className={cardClass(isSelected, isPlaying)}>
        <div className="sound-card__main">
          <span className="sound-card__emoji" aria-hidden="true">
            🎵
          </span>
          <span className="sound-card__name" title={custom.displayName}>
            {custom.displayName}
          </span>
          {isPlaying ? (
            <span className="sound-card__bars" aria-hidden="true">
              <i></i>
              <i></i>
              <i></i>
              <i></i>
            </span>
          ) : isSelected ? (
            <span className="sound-card__badge">PICKED</span>
          ) : null}
        </div>
        <div className="sound-card__actions">
          <button
            type="button"
            className="btn btn--play"
            onClick={() => handlePlay(cardId, custom.dataUrl)}
            aria-label={`Preview ${custom.displayName}`}
            title="Preview"
          >
            ▶
          </button>
          <button
            type="button"
            className={`btn btn--select ${isSelected ? 'is-active' : ''}`}
            onClick={() => handleSelectCustom(custom)}
            disabled={isSelected}
          >
            {isSelected ? '✓ Picked' : 'Pick'}
          </button>
          <button
            type="button"
            className="btn btn--icon"
            onClick={() => handleDeleteCustom(custom.id)}
            aria-label={`Delete ${custom.displayName}`}
            title="Delete"
          >
            ×
          </button>
        </div>
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
      <div className="upload-card__main">
        <span className="upload-card__icon" aria-hidden="true">
          ⬆
        </span>
        <div>
          <strong>Upload your own</strong>
          <p>MP3 or WAV · max 1 MB</p>
        </div>
      </div>
      <button
        type="button"
        className="btn btn--accent"
        onClick={() => fileInputRef.current?.click()}
      >
        Choose file
      </button>
    </li>
  )

  const renderList = () => {
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
            <li className="empty-msg">No custom sounds yet. Upload one above ↑</li>
          ) : (
            customAudios.map(renderCustomCard)
          )}
        </ul>
      )
    }
    return <ul className="sound-list">{visibleBuiltIns.map(renderBuiltInCard)}</ul>
  }

  const renderInstructions = () => (
    <div className="not-on-whatsapp">
      <div className="not-on-whatsapp__emoji" aria-hidden="true">
        📱
      </div>
      <h2>Open WhatsApp Web first</h2>
      <p>
        Head to <code>web.whatsapp.com</code> (or refresh it if you&apos;re
        already there), then reopen this popup.
      </p>
    </div>
  )

  const renderIntro = () => (
    <div className="intro">
      <ol className="steps">
        <li>
          <span className="steps__num">1</span>
          <span className="steps__label">Pick a sound</span>
        </li>
        <li>
          <span className="steps__num">2</span>
          <span className="steps__label">Refresh WhatsApp</span>
        </li>
        <li>
          <span className="steps__num">3</span>
          <span className="steps__label">Enjoy 🎉</span>
        </li>
      </ol>
      <p className="reset-tip">
        Tip: clear your browser cache to reset the default sound.
      </p>
    </div>
  )

  return (
    <div className="App">
      <header className="App__header">
        <img src={logo} className="App__logo" alt="WhatSound logo" />
      </header>

      {isWhatsAppWeb ? (
        <>
          {renderIntro()}
          {renderTabs()}
          {renderList()}
        </>
      ) : (
        renderInstructions()
      )}

      <footer className="App__footer">
        <a
          className="footer-link"
          href="mailto:dzenk.lukas@gmail.com"
          target="_top"
        >
          ✉ get in touch
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
