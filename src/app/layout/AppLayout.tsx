/* eslint-disable react-strict/no-style-prop -- A CSS custom property carries persisted UI state into layout CSS. */
import type { CSSProperties, ReactNode } from 'react'
import { useUI } from '../contexts'
import { useHeightTier } from '../hooks'


interface AppLayoutProps {
  readonly titlebar?: ReactNode
  readonly sidebar?:  ReactNode
  readonly main:      ReactNode
  readonly player?:   ReactNode
  readonly overlays?: ReactNode
}

/**
 * App shell: optional titlebar, sidebar and player around the main view.
 *
 * `data-height-tier` is the one attribute the stylesheet reads to decide the
 * layout — it determines whether the titlebar and the footer bar are
 * affordable at all, or whether the player takes the whole window. No element
 * is shown or hidden from here.
 *
 * `overlays` renders outside the workspace on purpose: every overlay is a
 * modal `<dialog>` that portals itself to `document.body` anyway, and keeping
 * the call site out of the layout tree is what stops anyone styling one as if
 * it were nested here.
 */
export function AppLayout ({ titlebar, sidebar, main, player, overlays }: AppLayoutProps) {
  const { sidebarOpen, sidebarWidth } = useUI()
  const heightTier                    = useHeightTier()

  return <div
    className='app-shell'
    style={{ '--sidebar-w': `${sidebarWidth}px` } as CSSProperties}
    data-height-tier={ heightTier }
    data-sidebar-open={ sidebarOpen || undefined }>
    {titlebar && <header className='titlebar'>{titlebar}</header>}

    <section className='app-workspace'>
      {sidebar &&
          <aside className='app-sidebar' aria-hidden={ !sidebarOpen } inert={ !sidebarOpen }>
            {sidebar}
          </aside>
      }

      <section className='app-content'>
        <main className='app-main view-content'>{main}</main>
        {player && <footer className='app-player'>{player}</footer>}
      </section>
    </section>

    {overlays}
  </div>
}
