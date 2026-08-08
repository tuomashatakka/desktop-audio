import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { HostProvider, DataProvider, ElectronHost, BrowserHost, IpcDataSource, WebFsDataSource } from './app/data'
import { getGlobalEnsureReady } from './app/contexts/AudioContext'

import './index.css'


const isElectron                         = typeof window !== 'undefined' && Boolean(window.electronAPI)
document.documentElement.dataset.runtime = isElectron ? 'electron' : 'browser'

const host = isElectron ? new ElectronHost() : new BrowserHost()
const data = isElectron ? new IpcDataSource() : new WebFsDataSource()

const container = document.querySelector('#app')
if (container) {
  const root = createRoot(container)
  root.render(
    <HostProvider value={ host }>
      <DataProvider value={ data }>
        <App />
      </DataProvider>
    </HostProvider>
  )
}

// In browser mode, initialize WebFS and resume AudioContext on first pointer event
if (!isElectron) {
  const handleFirstPointer = async () => {
    // Initialize WebFS: re-request permissions and scan existing roots
    if (data instanceof WebFsDataSource)
      data.init().catch(console.error)

    // Resume AudioContext if suspended (autoplay policy)
    const ensureReady = getGlobalEnsureReady()
    if (ensureReady)
      ensureReady().catch(console.error)

    // Remove listener after first invocation
    document.removeEventListener('pointerdown', handleFirstPointer)
  }
  document.addEventListener('pointerdown', handleFirstPointer, { once: true })
}
