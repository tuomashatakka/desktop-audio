import type { ReactNode } from 'react'
import { useUI } from '../contexts'
import { useHeightTier } from '../hooks'


interface AppLayoutProps {
  readonly titlebar?: ReactNode
  readonly sidebar?:  ReactNode
  readonly main:      ReactNode
  readonly player?:   ReactNode
}

/**
 * App shell: optional titlebar, sidebar and player around the main view.
 *
 * `data-view` and `data-height-tier` are the two attributes the stylesheet
 * reads to decide the layout. Between them they determine whether the player
 * is a bar along the bottom or fills the window, and whether the chrome is
 * affordable at all — no element is shown or hidden from here.
 */
export function AppLayout ({ titlebar, sidebar, main, player }: AppLayoutProps) {
  const { sidebarOpen, currentView } = useUI()
  const heightTier = useHeightTier()

  return (
    <div
      className='app-shell'
      data-height-tier={heightTier}
      data-view={currentView}
      data-sidebar-open={sidebarOpen || undefined}
    >
      {titlebar && <header className='titlebar'>{titlebar}</header>}

      <div className='app-workspace'>
        {sidebar &&
          <aside className='app-sidebar' aria-hidden={!sidebarOpen} inert={!sidebarOpen}>
            {sidebar}
          </aside>
        }

        <div className='app-content'>
          <main className='app-main view-content'>{main}</main>
          {player && <footer className='app-player'>{player}</footer>}
        </div>
      </div>
    </div>
  )
}
