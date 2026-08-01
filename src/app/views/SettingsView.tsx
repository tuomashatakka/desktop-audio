import { useRef } from 'react'
import type { ChangeEvent } from 'react'
import { useSettings } from '../contexts'
import type { RepeatMode, Theme, CustomTheme } from '../contexts'
import { useData } from '../data'
import { useThemeApply } from '../hooks'
import { Button } from '../components/atomic'


const THEME_COLORS = [
  { key: '--bg', label: 'Background' },
  { key: '--bg-raised', label: 'Raised Background' },
  { key: '--bg-input', label: 'Input Background' },
  { key: '--bg-hover', label: 'Hover Background' },
  { key: '--accent', label: 'Accent' },
  { key: '--accent-hover', label: 'Accent Hover' },
  { key: '--accent-alt', label: 'Accent Alt' },
  { key: '--text', label: 'Text' },
  { key: '--text-dim', label: 'Dim Text' },
  { key: '--text-muted', label: 'Muted Text' },
  { key: '--border', label: 'Border' },
  { key: '--border-hover', label: 'Border Hover' },
  { key: '--success', label: 'Success' },
  { key: '--warning', label: 'Warning' },
  { key: '--danger', label: 'Danger' },
  { key: '--info', label: 'Info' },
  { key: '--wf-unplayed', label: 'Waveform Unplayed' },
  { key: '--wf-played', label: 'Waveform Played' },
]

const SETTINGS_SECTIONS = [
  { id: 'settings-library', label: 'Library' },
  { id: 'settings-appearance', label: 'Appearance' },
  { id: 'settings-playback', label: 'Playback' },
  { id: 'settings-about', label: 'About' },
] as const

export function SettingsView () {
  const {
    libraryPaths, theme, customTheme, defaultDensity,
    volume, repeatMode,
    addLibraryPath, removeLibraryPath,
    setTheme, setCustomTheme, exportTheme, importTheme, setDefaultDensity,
    setVolume, setRepeatMode,
  } = useSettings()
  const data = useData()
  const themeFileRef = useRef<HTMLInputElement>(null)

  useThemeApply(theme, theme === 'custom' ? customTheme : null)

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

  const handleColorChange = (key: string, value: string) => {
    if (theme !== 'custom')
      setTheme('custom')

    const updated = exportTheme()
    updated.colors[key] = value
    setCustomTheme(updated)
    document.documentElement.style.setProperty(key, value)
  }

  const handleExportTheme = () => {
    const themeData = exportTheme()
    const blob = new Blob([ JSON.stringify(themeData, null, 2) ], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${themeData.name || 'custom-theme'}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  const handleThemeFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file)
      return

    try {
      const imported = JSON.parse(await file.text()) as CustomTheme
      if (imported.version === 1 && imported.colors)
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

  const currentColors = theme === 'custom' && customTheme ? customTheme.colors : {}

  return (
    <div className='settings-view'>
      <nav className='settings-nav' aria-label='Settings sections'>
        <ul>
          {SETTINGS_SECTIONS.map(({ id, label }) =>
            <li key={id}>
              <a href={`#${id}`}>{label}</a>
            </li>
          )}
        </ul>
      </nav>

      <div className='settings-pane'>
        <section id='settings-library' aria-labelledby='settings-library-heading'>
          <h2 id='settings-library-heading'>Library</h2>
          <p className='section-description'>Library folders to scan for audio files</p>

          {libraryPaths.length === 0
            ? <p className='status-message'>No library paths added</p>
            : <ul className='path-list'>
              {libraryPaths.map(path =>
                <li key={path} className='path-item'>
                  <span title={path}>{path}</span>

                  <Button
                    type='button'
                    variant='ghost'
                    size='sm'
                    aria-label={`Remove ${path}`}
                    onClick={() =>
                      removeLibraryPath(path)}
                  >
                    <span aria-hidden='true'>×</span>
                  </Button>
                </li>
              )}
            </ul>
          }

          <Button type='button' variant='secondary' onClick={handleAddPath}>Add Folder</Button>

          <label className='field default-density'>
            <span>Default Row Density</span>

            <select
              className='select'
              value={defaultDensity}
              onChange={event =>
                setDefaultDensity(event.target.value as typeof defaultDensity)}
            >
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
              className='select'
              value={theme}
              onChange={event =>
                setTheme(event.target.value as Theme)}
            >
              <option value='dark'>Dark</option>
              <option value='light'>Light</option>
              <option value='custom'>Custom</option>
            </select>
          </label>

          <div className='theme-editor' hidden={theme !== 'custom'}>
            <h3>Custom Theme Colors</h3>

            <ul className='color-grid'>
              {THEME_COLORS.map(({ key, label }) =>
                <li key={key} className='color-field'>
                  <label>
                    <span>{label}</span>

                    <input
                      type='color'
                      value={currentColors[key] || '#000000'}
                      onChange={event =>
                        handleColorChange(key, event.target.value)}
                    />

                    <span className='color-value'>{currentColors[key] || ''}</span>
                  </label>
                </li>
              )}
            </ul>

            <menu className='theme-actions'>
              <li><Button type='button' variant='secondary' size='sm' onClick={handleSaveTheme}>Save</Button></li>
              <li><Button type='button' variant='secondary' size='sm' onClick={handleExportTheme}>Export</Button></li>

              <li>
                <Button type='button'
                  variant='secondary'
                  size='sm'
                  onClick={() =>
                    themeFileRef.current?.click()}>
                  Import
                </Button>
              </li>
            </menu>

            <input
              ref={themeFileRef}
              type='file'
              accept='.json,application/json'
              aria-label='Import custom theme'
              hidden
              onChange={handleThemeFile}
            />
          </div>
        </section>

        <section id='settings-playback' aria-labelledby='settings-playback-heading'>
          <h2 id='settings-playback-heading'>Playback</h2>

          <label className='field'>
            <span>Default Volume</span>

            <span className='volume-setting'>
              <input
                id='settings-volume'
                type='range'
                className='slider'
                min={0}
                max={1}
                step={0.01}
                value={volume}
                onChange={event =>
                  setVolume(Number(event.target.value))}
              />

              <output htmlFor='settings-volume' className='volume-value'>
                {Math.round(volume * 100)}
                %
              </output>
            </span>
          </label>

          <label className='field'>
            <span>Repeat Mode</span>

            <select
              className='select'
              value={repeatMode}
              onChange={event =>
                setRepeatMode(event.target.value as RepeatMode)}
            >
              <option value='none'>No Repeat</option>
              <option value='one'>Repeat One</option>
              <option value='all'>Repeat All</option>
            </select>
          </label>
        </section>

        <section id='settings-about' aria-labelledby='settings-about-heading'>
          <h2 id='settings-about-heading'>About</h2>
          <p>Desktop Audio Player v1.0.0</p>
          <p>Built with Electron + React</p>
        </section>
      </div>
    </div>
  )
}
