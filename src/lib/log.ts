/**
 * Dev-only logger. Calls are dead-code-eliminated in production builds because
 * Vite's `define` (vite.config.ts) replaces `__WHATSOUND_DEV__` with the
 * literal `false`, leaving an `if (false) {...}` branch the minifier drops.
 *
 * Outside the build pipeline (jest tests, type-only paths) the symbol is
 * undefined; `if (undefined)` is falsy, so no logs leak there either.
 */

declare const __WHATSOUND_DEV__: boolean | undefined

// `typeof` shields us from a `ReferenceError` in environments that don't
// run through Vite's `define` (jest). In a Vite build the substitution
// turns this into `typeof false === 'boolean' && false`, which the
// minifier folds to `false` and drops the whole branch.
const ENABLED =
  typeof __WHATSOUND_DEV__ === 'boolean' && __WHATSOUND_DEV__ === true

export const debugLog = (...args: unknown[]): void => {
  if (ENABLED) console.log('[WhatSound]', ...args)
}

export const debugWarn = (...args: unknown[]): void => {
  if (ENABLED) console.warn('[WhatSound]', ...args)
}
