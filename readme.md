# desktop-audio

Music player for linux and mac. Built with Electron, React and TypeScript.

![Library view with breadcrumb navigation](public/screenshots/library-breadcrumbs.png)

## The mini player

Drag the window smaller and the player rebuilds itself around whatever room is
left. Album art goes first, then the buttons — the title and the progress line
are the last things standing. At its smallest it's a strip of chrome that still
plays your music.

| | |
|:--:|:--:|
| ![Mini player in a short wide window with art, controls and waveform side by side](public/screenshots/mini-player-landscape.png) | ![Mini player in a tall narrow window with the full stacked layout](public/screenshots/mini-player-portrait.png) |
| **Landscape** — art, controls & waveform | **Portrait** — the full stack, narrowed |
| ![Mini player with the album art dropped, title over waveform and controls](public/screenshots/mini-player-compact.png) | ![Smallest mini player showing only album art, track title and the next button](public/screenshots/mini-player-bar.png) |
| **Compact** — art sheds, controls stack | **Smallest** — art, title, next |

![Mini player as a slim bar with title, next button and a hairline progress line](public/screenshots/mini-player-wide.png)

*Slim bar — the progress bar flattens into a hairline pinned to the window edge.*

## Library

Breadcrumbs across the top navigate the folder tree; the header collapses as
you scroll so the column header can pin to the top of the view.

![Library scrolled down with the column header pinned to the top](public/screenshots/library-sticky-header.png)

Tracks group by album, artist or path, in three row densities.

![Library grouped by album with cover art beside each group](public/screenshots/library-album-groups.png)

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
