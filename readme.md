# desktop-audio

A minimalist desktop audio player built with React, Vite, and Electron, following the Semantic Nodes Design System principles.

## Installation

```bash
npm install
npm run start
```

## Architecture

### Project Structure
```
src/
├── main.ts          # Electron main process
├── preload.ts       # Electron preload script
├── renderer.tsx     # React entry point
├── app/
│   ├── contexts/    # State management contexts
│   │   ├── AudioContext
│   │   ├── LibraryContext
│   │   ├── SettingsContext
│   │   └── UIContext
│   ├── components/  # UI components
│   │   ├── atomic/  # Button, Input, Badge
│   │   └── composite/ # Card, Modal
│   ├── views/       # Page-level components
│   │   ├── LibraryView
│   │   ├── PlayerView
│   │   ├── SettingsView
│   │   └── TagEditorView
│   ├── services/    # Business logic
│   │   ├── audioEngine
│   │   ├── fileScanner
│   │   └── metadataReader
│   ├── hooks/       # Custom hooks
│   ├── utils/       # Pure utilities
│   └── styles/      # CSS files
├── tokens.css       # Design tokens
├── reset.css        # CSS reset
├── base.css         # Element styles
└── components.css   # Component styles
```

### State Management
- **UIContext**: Current view, sidebar state, modals
- **SettingsContext**: Theme, audio settings, library paths
- **LibraryContext**: Folder tree, track list, search
- **AudioContext**: Playback state, current track, volume

## 🎵 Features

1. **Library View** - Two-column layout with folder tree and track list
2. **Player View** - Now playing controls with waveform visualization
3. **Settings View** - Configuration for themes, audio settings
4. **Tag Editor** - Edit audio file metadata (title, artist, album)

## Design System

### Design Tokens
```css
/* Colors */
--bg: #121212;
--accent: #ff5500;
--success: #38b000;

/* Typography */
--font: system-ui;
--text-base: 14px;

/* Spacing */
--sp-4: 16px;

/* Effects */
--shadow: 0 2px 4px rgba(0,0,0,0.2);
```

### Component Patterns
```tsx
// Button component example
function Button({ variant, size, loading, children }) {
  const classes = ['button', variant, size, loading && 'loading'].filter(Boolean).join(' ');
  return <button className={classes} disabled={loading}>{children}</button>;
}
```

## 🛠️ Development Constraints

- No utility-first CSS frameworks (Tailwind)
- Strict TypeScript with `strict: true`
- Semantic HTML first approach
- Minimal useEffect usage
- Multiple React contexts for state separation
- CSS variables for theming
- Atomic design component structure

## 📚 Dependencies

```json
{
  "dependencies": {
    "electron": "41.0.1",
    "react": "19.2.4",
    "vite": "8.0.3",
    "better-sqlite3": "^12.8.0"
  },
  "devDependencies": {
    "@electron-forge/cli": "7.11.1",
    "@types/react": "19.2.14"
  }
}
```

## Contribution Guidelines

1. Follow Semantic HTML principles
2. Use CSS variables for theming
3. Maintain component hierarchy (Atomic → Composite → Page)
4. Keep state management localized
5. Follow the implementation plan phases

## License

MIT License
