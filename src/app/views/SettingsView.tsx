import { useSettings } from '../contexts'
import type { RepeatMode, Theme } from '../contexts'
import { useBridge } from '../data'
import { Button } from '../components/atomic'

export function SettingsView () {
  const { libraryPaths, theme, volume, repeatMode, addLibraryPath, removeLibraryPath, setTheme, setVolume, setRepeatMode } = useSettings()
  const bridge = useBridge()

  const handleAddPath = async () => {
    const path = await bridge.selectDirectory()
    if (path) {
      addLibraryPath(path)
    }
  }

  return (
    <div className='settings-view'>
      <h2>Settings</h2>

      <div className='stack lg'>
        <section className='library-section'>
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
          </div>
        </section>

        <section className='appearance-section'>
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
              </select>
            </label>
          </div>
        </section>

        <section className='playback-section'>
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

        <section className='about-section'>
          <h4>About</h4>

          <div className='about-content'>
            <p>Desktop Audio Player v1.0.0</p>
            <p>Built with Electron + React</p>
          </div>
        </section>
      </div>
    </div>
  )
}
