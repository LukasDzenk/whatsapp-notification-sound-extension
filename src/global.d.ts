import Chrome from 'chrome'

declare namespace chrome {
  export default Chrome
}

declare module 'virtual:reload-on-update-in-background-script' {
  export const reloadOnUpdate: (watchPath: string) => void
  export default reloadOnUpdate
}

declare module 'virtual:reload-on-update-in-view' {
  const refreshOnUpdate: (watchPath: string) => void
  export default refreshOnUpdate
}

declare module '*.svg' {
  import React = require('react')
  export const ReactComponent: React.SFC<React.SVGProps<SVGSVGElement>>
  const src: string
  export default src
}

declare module '*.jpg' {
  const content: string
  export default content
}

declare module '*.png' {
  const content: string
  export default content
}

declare module '*.json' {
  const content: string
  export default content
}

// Custom ld

declare module '*.mp3' {
  const content: string
  export default content
}

declare module '*.wav' {
  const content: string
  export default content
}

// Build-time flag injected by Vite (`define` in vite.config.ts).
// True only when the extension is built via `pnpm dev` (__DEV__=true).
declare const __WHATSOUND_DEV__: boolean
