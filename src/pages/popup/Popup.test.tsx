import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import Popup from '@pages/popup/Popup'

const renderPopup = async () => {
  await act(async () => {
    render(<Popup />)
  })
}

type ChromeMockOptions = { isWhatsAppWeb?: boolean }

const installChromeMock = ({ isWhatsAppWeb = true }: ChromeMockOptions = {}) => {
  ;(global as unknown as { chrome: unknown }).chrome = {
    runtime: {
      getURL: jest.fn(() => 'chrome-extension://test/'),
      onMessage: { addListener: jest.fn() },
    },
    tabs: {
      query: jest.fn(
        (
          _q: chrome.tabs.QueryInfo,
          cb: (tabs: chrome.tabs.Tab[]) => void
        ) => cb([{ id: 42 } as chrome.tabs.Tab])
      ),
      sendMessage: jest.fn(
        (
          _id: number,
          msg: { type: string },
          cb?: (response: unknown) => void
        ) => {
          if (msg?.type === 'checkIfWhatsAppWeb') {
            cb && cb({ isWhatsAppWeb })
          } else if (cb) {
            cb({})
          }
        }
      ),
    },
    storage: {
      local: {
        get: jest.fn(
          (_keys: string[], cb: (result: Record<string, unknown>) => void) =>
            cb({ customAudios: [] })
        ),
        set: jest.fn(),
      },
    },
  }
}

// Audio.play is not implemented in jsdom; stub it to avoid noisy errors.
beforeAll(() => {
  window.HTMLMediaElement.prototype.play = jest
    .fn()
    .mockImplementation(() => Promise.resolve())
  window.HTMLMediaElement.prototype.pause = jest.fn()
})

beforeEach(() => {
  localStorage.clear()
  installChromeMock({ isWhatsAppWeb: true })
})

describe('Popup', () => {
  test('shows "open WhatsApp Web first" when not on web.whatsapp.com', async () => {
    installChromeMock({ isWhatsAppWeb: false })
    await renderPopup()
    expect(screen.getByText(/open whatsapp web/i)).toBeTruthy()
  })

  test('renders the Top picks by default when on WhatsApp Web', async () => {
    await renderPopup()
    expect(screen.getByText('Pop')).toBeTruthy()
    expect(screen.getByText('Chill guitar')).toBeTruthy()
    expect(screen.getByText('Soft chime')).toBeTruthy()
    // Non-top picks should not be visible by default
    expect(screen.queryByText('Clop')).toBeNull()
  })

  test('switching to the Fun tab shows the playful sounds', async () => {
    await renderPopup()

    fireEvent.click(screen.getByRole('button', { name: /fun/i }))

    expect(screen.getByText('Clop')).toBeTruthy()
    expect(screen.getByText('Positive')).toBeTruthy()
    expect(screen.getByText('Start')).toBeTruthy()
    expect(screen.queryByText('Pop')).toBeNull()
  })

  test('clicking Pick sends an updateCachedAudio message to the content script', async () => {
    await renderPopup()

    const pickButtons = screen.getAllByRole('button', { name: /^pick$/i })
    fireEvent.click(pickButtons[0])

    await waitFor(() => {
      const sendMessage = (
        global as unknown as {
          chrome: { tabs: { sendMessage: jest.Mock } }
        }
      ).chrome.tabs.sendMessage
      const updateCall = sendMessage.mock.calls.find(
        (c) => c[1]?.type === 'updateCachedAudio'
      )
      expect(updateCall).toBeTruthy()
      expect(updateCall[1]).toMatchObject({
        type: 'updateCachedAudio',
        selectedAudioUrl: expect.any(String),
        extensionIdentifierUrl: expect.any(String),
      })
    })
  })

  test('Mine tab shows the upload card and the empty-state hint', async () => {
    await renderPopup()

    fireEvent.click(screen.getByRole('button', { name: /mine/i }))

    expect(screen.getByText(/upload your own/i)).toBeTruthy()
    expect(screen.getByText(/no custom sounds yet/i)).toBeTruthy()
  })
})
