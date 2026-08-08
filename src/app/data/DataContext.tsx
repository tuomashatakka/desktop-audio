import { createContext, useContext, useEffect } from 'react'
import type { DataSource } from './DataSource'
import { Model } from '../models'


const DataContext = createContext<DataSource | null>(null)

type DataProviderProps = { value: DataSource; children: React.ReactNode }

export function DataProvider ({ value, children }: DataProviderProps) {
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
