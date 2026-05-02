import { createContext, useContext } from 'react'
import type { HostBridge } from './HostBridge'

const HostContext = createContext<HostBridge | null>(null)

export function HostProvider ({ value, children }: { value: HostBridge; children: React.ReactNode }) {
  return <HostContext.Provider value={value}>{children}</HostContext.Provider>
}

export function useHost (): HostBridge {
  const host = useContext(HostContext)
  if (!host)
    throw new Error('useHost must be used within a HostProvider')
  return host
}
