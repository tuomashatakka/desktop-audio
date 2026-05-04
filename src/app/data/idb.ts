import type { TrackDTO } from './DataSource'


const DB_NAME = 'desktop-audio'
const DB_VERSION = 1

export interface DBSchema {
  roots:  { key: string; value: { id: string; label: string; handle: FileSystemDirectoryHandle }}
  tracks: { key: string; value: TrackDTO }
}

export async function openDB (): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('roots')) {
        db.createObjectStore('roots', { keyPath: 'key' })
      }
      if (!db.objectStoreNames.contains('tracks')) {
        db.createObjectStore('tracks', { keyPath: 'key' })
      }
    }
    req.onsuccess = () =>
      resolve(req.result)
    req.onerror = () =>
      reject(req.error)
  })
}

export async function idbGet (store: string, key: string): Promise<unknown> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly')
    const objectStore = tx.objectStore(store)
    const req = objectStore.get(key)
    req.onsuccess = () =>
      resolve(req.result)
    req.onerror = () =>
      reject(req.error)
  })
}

export async function idbSet (store: string, key: string, value: unknown): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite')
    const objectStore = tx.objectStore(store)
    const req = objectStore.put({ key, value })
    req.onsuccess = () =>
      resolve()
    req.onerror = () =>
      reject(req.error)
  })
}

export async function idbDelete (store: string, key: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite')
    const objectStore = tx.objectStore(store)
    const req = objectStore.delete(key)
    req.onsuccess = () =>
      resolve()
    req.onerror = () =>
      reject(req.error)
  })
}

export async function idbGetAll (store: string): Promise<unknown[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly')
    const objectStore = tx.objectStore(store)
    const req = objectStore.getAll()
    req.onsuccess = () =>
      resolve(req.result)
    req.onerror = () =>
      reject(req.error)
  })
}
