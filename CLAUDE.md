# Project: desktop-audio

Electron desktop music player. **Electron + React 18 + TypeScript + Vite + bun.**

## Commands

```bash
bun run start        # dev (electron-forge start)
bun run typecheck    # tsc --noEmit
bun run lint         # eslint ./src
bun test             # vitest run
bun run test:watch   # vitest --watch
bun run rebuild      # rebuild better-sqlite3 native module after dep changes
bun run make         # production build
```

## Architecture

```
src/
  main.ts              # Electron main process — IPC handlers
  preload.ts           # contextBridge — exposes electronAPI to renderer
  scanner-worker.ts    # Node.js Worker thread — walks dirs, writes SQLite
  app/
    contexts/          # React contexts: Library, Audio, Settings, UI
    hooks/             # useLibraryScanner (scan + subscribe), useKeyboardShortcuts
    services/
      contextBridge.ts # ElectronAPI interface + bridge accessor
      audioEngine.ts   # Web Audio API waveform/analyzer
      types.ts         # Track, FolderNode, AudioMetadata
    views/             # LibraryView, PlayerView, SettingsView, TagEditorView
```

## IPC Conventions

All IPC channels use `namespace:action` format: `library:scan`, `file:read`, `window:minimize`.
Bridge methods `onLibraryBatch` / `onLibraryDone` return unsubscribe functions — use in `useEffect` cleanup.

## Gotchas

- `better-sqlite3` is a native module — run `bun run rebuild` after any `bun install` that touches native deps
- ESLint rule `functional/no-let` flags all `let` — prefix with `// eslint-disable-next-line functional/no-let`
- Scanner worker runs in a separate thread with its own DB connection; main process only relays IPC messages
- Settings persisted to `localStorage`; library tracks persisted to `~/.appData/library.db` (SQLite)
