# Project: desktop-audio

Electron desktop music player. **Electron + React 18 + TypeScript + Vite + bun.**

## Commands

```bash
bun run start        # dev (electron-forge start)
bun run typecheck    # tsc --noEmit
bun run lint         # eslint ./src
bun test             # vitest run
bun run test:watch   # vitest --watch
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

## Also see

- code style guide: @docs/DESIGN_GUIDE.md
- design style guide: @docs/STYLE_GUIDE.md
- design guide:  @docs/IMPLEMENTATION_PLAN.md