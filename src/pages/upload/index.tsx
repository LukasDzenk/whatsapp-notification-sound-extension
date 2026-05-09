import { createRoot } from 'react-dom/client'
import '@pages/upload/Upload.scss'
import Upload from '@pages/upload/Upload'
import refreshOnUpdate from 'virtual:reload-on-update-in-view'

refreshOnUpdate('pages/upload')

const container = document.querySelector('#app-container')
if (!container) throw new Error('Cannot find #app-container')
createRoot(container).render(<Upload />)
