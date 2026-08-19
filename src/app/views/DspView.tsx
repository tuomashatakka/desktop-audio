/**
 * The audio-processing page.
 *
 * It used to be a *layer* over Now Playing, opening between the type column and
 * the transport. That worked at one window size: sixteen faders, six knobs and
 * three module headers do not fit above a transport that also has to stay on
 * screen, so the page either clipped its own low bands or shrank until they
 * were unusable. It is its own destination now, with the whole window to work
 * in.
 *
 * Losing the transport is the trade, and it is the right one — the chain is
 * live, so whatever is playing keeps playing while you shape it, and the footer
 * bar behind the sheet still has the controls.
 */
import { DspPanel } from '../components/composite/DspPanel'


export function DspView () {
  return <article className='dsp-view' aria-labelledby='dsp-view-heading'>
    <header>
      <h1 id='dsp-view-heading'>Audio processing</h1>

      <p>
        A sixteen-band equaliser, a compressor and a limiter, in that order.
        Bypassing a module sets neutral parameters rather than unplugging it,
        so switching one off never clicks.
      </p>
    </header>

    <DspPanel />
  </article>
}
