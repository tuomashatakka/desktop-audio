import { render, RenderOptions } from '@testing-library/react'
import { HostProvider } from '../../src/app/data/HostContext'
import { DataProvider } from '../../src/app/data'
import { UIProvider } from '../../src/app/contexts'
import { SettingsProvider } from '../../src/app/contexts'
import { LibraryProvider } from '../../src/app/contexts'
import { AudioProvider } from '../../src/app/contexts'
import type { HostBridge } from '../../src/app/data/HostBridge'
import type { DataSource } from '../../src/app/data/DataSource'
import { makeMockHost } from './makeMockHost'
import { makeMockDataSource } from './makeMockData'

interface WrapperProps {
  children: React.ReactNode
  host?: HostBridge
  data?: DataSource
}

export function renderWithProviders(
  ui: React.ReactElement,
  { host, data, ...renderOptions }: { host?: HostBridge; data?: DataSource } & Omit<RenderOptions, 'wrapper'> = {}
) {
  const mockHost = host || makeMockHost()
  const mockData = data || makeMockDataSource()
  
  const AllProviders = ({ children }: WrapperProps) => (
    <HostProvider value={mockHost}>
      <DataProvider value={mockData}>
        <UIProvider>
          <SettingsProvider>
            <LibraryProvider>
              <AudioProvider>
                {children}
              </AudioProvider>
            </LibraryProvider>
          </SettingsProvider>
        </UIProvider>
      </DataProvider>
    </HostProvider>
  )

  return render(ui, { wrapper: AllProviders as React.ComponentType<{}>, ...renderOptions })
}

// Re-export mock creators for convenience
export { makeMockHost, makeMockDataSource }
