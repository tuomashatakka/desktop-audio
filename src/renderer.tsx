import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { HostProvider, DataProvider, ElectronHost, BrowserHost, IpcDataSource, WebFsDataSource } from './app/data'

import './index.css'


const isElectron = typeof window !== 'undefined' && Boolean(window.electronAPI)
const host = isElectron ? new ElectronHost() : new BrowserHost()
const data = isElectron ? new IpcDataSource() : new WebFsDataSource()

const container = document.querySelector('#app')
if (container) {
  const root = createRoot(container)
  root.render(
    <HostProvider value={host}>
      <DataProvider value={data}>
        <App />
      </DataProvider>
    </HostProvider>
  )
}
