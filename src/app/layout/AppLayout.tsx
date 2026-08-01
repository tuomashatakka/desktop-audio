import type { ReactNode } from 'react'
import { useUI } from '../contexts'
import { useHeightTier } from '../hooks'


interface AppLayoutProps {
  readonly titlebar?: ReactNode
  readonly sidebar?:  ReactNode
  readonly main:      ReactNode
  readonly player?:   ReactNode
}

export function AppLayout ({ titlebar, sidebar, main, player }: AppLayoutProps) {
  const { sidebarOpen } = useUI()
  const heightTier = useHeightTier()

  return (
    <div className='app-shell' data-height-tier={heightTier}>
      {sidebar && sidebarOpen && <aside className='app-sidebar'>{sidebar}</aside>}

      <div className='app-content'>
        {titlebar && <header className='titlebar'>{titlebar}</header>}

        <div className='app-body'>
          <main className='app-main'>{main}</main>
        </div>

        {player && <div className='app-player'>{player}</div>}
      </div>
    </div>
  )
}
