import { createContext, useContext, useEffect } from 'react'
import type { DataSource } from './DataSource'
import { Model } from '../models'


const DataContext = createContext<DataSource | null>(null)

type DataProviderProps = { value: DataSource; children: React.ReactNode }

export function DataProvider ({ value, children }: DataProviderProps) {
  // eslint-disable-next-line react-strict/prefer-no-use-effect -- Sets the module-global `Model.dataSource` for the provider's lifetime and clears it afterwards; assigning it during render would leak from a discarded one.
  useEffect(() => {
    // Set the global Model.dataSource for persistence
    Model.dataSource = value
    return () => {
      Model.dataSource = null
    }
  }, [ value ])

  return <DataContext.Provider value={ value }>{children}</DataContext.Provider>
}

export function useData (): DataSource {
  const data = useContext(DataContext)
  if (!data)
    throw new Error('useData must be used within a DataProvider')
  return data
}

/**
 * The data source if there is one, `null` otherwise.
 *
 * For consumers whose job is decoration rather than content — album art being
 * the case in hand. A track row renders perfectly well without a cover, so
 * demanding a provider for it would make presentational components untestable
 * in isolation for the sake of a thumbnail. Mirrors `useOptionalSettings`.
 */
export function useOptionalData (): DataSource | null {
  return useContext(DataContext)
}
