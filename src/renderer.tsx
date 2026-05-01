import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { BridgeProvider, ElectronBridge, BrowserBridge } from './app/data'

import './index.css'


const useBrowserBridge = typeof window !== 'undefined' && !window.electronAPI
const bridge = useBrowserBridge ? new BrowserBridge() : new ElectronBridge()

const container = document.querySelector('#app')
if (container) {
  const root = createRoot(container)
  root.render(
    <BridgeProvider value={bridge}>
      <App />
    </BridgeProvider>
  )
}
