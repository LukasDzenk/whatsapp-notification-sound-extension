import packageJson from './package.json'

/**
 * After changing, please reload the extension at `chrome://extensions`
 */
const manifest: chrome.runtime.ManifestV3 = {
  manifest_version: 3,
  // name: packageJson.name,
  name: 'WhatSound - Change WhatsApp message sound',
  version: packageJson.version,
  description: packageJson.description,
  // Icons live in `public/icons/` and are copied verbatim to dist root by
  // Vite, giving the manifest stable paths that don't depend on the bundler's
  // hashing/renaming of imported assets.
  icons: {
    '16': 'icons/icon-16.png',
    '48': 'icons/icon-48.png',
    '128': 'icons/icon-128.png',
  },
  action: {
    default_popup: 'src/pages/popup/index.html',
    default_icon: {
      '16': 'icons/icon-16.png',
      '48': 'icons/icon-48.png',
      '128': 'icons/icon-128.png',
    },
  },
  permissions: ['storage'],
  host_permissions: [
    'https://freesound.org/*',
    'https://*.freesound.org/*',
  ],
  content_scripts: [
    {
      matches: ['https://web.whatsapp.com/*'],
      js: ['src/pages/content/index.js'],
      css: ['assets/css/contentStyle.chunk.css'],
    },
  ],
  // devtools_page: "src/pages/devtools/index.html",
  web_accessible_resources: [
    {
      resources: [
        'assets/js/*.js',
        'assets/css/*.css',
        'assets/mp3/*.mp3',
        'assets/wav/*.wav',
      ],
      matches: ['https://web.whatsapp.com/*'],
    },
  ],
}

export default manifest
