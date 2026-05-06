import guitarAlertUrl from '@assets/audio/mixkit-guitar-notification-alert-2320.wav'
import popAlertAudioUrl from '@assets/audio/mixkit-message-pop-alert-2354.mp3'
import positiveAlertUrl from '@assets/audio/mixkit-positive-notification-951.wav'
import startAlertUrl from '@assets/audio/mixkit-software-interface-start-2574.wav'
import clop_1 from '@assets/audio/1.mp3'
import bloop_2 from '@assets/audio/2.mp3'
import ding_ding_3 from '@assets/audio/3.mp3'
import some_notification_4 from '@assets/audio/4.mp3'
import harp_5 from '@assets/audio/5.mp3'

export type SoundCategory = 'alerts' | 'chill' | 'playful'
export type LibraryTab = 'top' | SoundCategory | 'custom'

export type BuiltInAudio = {
  displayName: string
  emoji: string
  fileUrl: string
  category: SoundCategory
  top?: boolean
}

export type CustomAudio = {
  id: string
  displayName: string
  dataUrl: string
  mime: string
  addedAt: number
  sizeBytes: number
}

export const builtInAudios: BuiltInAudio[] = [
  {
    displayName: 'Pop',
    emoji: '🫧',
    fileUrl: popAlertAudioUrl,
    category: 'alerts',
    top: true,
  },
  {
    displayName: 'Chill guitar',
    emoji: '🎸',
    fileUrl: guitarAlertUrl,
    category: 'chill',
    top: true,
  },
  {
    displayName: 'Soft chime',
    emoji: '📨',
    fileUrl: some_notification_4,
    category: 'chill',
    top: true,
  },
  { displayName: 'Bloop', emoji: '💧', fileUrl: bloop_2, category: 'alerts' },
  {
    displayName: 'Ding ding',
    emoji: '🛎️',
    fileUrl: ding_ding_3,
    category: 'alerts',
  },
  { displayName: 'Harp', emoji: '🪄', fileUrl: harp_5, category: 'chill' },
  {
    displayName: 'Positive',
    emoji: '✨',
    fileUrl: positiveAlertUrl,
    category: 'playful',
  },
  {
    displayName: 'Start',
    emoji: '🚀',
    fileUrl: startAlertUrl,
    category: 'playful',
  },
  { displayName: 'Clop', emoji: '🐴', fileUrl: clop_1, category: 'playful' },
]

export const TABS: { id: LibraryTab; label: string; emoji: string }[] = [
  { id: 'top', label: 'Top', emoji: '⭐' },
  { id: 'alerts', label: 'Alerts', emoji: '🫧' },
  { id: 'chill', label: 'Chill', emoji: '🎵' },
  { id: 'playful', label: 'Fun', emoji: '🎉' },
  { id: 'custom', label: 'Mine', emoji: '⬆' },
]

export const MAX_UPLOAD_BYTES = 1024 * 1024 // 1 MB

export const filterBuiltIns = (
  audios: BuiltInAudio[],
  tab: LibraryTab
): BuiltInAudio[] => {
  if (tab === 'top') return audios.filter((a) => a.top)
  if (tab === 'custom') return []
  return audios.filter((a) => a.category === tab)
}

export const customCardId = (custom: Pick<CustomAudio, 'id'>): string =>
  `custom:${custom.id}`

export const isCustomCardId = (id: string): boolean => id.startsWith('custom:')

export const customIdFromCardId = (cardId: string): string =>
  cardId.replace(/^custom:/, '')

/**
 * Returns null when the file passes validation, otherwise an error string.
 */
export const validateUpload = (file: {
  type: string
  size: number
}): string | null => {
  if (!file.type.startsWith('audio/')) {
    return 'Please choose an audio file (.mp3, .wav, …).'
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    const maxKb = Math.round(MAX_UPLOAD_BYTES / 1024)
    return `File is too big (max ${maxKb} KB).`
  }
  return null
}

export const generateCustomId = (): string => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export const buildCustomAudio = (
  file: { name: string; type: string; size: number },
  dataUrl: string,
  now: number = Date.now(),
  id: string = generateCustomId()
): CustomAudio => {
  const baseName = file.name.replace(/\.[^.]+$/, '').slice(0, 40) || 'My sound'
  return {
    id,
    displayName: baseName,
    dataUrl,
    mime: file.type,
    addedAt: now,
    sizeBytes: file.size,
  }
}
