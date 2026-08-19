/**
 * OverlayHost — the dialogs that sit over the library.
 *
 * Now Playing, Audio processing, Settings and the Tag Editor used to be routes,
 * which meant opening one unmounted the library and collapsed the sidebar. They
 * are modal `<dialog>`s now: the library keeps its scroll position, its
 * selection and its place on screen behind them.
 *
 * The sheets mount only while they are the active overlay; `Overlay`'s exit
 * transition keeps one painted while it leaves, so unmounting on close is not
 * the same as snapping away.
 *
 * The player is the exception: it is **always mounted**, in both places it
 * appears, and only ever shown or hidden by CSS. Its two copies are one
 * component rendering one DOM, so nothing about the now-playing view can differ
 * between them — see the module docstring on `Player`.
 */
import { useUI } from '../contexts'
import { Overlay } from '../components/atomic'
import { Player } from '../components/composite/Player'
import { DspView } from '../views/DspView'
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
      <Player expanded />
    </Overlay>

    <Overlay
      open={ overlay === 'dsp' }
      label='Audio processing'
      variant='sheet'
      closeButton
      onClose={ closeOverlay }>
      {overlay === 'dsp' && <DspView />}
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
