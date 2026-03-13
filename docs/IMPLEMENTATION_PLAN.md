# MVP Desktop Audio Player — Implementation Plan

## Overview

Build a React-based desktop audio player with clean separation between UI and state using multiple React Contexts. Follow the Semantic Nodes Design System principles from the docs.

---

## Architecture Summary

```
src/
├── main.ts                 # Electron main process (existing)
├── preload.ts              # Electron preload (existing)
├── renderer.tsx            # React entry point
├── app/
│   ├── contexts/           # Multiple state contexts
│   │   ├── AudioContext   # Playback state & engine control
│   │   ├── LibraryContext # Library folders, tracks, search
│   │   ├── SettingsContext # App settings
│   │   └── UIContext      # View state, modals, etc.
│   ├── components/        # Shared UI components
│   │   ├── atomic/        # Button, Input, Badge, etc.
│   │   └── composite/     # Card, Modal, etc.
│   ├── views/             # Page-level components
│   │   ├── LibraryView   # Two-column: tree + track list
│   │   ├── PlayerView    # Now playing
│   │   ├── SettingsView  # Settings page
│   │   └── TagEditorView # Metadata editor
│   ├── services/         # Business logic (no React)
│   │   ├── audioEngine   # Web Audio API wrapper
│   │   ├── fileScanner   # Directory scanning
│   │   └── metadataReader # Audio file metadata
│   ├── hooks/            # Custom hooks (glue code)
│   ├── utils/           # Pure utilities
│   └── styles/          # CSS files
│       ├── tokens.css   # Design tokens
│       ├── reset.css    # CSS reset
│       ├── base.css     # Element styles
│       └── components.css
```

---

## Phase 1: Project Setup & CSS Foundation

**Goal:** Set up React, create CSS architecture, basic app shell

| Task | Description |
|------|-------------|
| 1.1 | Add React dependencies (`react`, `react-dom`) |
| 1.2 | Configure Vite for React (update `vite.renderer.config.ts`) |
| 1.3 | Create `tokens.css` with design tokens from STYLE_GUIDE.md |
| 1.4 | Create `reset.css` and `base.css` |
| 1.5 | Create `components.css` with atomic component styles |
| 1.6 | Set up main app shell with view routing |
| 1.7 | Add sidebar/navigation structure |

---

## Phase 2: Context Architecture

**Goal:** Create all contexts with proper separation

| Task | Description |
|------|-------------|
| 2.1 | Create `UIContext` — current view, sidebar state, modals |
| 2.2 | Create `SettingsContext` — theme, audio settings, library paths |
| 2.3 | Create `LibraryContext` — folder tree, track list, search, selection |
| 2.4 | Create `AudioContext` — playback state, current track, volume |

### Context Structure

```typescript
// UIContext
interface UIState {
  currentView: 'library' | 'player' | 'settings' | 'tag-editor'
  sidebarOpen: boolean
  selectedFolderPath: string | null
}

// SettingsContext  
interface SettingsState {
  libraryPaths: string[]
  theme: 'dark' | 'light'
  volume: number
  repeatMode: 'none' | 'one' | 'all'
}

// LibraryContext
interface LibraryState {
  folders: FolderNode[]
  tracks: Track[]
  searchQuery: string
  selectedTrackIndex: number | null
}

// AudioContext
interface AudioState {
  isPlaying: boolean
  currentTime: number
  duration: number
  currentTrack: Track | null
  volume: number
}
```

---

## Phase 3: Atomic Components

**Goal:** Build reusable UI primitives using data attributes

| Task | Description |
|------|-------------|
| 3.1 | Create `Button` component |
| 3.2 | Create `Input` component |
| 3.3 | Create `Badge` component |
| 3.4 | Create `Card` component |
| 3.5 | Create `IconButton` component |
| 3.6 | Create `Slider` component |
| 3.7 | Create `TreeView` component for folder navigation |

Each component follows pattern:
```tsx
<button data-variant="primary" data-size="sm">Label</button>
```

---

## Phase 4: Library View (MVP Priority)

**Goal:** Two-column layout with tree navigator + track list

| Task | Description |
|------|-------------|
| 4.1 | Create `LibraryView` container |
| 4.2 | Implement left column `FolderTree` component |
| 4.3 | Implement right column `TrackList` component |
| 4.4 | Connect folder selection to track list |
| 4.5 | Add search/filter functionality |
| 4.6 | Add track selection and play trigger |

### Layout Structure

```
┌─────────────────────────────────────────┐
│  Library                         🔍搜索  │
├──────────────┬──────────────────────────┤
│              │                          │
│  📁 Music    │  🎵 song1.mp3    3:45   │
│    📁 Rock   │  🎵 song2.mp3    4:12   │
│    📁 Jazz   │  🎵 song3.mp3    2:58   │
│  📁 Podcasts │                          │
│              │                          │
├──────────────┴──────────────────────────┤
│  ▶ Now Playing: song1.mp3    ━━━━○━━━  │
└────────────────────────────────┘
```

---

## Phase 5: Player View

**Goal:** Now playing view with controls and waveform

| Task | Description |
|------|-------------|
| 5.1 | Create `PlayerView` container |
| 5.2 | Implement playback controls (prev, play/pause, next) |
| 5.3 | Add progress bar / seek functionality |
| 5.4 | Add volume control |
| 5.5 | Integrate audio engine for playback |
| 5.6 | Add basic waveform visualization |

---

## Phase 6: Settings View

**Goal:** Configuration page

| Task | Description |
|------|-------------|
| 6.1 | Create `SettingsView` container |
| 6.2 | Add library path management (add/remove folders) |
| 6.3 | Add theme toggle |
| 6.4 | Add playback settings (repeat, volume default) |
| 6.5 | Persist settings to localStorage |

---

## Phase 7: Tag Editor View

**Goal:** Edit audio file metadata

| Task | Description |
|------|-------------|
| 7.1 | Create `TagEditorView` container |
| 7.2 | Display track metadata (title, artist, album, etc.) |
| 7.3 | Create editable form fields |
| 7.4 | Save metadata back to file |

---

## Phase 8: Audio Engine Service

**Goal:** Non-React audio logic

| Task | Description |
|------|-------------|
| 8.1 | Create `AudioEngine` class (singleton) |
| 8.2 | Implement play/pause/seek functions |
| 8.3 | Add volume control |
| 8.4 | Add time update events |
| 8.5 | Create waveform loader |
| 8.6 | Connect to React via context |

---

## Phase 9: File Services

**Goal:** Backend communication via IPC

| Task | Description |
|------|-------------|
| 9.1 | Create file scanner service |
| 9.2 | Create metadata reader service |
| 9.3 | Set up IPC communication with main process |
| 9.4 | Wire services to contexts |

---

## Phase 10: Integration & Polish

**Goal:** Connect all pieces, final MVP

| Task | Description |
|------|-------------|
| 10.1 | Connect all contexts to views |
| 10.2 | Add keyboard shortcuts |
| 10.3 | Test full playback flow |
| 10.4 | Test folder navigation |
| 10.5 | Verify settings persistence |
| 10.6 | Build and test .exe/.app |

---

## Key Constraints

- **No Tailwind** — Use CSS variables and semantic selectors
- **Minimal useEffect** — Prefer `useMemo` for derived state
- **Separation** — Services have no React imports
- **State** — Components only render state and dispatch actions
- **Multiple Contexts** — Audio, Library, Settings, UI contexts

---

## Dependencies to Add

```json
{
  "react": "^18.x",
  "react-dom": "^18.x",
  "@types/react": "^18.x"
}
```
