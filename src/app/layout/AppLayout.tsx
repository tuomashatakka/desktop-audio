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
      {titlebar && <header className='titlebar'>{titlebar}</header>}

      <div className='app-body'>
        {sidebar && sidebarOpen && <aside className='app-sidebar'>{sidebar}</aside>}
        <main className='app-main'>{main}</main>
      </div>

      {player && <div className='app-player'>{player}</div>}
    </div>
  )
}
