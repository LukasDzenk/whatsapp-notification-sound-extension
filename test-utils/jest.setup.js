/**
 * Default chrome.* mock so popup modules that touch chrome at import-time
 * (e.g. `chrome.runtime.getURL('')`) do not crash. Tests override individual
 * methods via jest.fn assignment.
 */
global.chrome = {
  runtime: {
    getURL: () => 'chrome-extension://test/',
    onMessage: { addListener: () => {} },
  },
  tabs: {
    query: (_q, cb) => cb([{ id: 1 }]),
    sendMessage: (_id, _msg, cb) => cb && cb({ isWhatsAppWeb: false }),
  },
  storage: {
    local: {
      get: (_keys, cb) => cb({}),
      set: () => {},
    },
  },
}
