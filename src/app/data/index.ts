// Host adapters (window controls, media keys, context menu)
export type { HostBridge } from './HostBridge'

export { ElectronHost } from './ElectronHost'

export { BrowserHost } from './BrowserHost'

export { HostProvider, useHost } from './HostContext'

// Data source interface and adapters
export type { DataSource, DataEvent, DataListener, LibraryRoot, AudioMetadata } from './DataSource'

export { IpcDataSource } from './IpcDataSource'

export { WebFsDataSource } from './WebFsDataSource'

export { DataProvider, useData } from './DataContext'

// IndexedDB helpers
export { openDB, idbGet, idbSet, idbDelete, idbGetAll } from './idb'

// Keep old names for backward compatibility during migration
export { ElectronHost as ElectronBridge } from './ElectronHost'

export { BrowserHost as BrowserBridge } from './BrowserHost'

export { HostProvider as BridgeProvider, useHost as useBridge } from './HostContext'
