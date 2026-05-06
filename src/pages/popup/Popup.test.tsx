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
        remove: jest.fn(),
      },
      onChanged: { addListener: jest.fn(), removeListener: jest.fn() },
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

  test('clicking a sound card writes the selection to chrome.storage.local', async () => {
    await renderPopup()

    fireEvent.click(screen.getByRole('button', { name: /^pop$/i }))

    await waitFor(() => {
      const storageSet = (
        global as unknown as {
          chrome: { storage: { local: { set: jest.Mock } } }
        }
      ).chrome.storage.local.set
      const writeCall = storageSet.mock.calls.find(
        (c) => c[0] && 'selectedAudio' in c[0]
      )
      expect(writeCall).toBeTruthy()
      expect(writeCall[0].selectedAudio).toMatchObject({
        cardId: expect.any(String),
        src: expect.any(String),
        name: 'Pop',
        updatedAt: expect.any(Number),
      })
    })
  })

  test('clicking a sound card sends an applySelectedAudio message', async () => {
    await renderPopup()

    fireEvent.click(screen.getByRole('button', { name: /^pop$/i }))

    await waitFor(() => {
      const sendMessage = (
        global as unknown as {
          chrome: { tabs: { sendMessage: jest.Mock } }
        }
      ).chrome.tabs.sendMessage
      const applyCall = sendMessage.mock.calls.find(
        (c) => c[1]?.type === 'applySelectedAudio'
      )
      expect(applyCall).toBeTruthy()
    })
  })

  test('selecting a sound surfaces the refresh-WhatsApp hint', async () => {
    await renderPopup()
    expect(screen.queryByText(/refresh whatsapp web/i)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /^pop$/i }))

    expect(screen.getByText(/refresh whatsapp web/i)).toBeTruthy()
  })

  test('Mine tab shows the upload card and the empty-state hint', async () => {
    await renderPopup()

    fireEvent.click(screen.getByRole('button', { name: /mine/i }))

    expect(screen.getByText(/add your own sound/i)).toBeTruthy()
    expect(screen.getByText(/no custom sounds yet/i)).toBeTruthy()
  })
})
