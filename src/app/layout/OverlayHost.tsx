/**
 * OverlayHost — the three dialogs that sit over the library.
 *
 * Now Playing, Settings and the Tag Editor used to be routes, which meant
 * opening one unmounted the library and collapsed the sidebar. They are modal
 * `<dialog>`s now: the library keeps its scroll position, its selection and
 * its place on screen behind them.
 *
 * Only the active one is mounted. `Overlay`'s exit transition keeps it painted
 * while it leaves, so unmounting on close is not the same as snapping away.
 */
import { useUI } from '../contexts'
import { Overlay } from '../components/atomic'
import { Player } from '../components/composite/Player'
import { SettingsView } from '../views/SettingsView'
import { TagEditorView } from '../views/TagEditorView'


/** See module docstring. */
export function OverlayHost () {
  const { overlay, closeOverlay } = useUI()

  return <>
    {/* No `closeButton` here, unlike the two sheets below: the player carries
        its own, grouped with the mode buttons in `.player-actions`. Passing it
        here as well is what rendered two. */}
    <Overlay
      className='player-overlay'
      open={ overlay === 'player' }
      label='Now playing'
      variant='full'
      onClose={ closeOverlay }>
      {overlay === 'player' && <Player expanded />}
    </Overlay>

    <Overlay
      open={ overlay === 'settings' }
      label='Settings'
      variant='sheet'
      closeButton
      onClose={ closeOverlay }>
      {overlay === 'settings' && <SettingsView />}
    </Overlay>

    <Overlay
      open={ overlay === 'tag-editor' }
      label='Edit tags'
      variant='sheet'
      closeButton
      onClose={ closeOverlay }>
      {overlay === 'tag-editor' && <TagEditorView />}
    </Overlay>
  </>
}
