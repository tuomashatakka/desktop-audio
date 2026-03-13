import { useSettings } from '../contexts'
import type { RepeatMode, Theme } from '../contexts'
import { selectDirectory } from '../services'
import { Button } from '../components/atomic'


export function SettingsView () {
  const { libraryPaths, theme, volume, repeatMode, addLibraryPath, removeLibraryPath, setTheme, setVolume, setRepeatMode } = useSettings()

  const handleAddPath = async () => {
    const path = await selectDirectory()
    if (path) {
      addLibraryPath(path)
    }
  }

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: 'var(--sp-6)' }}>
      <h2 style={{ marginBottom: 'var(--sp-6)' }}>Settings</h2>

      <div data-stack='lg'>
        <section>
          <h4 style={{ marginBottom: 'var(--sp-4)' }}>Library</h4>

          <div data-stack='sm'>
            <p style={{ color: 'var(--text-dim)', fontSize: 'var(--text-sm)' }}>Library folders to scan for audio files</p>

            {libraryPaths.length === 0
              ? <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>No library paths added</p>
              : <div data-stack='sm'>
                {libraryPaths.map(path =>

                  <div key={path} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', padding: 'var(--sp-2)', background: 'var(--bg-raised)', borderRadius: 'var(--radius)' }}>
                    <span style={{ flex: 1, fontSize: 'var(--text-sm)', fontFamily: 'var(--font-mono)' }}>{path}</span>

                    <Button variant='ghost'
                      size='sm'
                      onClick={() =>
                        removeLibraryPath(path)}>
                      ×
                    </Button>
                  </div>
                )}
              </div>
            }

            <Button variant='secondary' onClick={handleAddPath}>Add Folder</Button>
          </div>
        </section>

        <section>
          <h4 style={{ marginBottom: 'var(--sp-4)' }}>Appearance</h4>

          <div data-stack='sm'>
            <label>
              <span>Theme</span>

              <select value={theme}
                onChange={e =>
                  setTheme(e.target.value as Theme)}>
                <option value='dark'>Dark</option>
                <option value='light'>Light</option>
              </select>
            </label>
          </div>
        </section>

        <section>
          <h4 style={{ marginBottom: 'var(--sp-4)' }}>Playback</h4>

          <div data-stack='sm'>
            <label>
              <span>Default Volume</span>

              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
                <input
                  type='range'
                  data-slider
                  min={0}
                  max={1}
                  step={0.01}
                  value={volume}
                  onChange={e =>
                    setVolume(Number(e.target.value))}
                  style={{ flex: 1 }}
                />

                <span style={{ minWidth: 40, textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }}>
                  {Math.round(volume * 100)}
                  %
                </span>
              </div>
            </label>

            <label>
              <span>Repeat Mode</span>

              <select value={repeatMode}
                onChange={e =>
                  setRepeatMode(e.target.value as RepeatMode)}>
                <option value='none'>No Repeat</option>
                <option value='one'>Repeat One</option>
                <option value='all'>Repeat All</option>
              </select>
            </label>
          </div>
        </section>

        <section>
          <h4 style={{ marginBottom: 'var(--sp-4)' }}>About</h4>

          <div style={{ color: 'var(--text-dim)', fontSize: 'var(--text-sm)' }}>
            <p>Desktop Audio Player v1.0.0</p>
            <p>Built with Electron + React</p>
          </div>
        </section>
      </div>
    </div>
  )
}
