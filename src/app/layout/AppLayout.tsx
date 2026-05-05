import type { ReactNode } from 'react'
import { useUI } from '../contexts'


interface AppLayoutProps {
  readonly titlebar?: ReactNode
  readonly sidebar?:  ReactNode
  readonly main:      ReactNode
  readonly player?:   ReactNode
}

export function AppLayout ({ titlebar, sidebar, main, player }: AppLayoutProps) {
  const { sidebarOpen } = useUI()

  return (
    <div className='app-shell'>
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
