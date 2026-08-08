import { globalShortcut, BrowserWindow } from 'electron'
import type { MediaState } from './app/services/types'


// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mprisPlayer: any = null

export function init (win: BrowserWindow): void {
  globalShortcut.register('MediaPlayPause', () =>
    win.webContents.send('media:play-pause'))
  globalShortcut.register('MediaNextTrack', () =>
    win.webContents.send('media:next'))
  globalShortcut.register('MediaPreviousTrack', () =>
    win.webContents.send('media:prev'))

  if (process.platform !== 'linux')
    return

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Player = require('mpris-service')
  mprisPlayer = Player({
    name:                'desktopAudio',
    identity:            'Desktop Audio',
    supportedUriSchemes: [ 'file' ],
    supportedMimeTypes:  [ 'audio/mpeg', 'audio/flac', 'audio/ogg', 'audio/x-wav' ],
    supportedInterfaces: [ 'player' ],
  })

  mprisPlayer.on('play', () =>
    win.webContents.send('media:play-pause'))
  mprisPlayer.on('pause', () =>
    win.webContents.send('media:play-pause'))
  mprisPlayer.on('next', () =>
    win.webContents.send('media:next'))
  mprisPlayer.on('previous', () =>
    win.webContents.send('media:prev'))
  mprisPlayer.on('seek', (delta: number) =>
    win.webContents.send('media:seek', delta))
}

export function updateState (state: MediaState): void {
  if (!mprisPlayer)
    return

  mprisPlayer.metadata = {
    'mpris:trackid': mprisPlayer.objectPath('track/0'),
    'mpris:length':  state.duration * 1e6,
    'xesam:title':   state.title,
    'xesam:artist':  [ state.artist ],
    'xesam:album':   state.album,
    ...!state.albumArt?.startsWith('data:') && state.albumArt
      ? { 'mpris:artUrl': state.albumArt }
      : {},
  }
  mprisPlayer.playbackStatus = state.isPlaying ? 'Playing' : 'Paused'
  mprisPlayer.position       = state.position * 1e6
}

export function teardown (): void {
  globalShortcut.unregisterAll()
  mprisPlayer = null
}
