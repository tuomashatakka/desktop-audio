# desktop-audio

Music player for linux and mac. Built with Electron, React and TypeScript.

![Library view with breadcrumb navigation](public/screenshots/library-breadcrumbs.png)

## The mini player

Drag the window smaller and the player rebuilds itself around whatever room is
left. Album art goes first, then the buttons — the title and the progress line
are the last things standing. At its smallest it's a strip of chrome that still
plays your music.

| | | |
|:--:|:--:|:--:|
| ![Mini player in a short wide window with art, controls and waveform side by side](public/screenshots/mini-player-landscape.png) | ![Mini player in a tall narrow window with the full stacked layout](public/screenshots/mini-player-portrait.png) | ![Mini player with the album art dropped, title over waveform and controls](public/screenshots/mini-player-compact.png) |
| **Landscape** — art, controls & waveform | **Portrait** — the full stack, narrowed | **Compact** — art sheds, controls stack |

![Mini player as a slim bar with title, next button and a hairline progress line](public/screenshots/mini-player-wide.png)

*Slim bar — the progress bar flattens into a hairline pinned to the window edge.*

## Library

Breadcrumbs across the top navigate the folder tree, and every nested folder is
a native disclosure that can be toggled at any depth. The header collapses as
you scroll so the column header can pin to the top of the view.

![Library scrolled down with the column header pinned to the top](public/screenshots/library-sticky-header.png)

Tracks group by album, artist or path, in three row densities. Alt-clicking one
group applies its next state to every group. Right-clicking the table header
opens the column picker exactly at the pointer; every field, including year and
rating, can be shown or hidden.

![Library grouped by album with cover art beside each group](public/screenshots/library-album-groups.png)

## Keyboard control

Playback, views, settings, and the side menu have global shortcuts. Bindings can
be reassigned instantly under **Settings → Hotkeys**. See
[key bindings](docs/keybindings.md) for the defaults and package API.

## Native, instant UI

The app keeps one stable, shallow, virtualized library and player tree. Natural
block and grid flow handle layout; flex is kept for the few controls that are
genuinely one-dimensional. Dialogs, popovers, disclosures, forms, and action
menus use native HTML behavior. The waveform is an SVG backed by a native range
input, so pointer, touch, and keyboard seeking work without per-frame DOM
animation. It begins as a line and expands once real samples arrive. Interaction
transitions are intentionally zero-duration; loading and ambient artwork
feedback remain non-blocking.

## Development

```bash
bun install
bun run start        # dev (electron-forge start)
bun run typecheck    # tsc --noEmit
bun run lint         # eslint ./src
bun test             # vitest run
bun run make         # production build
```

See [CLAUDE.md](CLAUDE.md) for architecture notes.

## macOS release signing

Local macOS packages and CI builds without Apple credentials receive a valid
ad-hoc signature. That is useful for development, but downloaded artifacts will
not pass Gatekeeper automatically.

For trusted public artifacts, configure these GitHub Actions repository secrets:

- `MACOS_CERTIFICATE`: a base64-encoded Developer ID Application `.p12`
- `MACOS_CERTIFICATE_PASSWORD`: the `.p12` export password
- `APPLE_ID`: the Apple developer account email
- `APPLE_APP_SPECIFIC_PASSWORD`: an app-specific password for notarization
- `APPLE_TEAM_ID`: the ten-character Apple developer team ID

The release workflow imports the certificate into a temporary keychain, signs
the app, submits it to Apple for notarization, staples the ticket, and verifies
both the signature and Gatekeeper assessment before uploading the artifact.
