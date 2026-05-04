import { useState, useCallback } from 'react'
import { useSettings, useUI } from '../contexts'
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

export function SettingsView () {
  const {
    libraryPaths, theme, customTheme, defaultDensity,
    volume, repeatMode,
    addLibraryPath, removeLibraryPath,
    setTheme, setCustomTheme, exportTheme, importTheme, setDefaultDensity,
    setVolume, setRepeatMode,
  } = useSettings()
  const { density, setDensity } = useUI()
  const data = useData()

  const [ activeSection, setActiveSection ] = useState('library')

  // Apply custom theme for live preview
  useThemeApply(theme, theme === 'custom' ? customTheme : null)

  const handleAddPath = async () => {
    const path = await data.addRoot()
    if (path) {
      addLibraryPath(path)
    }
  }

  const handleColorChange = (key: string, value: string) => {
    if (theme !== 'custom') {
      setTheme('custom')
    }

    const updated = exportTheme()
    updated.colors[key] = value
    setCustomTheme(updated)
    // Live preview
    document.documentElement.style.setProperty(key, value)
  }

  const handleExportTheme = () => {
    const themeData = exportTheme()
    const blob = new Blob([ JSON.stringify(themeData, null, 2) ], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${themeData.name || 'custom-theme'}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImportTheme = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = e => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file)
        return

      const reader = new FileReader()
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result as string) as CustomTheme
          if (data.version === 1 && data.colors) {
            importTheme(data)
          }
        }
        catch {
          // Invalid theme file
        }
      }
      reader.readAsText(file)
    }
    input.click()
  }

  const handleSaveTheme = () => {
    const themeData = exportTheme()
    localStorage.setItem('desktop-audio-custom-theme', JSON.stringify(themeData))
  }

  const currentColors = theme === 'custom' && customTheme ? customTheme.colors : {}

  return (
    <div className='settings-view'>
      {/* Left rail navigation */}
      <nav className='settings-nav'>
        <button
          className={activeSection === 'library' ? 'active' : ''}
          onClick={() =>
            setActiveSection('library')}
        >
          Library
        </button>

        <button
          className={activeSection === 'appearance' ? 'active' : ''}
          onClick={() =>
            setActiveSection('appearance')}
        >
          Appearance
        </button>

        <button
          className={activeSection === 'playback' ? 'active' : ''}
          onClick={() =>
            setActiveSection('playback')}
        >
          Playback
        </button>

        <button
          className={activeSection === 'about' ? 'active' : ''}
          onClick={() =>
            setActiveSection('about')}
        >
          About
        </button>
      </nav>

      {/* Right pane */}
      <div className='settings-pane'>
        {activeSection === 'library' &&
          <section id='library'>
            <h4>Library</h4>

            <div className='stack sm'>
              <p className='section-description'>Library folders to scan for audio files</p>

              {libraryPaths.length === 0
                ? <p className='status-message'>No library paths added</p>
                : <div className='path-list stack sm'>
                  {libraryPaths.map(path =>
                    <div key={path} className='path-item'>
                      <span>{path}</span>

                      <Button
                        variant='ghost'
                        size='sm'
                        onClick={() =>
                          removeLibraryPath(path)}
                      >
                        ×
                      </Button>
                    </div>
                  )}
                </div>
              }

              <Button variant='secondary' onClick={handleAddPath}>Add Folder</Button>

              <div className='field' style={{ marginTop: 'var(--sp-4)' }}>
                <span>Default Row Density</span>

                <select
                  className='select'
                  value={defaultDensity}
                  onChange={e =>
                    setDefaultDensity(e.target.value as typeof defaultDensity)}
                >
                  <option value='compact'>Compact</option>
                  <option value='normal'>Normal</option>
                  <option value='relaxed'>Relaxed</option>
                </select>
              </div>
            </div>
          </section>
        }

        {activeSection === 'appearance' &&
          <section id='theme'>
            <h4>Appearance</h4>

            <div className='stack sm'>
              <label className='field'>
                <span>Theme</span>

                <select
                  className='select'
                  value={theme}
                  onChange={e =>
                    setTheme(e.target.value as Theme)}
                >
                  <option value='dark'>Dark</option>
                  <option value='light'>Light</option>
                  <option value='custom'>Custom</option>
                </select>
              </label>

              {theme === 'custom' &&
                <div className='theme-editor'>
                  <h5>Custom Theme Colors</h5>

                  <div className='color-grid'>
                    {THEME_COLORS.map(({ key, label }) =>
                      <div key={key} className='color-field'>
                        <label>
                          <span>{label}</span>

                          <input
                            type='color'
                            value={currentColors[key] || '#000000'}
                            onChange={e =>
                              handleColorChange(key, e.target.value)}
                          />

                          <span className='color-value'>{currentColors[key] || ''}</span>
                        </label>
                      </div>
                    )}
                  </div>

                  <div className='theme-actions cluster'>
                    <Button variant='secondary' size='sm' onClick={handleSaveTheme}>Save</Button>
                    <Button variant='secondary' size='sm' onClick={handleExportTheme}>Export</Button>
                    <Button variant='secondary' size='sm' onClick={handleImportTheme}>Import</Button>
                  </div>
                </div>
              }
            </div>
          </section>
        }

        {activeSection === 'playback' &&
          <section id='playback'>
            <h4>Playback</h4>

            <div className='stack sm'>
              <label className='field'>
                <span>Default Volume</span>

                <div className='volume-control cluster'>
                  <input
                    type='range'
                    className='slider'
                    min={0}
                    max={1}
                    step={0.01}
                    value={volume}
                    onChange={e =>
                      setVolume(Number(e.target.value))}
                  />

                  <span className='volume-value mono text-sm'>
                    {Math.round(volume * 100)}
                    %
                  </span>
                </div>
              </label>

              <label className='field'>
                <span>Repeat Mode</span>

                <select
                  className='select'
                  value={repeatMode}
                  onChange={e =>
                    setRepeatMode(e.target.value as RepeatMode)}
                >
                  <option value='none'>No Repeat</option>
                  <option value='one'>Repeat One</option>
                  <option value='all'>Repeat All</option>
                </select>
              </label>
            </div>
          </section>
        }

        {activeSection === 'about' &&
          <section id='about'>
            <h4>About</h4>

            <div className='about-content'>
              <p>Desktop Audio Player v1.0.0</p>
              <p>Built with Electron + React</p>
            </div>
          </section>
        }
      </div>
    </div>
  )
}
