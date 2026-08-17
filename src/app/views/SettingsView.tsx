import { useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { useSettings, UI_FONT_LABELS, MIN_FONT_SCALE, MAX_FONT_SCALE } from '../contexts'
import type { RepeatMode, Theme, CustomTheme, UiFont } from '../contexts'
import { useData } from '../data'
import { useKeybindings } from '../hooks'
import { formatShortcut, shortcutFromEvent } from '../../keybindings'
import { Button, Icon } from '../components/atomic'


const THEME_COLORS = [
  { key: 'background', label: 'Main background' },
  { key: 'foreground', label: 'Main foreground' },
  { key: 'accent', label: 'Accent' },
] as const

const THEME_INTENSITIES = [
  { key: 'borderIntensity', label: 'Border intensity' },
  { key: 'hoverIntensity', label: 'Hover intensity' },
  { key: 'focusIntensity', label: 'Focus intensity' },
] as const

const SETTINGS_SECTIONS = [
  { id: 'settings-library', label: 'Library' },
  { id: 'settings-appearance', label: 'Appearance' },
  { id: 'settings-playback', label: 'Playback' },
  { id: 'settings-analysis', label: 'Analysis' },
  { id: 'settings-hotkeys', label: 'Hotkeys' },
  { id: 'settings-about', label: 'About' },
] as const

export function SettingsView () {
  const {
    libraryPaths, theme, customTheme, defaultDensity,
    volume, repeatMode, shuffle,
    uiFont, fontScale, accentDark, accentLight,
    showBeatMarkers, showChordAnalysis, showKeyAnalysis,
    addLibraryPath, removeLibraryPath,
    setTheme, setCustomTheme, exportTheme, importTheme, setDefaultDensity,
    setVolume, setRepeatMode, setShuffle,
    setUiFont, setFontScale, setAccent,
    setShowBeatMarkers, setShowChordAnalysis, setShowKeyAnalysis,
  }                                                   = useSettings()
  const data                                          = useData()
  const themeFileRef                                  = useRef<HTMLInputElement>(null)
  const { bindings, updateBinding, resetKeybindings } = useKeybindings()
  const [ shortcutStatus, setShortcutStatus ]         = useState('Select a shortcut field, then press the new keys.')
  const isMac                                         = typeof navigator !== 'undefined' && (/mac/i).test(navigator.userAgent)

  const handleAddPath = async () => {
    try {
      const path = await data.addRoot()
      if (path)
        addLibraryPath(path)
    }
    catch (error) {
      console.error('Failed to add path:', error)
    }
  }

  const handleColorChange = (
    key: typeof THEME_COLORS[number]['key'],
    value: string
  ) => {
    if (theme !== 'custom')
      setTheme('custom')

    setCustomTheme({ ...exportTheme(), [key]: value })
  }

  const handleIntensityChange = (
    key: typeof THEME_INTENSITIES[number]['key'],
    value: number
  ) => {
    if (theme !== 'custom')
      setTheme('custom')

    setCustomTheme({ ...exportTheme(), [key]: value })
  }

  const handleExportTheme = () => {
    const themeData = exportTheme()
    const blob      = new Blob([ JSON.stringify(themeData, null, 2) ], { type: 'application/json' })
    const url       = URL.createObjectURL(blob)
    const link      = document.createElement('a')
    link.href       = url
    link.download   = `${themeData.name || 'custom-theme'}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  const handleThemeFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file                = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file)
      return

    try {
      const imported = JSON.parse(await file.text()) as CustomTheme
      if (imported && typeof imported === 'object')
        importTheme(imported)
    }
    catch {
      // An invalid theme leaves the current theme untouched.
    }
  }

  const handleSaveTheme = () => {
    const themeData = exportTheme()
    localStorage.setItem('desktop-audio-custom-theme', JSON.stringify(themeData))
  }

  const handleShortcutKey = (id: string, event: React.KeyboardEvent<HTMLInputElement>) => {
    event.preventDefault()
    event.stopPropagation()

    if (event.key === 'Escape') {
      event.currentTarget.blur()
      return
    }

    const clear = (event.key === 'Backspace' || event.key === 'Delete') &&
      !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey
    const shortcut = clear ? '' : shortcutFromEvent(event)
    if (shortcut === null)
      return

    if (updateBinding(id, shortcut)) {
      setShortcutStatus(clear ? 'Shortcut cleared.' : `Shortcut changed to ${formatShortcut(shortcut, isMac)}.`)
      event.currentTarget.blur()
    }
    else
      setShortcutStatus('That shortcut is already assigned.')
  }

  const currentTheme = customTheme ?? exportTheme()

  return <div className='settings-view'>
    <nav className='settings-nav' aria-label='Settings sections'>
      <ul>
        {SETTINGS_SECTIONS.map(({ id, label }) =>
          <li key={ id }>
            <a href={ `#${id}` }>{label}</a>
          </li>
        )}
      </ul>
    </nav>

    <section className='settings-pane'>
      <section id='settings-library' aria-labelledby='settings-library-heading'>
        <h2 id='settings-library-heading'>Library</h2>
        <p className='section-description'>Library folders to scan for audio files</p>

        {libraryPaths.length === 0
          ? <p className='status-message'>No library paths added</p>
          : <ul className='path-list'>
            {libraryPaths.map(path =>
              <li key={ path } className='path-item'>
                <span title={ path }>{path}</span>

                <Button
                  aria-label={ `Remove ${path}` }
                  type='button'
                  variant='ghost'
                  size='sm'
                  onClick={ () =>
                    removeLibraryPath(path) }>
                  <Icon name='close' />
                </Button>
              </li>
            )}
          </ul>
        }

        <Button type='button' variant='secondary' onClick={ handleAddPath }>Add Folder</Button>

        <label className='field default-density'>
          <span>Default Row Density</span>

          <select
            value={ defaultDensity }
            onChange={ event =>
              setDefaultDensity(event.target.value as typeof defaultDensity) }>
            <option value='compact'>Compact</option>
            <option value='normal'>Normal</option>
            <option value='relaxed'>Relaxed</option>
          </select>
        </label>
      </section>

      <section id='settings-appearance' aria-labelledby='settings-appearance-heading'>
        <h2 id='settings-appearance-heading'>Appearance</h2>

        <label className='field'>
          <span>Theme</span>

          <select
            value={ theme }
            onChange={ event =>
              setTheme(event.target.value as Theme) }>
            <option value='dark'>Dark</option>
            <option value='light'>Light</option>
            <option value='custom'>Custom</option>
          </select>
        </label>

        <label className='field'>
          <span>UI Font</span>

          <select
            value={ uiFont }
            onChange={ event =>
              setUiFont(event.target.value as UiFont) }>
            {(Object.keys(UI_FONT_LABELS) as UiFont[]).map(font =>
              <option key={ font } value={ font }>{UI_FONT_LABELS[font]}</option>
            )}
          </select>
        </label>

        <p className='section-description'>
          Montserrat ships with the app. Poppins and Helvetica are used only
          if they are installed on this system.
        </p>

        <label className='field'>
          <span>Font Size</span>

          <span className='volume-setting'>
            <input
              className='slider'
              id='settings-font-scale'
              type='range'
              min={ MIN_FONT_SCALE }
              max={ MAX_FONT_SCALE }
              step={ 0.05 }
              value={ fontScale }
              onChange={ event =>
                setFontScale(Number(event.target.value)) } />

            <output className='volume-value' htmlFor='settings-font-scale'>
              {Math.round(fontScale * 100)}
              %
            </output>
          </span>
        </label>

        {/* Two swatches, not one: an accent tuned for a near-black surface
              rarely holds up on a light one, and vice versa. */}
        <fieldset className='field accent-picker'>
          <legend>Accent Colour</legend>

          <label>
            <span>Dark theme</span>

            <input
              type='color'
              value={ accentDark }
              onChange={ event =>
                setAccent('dark', event.target.value) } />

            <span className='color-value'>{accentDark}</span>
          </label>

          <label>
            <span>Light theme</span>

            <input
              type='color'
              value={ accentLight }
              onChange={ event =>
                setAccent('light', event.target.value) } />

            <span className='color-value'>{accentLight}</span>
          </label>
        </fieldset>

        <section
          className='theme-editor'
          aria-labelledby='custom-theme-heading'
          hidden={ theme !== 'custom' }>
          <h3 id='custom-theme-heading'>Custom theme</h3>

          <fieldset className='theme-control-group color-grid'>
            <legend>Base colours</legend>

            {THEME_COLORS.map(({ key, label }) =>
              <label key={ key } className='color-field'>
                <span>{label}</span>

                <input
                  type='color'
                  value={ currentTheme[key] }
                  onChange={ event =>
                    handleColorChange(key, event.target.value) } />

                <span className='color-value'>{currentTheme[key]}</span>
              </label>
            )}
          </fieldset>

          <fieldset className='theme-control-group intensity-grid'>
            <legend>Derived interaction palette</legend>

            {THEME_INTENSITIES.map(({ key, label }) => {
              const id = `custom-theme-${key}`
              return <label key={ key } className='field theme-intensity' htmlFor={ id }>
                <span>{label}</span>

                <span className='volume-setting'>
                  <input
                    id={ id }
                    className='slider'
                    type='range'
                    min={ 0 }
                    max={ 1 }
                    step={ 0.05 }
                    value={ currentTheme[key] }
                    onChange={ event =>
                      handleIntensityChange(key, event.currentTarget.valueAsNumber) } />

                  <output className='volume-value' htmlFor={ id }>
                    {Math.round(currentTheme[key] * 100)}
                    %
                  </output>
                </span>
              </label>
            })}
          </fieldset>

          <p className='section-description'>
            Raised surfaces, muted text, borders, hover colours and focus rings
            are calculated from these six controls.
          </p>

          <menu className='theme-actions'>
            <li>
              <Button type='button' variant='secondary' size='sm' onClick={ handleSaveTheme }>Save</Button>
            </li>

            <li>
              <Button type='button' variant='secondary' size='sm' onClick={ handleExportTheme }>Export</Button>
            </li>

            <li>
              <Button
                type='button'
                variant='secondary'
                size='sm'
                onClick={ () =>
                  themeFileRef.current?.click() }>
                Import
              </Button>
            </li>
          </menu>

          <input
            ref={ themeFileRef }
            aria-label='Import custom theme'
            type='file'
            accept='.json,application/json'
            hidden
            onChange={ handleThemeFile } />
        </section>
      </section>

      <section id='settings-playback' aria-labelledby='settings-playback-heading'>
        <h2 id='settings-playback-heading'>Playback</h2>

        <label className='field'>
          <span>Default Volume</span>

          <span className='volume-setting'>
            <input
              className='slider'
              id='settings-volume'
              type='range'
              min={ 0 }
              max={ 1 }
              step={ 0.01 }
              value={ volume }
              onChange={ event =>
                setVolume(Number(event.target.value)) } />

            <output className='volume-value' htmlFor='settings-volume'>
              {Math.round(volume * 100)}
              %
            </output>
          </span>
        </label>

        <label className='field'>
          <span>Repeat Mode</span>

          <select
            value={ repeatMode }
            onChange={ event =>
              setRepeatMode(event.target.value as RepeatMode) }>
            <option value='none'>No Repeat</option>
            <option value='one'>Repeat One</option>
            <option value='all'>Repeat All</option>
          </select>
        </label>

        <label className='field checkbox-field'>
          <input
            type='checkbox'
            checked={ shuffle }
            onChange={ event =>
              setShuffle(event.target.checked) } />

          <span>Shuffle</span>
        </label>
      </section>

      <section id='settings-analysis' aria-labelledby='settings-analysis-heading'>
        <h2 id='settings-analysis-heading'>Analysis</h2>

        <p className='section-description'>
          Musical analysis shown in the now-playing analysis view and on the waveform.
        </p>

        <label className='field checkbox-field'>
          <input
            type='checkbox'
            checked={ showBeatMarkers }
            onChange={ event =>
              setShowBeatMarkers(event.target.checked) } />

          <span>Beat markers on waveform</span>
        </label>

        <label className='field checkbox-field'>
          <input
            type='checkbox'
            checked={ showChordAnalysis }
            onChange={ event =>
              setShowChordAnalysis(event.target.checked) } />

          <span>Chord analysis</span>
        </label>

        <label className='field checkbox-field'>
          <input
            type='checkbox'
            checked={ showKeyAnalysis }
            onChange={ event =>
              setShowKeyAnalysis(event.target.checked) } />

          <span>Key and tempo analysis</span>
        </label>
      </section>

      <section id='settings-hotkeys' aria-labelledby='settings-hotkeys-heading'>
        <h2 id='settings-hotkeys-heading'>Hotkeys</h2>

        <p className='section-description'>
          Focus a shortcut and press its replacement. Backspace or Delete clears it.
        </p>

        <fieldset className='hotkey-list'>
          <legend className='sr-only'>Keyboard shortcuts</legend>

          {bindings.map(binding =>
            <label key={ binding.id } className='hotkey-field'>
              <span>{binding.label}</span>

              <input
                aria-describedby='shortcut-status'
                type='text'
                readOnly
                value={ formatShortcut(binding.shortcut, isMac) }
                onFocus={ event =>
                  event.currentTarget.select() }
                onKeyDown={ event =>
                  handleShortcutKey(binding.id, event) } />
            </label>
          )}
        </fieldset>

        <output className='hotkey-status' id='shortcut-status' aria-live='polite'>
          {shortcutStatus}
        </output>

        <Button type='button' variant='secondary' size='sm' onClick={ resetKeybindings }>
          Reset shortcuts
        </Button>
      </section>

      <section id='settings-about' aria-labelledby='settings-about-heading'>
        <h2 id='settings-about-heading'>About</h2>
        <p>Desktop Audio Player v1.0.0</p>
        <p>Built with Electron + React</p>
      </section>
    </section>
  </div>
}
