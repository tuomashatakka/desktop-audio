import { createContext, useContext } from 'react'
import type { HostBridge } from './HostBridge'


const HostContext = createContext<HostBridge | null>(null)

type HostProviderProps = { value: HostBridge; children: React.ReactNode }

export function HostProvider ({ value, children }: HostProviderProps) {
  return <HostContext.Provider value={ value }>{children}</HostContext.Provider>
}

export function useHost (): HostBridge {
  const host = useContext(HostContext)
  if (!host)
    throw new Error('useHost must be used within a HostProvider')
  return host
}
