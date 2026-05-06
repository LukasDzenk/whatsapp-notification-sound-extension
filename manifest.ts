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
  // options_page: "src/pages/options/index.html",
  // background: { service_worker: "src/pages/background/index.js" },
  // icons: {
  //   '16': 'assets/png/imgWhatsound_logo.chunk.png',
  //   '48': 'assets/png/imgWhatsound_logo.chunk.png',
  //   '128': 'assets/png/imgWhatsound_logo.chunk.png',
  // },
  action: {
    default_popup: 'src/pages/popup/index.html',
    default_icon: 'assets/png/imgWhatsound_logo.chunk.png',
  },
  permissions: ['storage'],
  // chrome_url_overrides: {
  //   newtab: "src/pages/newtab/index.html",
  // },
  // icons: {
  //   '128': 'icon-128.png',
  // },
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
