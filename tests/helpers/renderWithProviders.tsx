import { render, RenderOptions } from '@testing-library/react'
import { BridgeProvider } from '../../src/app/data/BridgeContext'
import { UIProvider } from '../../src/app/contexts'
import { SettingsProvider } from '../../src/app/contexts'
import { LibraryProvider } from '../../src/app/contexts'
import { AudioProvider } from '../../src/app/contexts'
import type { Bridge } from '../../src/app/data/Bridge'

interface WrapperProps {
  children: React.ReactNode
  bridge?: Bridge
}

export function renderWithProviders(
  ui: React.ReactElement,
  { bridge, ...renderOptions }: { bridge?: Bridge } & Omit<RenderOptions, 'wrapper'> = {}
) {
  const AllProviders = ({ children }: WrapperProps) => (
    <BridgeProvider value={bridge || { 
      scanLibrary: () => {}, 
      loadLibrary: async () => [], 
      onLibraryBatch: () => () => {}, 
      onLibraryDone: () => () => {},
      selectDirectory: async () => null,
      getMusicDir: async () => null,
      readFile: async () => new ArrayBuffer(0),
      getAudioMetadata: async () => ({ title: '', artist: '', album: '', isPlaying: false, position: 0, duration: 0 } as any),
      minimizeWindow: () => {},
      maximizeWindow: () => {},
      closeWindow: () => {},
      isMaximized: async () => false,
      onMediaPlayPause: () => () => {},
      onMediaNext: () => () => {},
      onMediaPrev: () => () => {},
      showContextMenu: () => {},
      hideContextMenu: () => {},
      onContextMenuAction: () => () => {},
      updateMediaState: () => {},
      onMediaSeek: () => () => {},
      upsertModel: () => {},
      deleteModel: () => {},
    } as Bridge}>
      <UIProvider>
        <SettingsProvider>
          <LibraryProvider>
            <AudioProvider>
              {children}
            </AudioProvider>
          </LibraryProvider>
        </SettingsProvider>
      </UIProvider>
    </BridgeProvider>
  )

  return render(ui, { wrapper: AllProviders as React.ComponentType<{}>, ...renderOptions })
}
