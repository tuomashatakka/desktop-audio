import { createContext, useContext } from 'react'
import type { Bridge } from './Bridge'

const BridgeContext = createContext<Bridge | null>(null)

export function BridgeProvider({ value, children }: { value: Bridge; children: React.ReactNode }) {
  return <BridgeContext.Provider value={value}>{children}</BridgeContext.Provider>
}

export function useBridge(): Bridge {
  const bridge = useContext(BridgeContext)
  if (!bridge) throw new Error('useBridge must be used within a BridgeProvider')
  return bridge
}
