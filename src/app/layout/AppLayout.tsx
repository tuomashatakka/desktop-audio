import type { ReactNode } from 'react'


interface AppLayoutProps {
  readonly titlebar?: ReactNode
  readonly sidebar?:  ReactNode
  readonly main:      ReactNode
  readonly player?:   ReactNode
}

export function AppLayout ({ titlebar, sidebar, main, player }: AppLayoutProps) {
  return (
    <div className='app-shell'>
      {titlebar && <header className='titlebar'>{titlebar}</header>}

      <div className='app-body'>
        {sidebar && <aside className='app-sidebar'>{sidebar}</aside>}
        <main className='app-main'>{main}</main>
      </div>

      {player && <div className='app-player'>{player}</div>}
    </div>
  )
}
