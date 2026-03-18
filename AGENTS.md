# AGENTS.md - Desktop Audio Developer Guide

This file provides guidance for AI agents working in this repository.

Always read the docs/*.md and CLAUDE.md files at the start of the conversation and follow the instructions in them.

---

## 1. Build / Lint / Test Commands

### Development
```bash
bun run start          # Start Electron app in dev mode
bun run package       # Package the app (no installer)
bun run make          # Build distributable installers
bun run publish       # Publish the app
```

### Code Quality
```bash
bun run lint          # Run ESLint on entire codebase
bun run typecheck     # Run TypeScript type checking (tsc --noEmit)
```

### Testing
```bash
bun run test          # Run all unit tests (Vitest)
bun run test:watch   # Run tests in watch mode
bun run test:ui      # Run tests with Vitest UI
bun run test:e2e     # Run Playwright E2E tests
```

#### Running a Single Test

**Vitest (unit tests):**
```bash
# By file path
bunx vitest run tests/utils/fileScanner.test.ts

# By test name pattern
bunx vitest run -t "scanDirectory"

# Single test within a file using --testNamePattern
bunx vitest run --testNamePattern "renders button"
```

**Playwright (E2E):**
```bash
# By file
bunx playwright test tests/e2e/login.spec.ts

# By test name
bunx playwright test -g "login flow"
```

---

## 2. Code Style Guidelines

### General Philosophy
- **Semantic HTML first** - Style elements, not just classes
- **Standard CSS Classes** - Use classes like `.button`, `.stack`, `.field`
- **Functional programming** - Prefer immutability, avoid mutations where possible

### File Organization
```
src/
├── app/
│   ├── components/    # UI components (atomic/, composite/)
│   ├── contexts/       # React contexts (Audio, Settings, UI, Library)
│   ├── hooks/         # Custom React hooks
│   ├── services/      # Business logic (audioEngine, fileScanner)
│   ├── styles/        # CSS files (tokens, base, components)
│   ├── utils/         # Utility functions
│   └── views/         # Page-level components
├── main.ts            # Electron main process
├── preload.ts         # Electron preload script
└── renderer.tsx      # React entry point
```

### TypeScript Conventions

**Types:**
- Use `readonly` for all interface properties
- Use explicit return types for exported functions
- Avoid `any` - use `unknown` when type is truly unknown

```typescript
// Good
interface Track {
  readonly id: string
  readonly path: string
  readonly title: string
}

function getTrack(id: string): Track | null { ... }

// Avoid
interface Track {
  id: string
  path: string
}
```

**Type Imports:**
- Use `import type { ... }` for types only
- Use regular `import { ... }` for values

```typescript
import type { Track } from './types'
import { useAudio } from './contexts'
```

### Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| Files | kebab-case | `file-scanner.ts`, `audio-engine.ts` |
| Components | PascalCase | `Button.tsx`, `PlayerView.tsx` |
| Hooks | camelCase with `use` prefix | `useLibraryScanner.ts` |
| Contexts | PascalCase with `Context` suffix | `AudioContext.tsx`, `useAudio` |
| Interfaces | PascalCase, descriptive | `AudioState`, `Track`, `FolderNode` |
| Constants | SCREAMING_SNAKE_CASE | `AUDIO_EXTENSIONS` |
| CSS classes | kebab-case | `.button`, `.primary`, `.stack` |

### Import Order (enforced by ESLint)

```typescript
// 1. Built-in Node.js
import path from 'node:path'
import fs from 'node:fs'

// 2. External libraries
import { useState, useCallback } from 'react'
import type { ReactNode } from 'react'

// 3. Internal - relative paths
import { useAudio } from '../contexts'
import { scanDirectory } from '../services'

// 4. CSS imports
import '../styles/app.css'
```

### Component Patterns

**Atomic Components:**
- Use class names for props (`.primary`, `.sm`, `.loading`)
- Pass through rest props to underlying element
- Use logic to join class names

```typescript
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: 'primary' | 'secondary' | 'danger'
  readonly size?: 'sm' | 'lg'
  readonly loading?: boolean
}

export function Button({ variant, size, loading, children, className = '', ...props }: ButtonProps) {
  const classes = ['button', variant, size, loading && 'loading', className].filter(Boolean).join(' ')
  return (
    <button
      className={classes}
      disabled={loading}
      {...props}
    >
      {children}
    </button>
  )
}
```

**Context Providers:**
- Always export both Provider and hook
- Throw descriptive error if hook used outside provider

```typescript
export function AudioProvider({ children }: { readonly children: ReactNode }) {
  // ... provider implementation
}

export function useAudio() {
  const context = useContext(AudioContext)
  if (!context) {
    throw new Error('useAudio must be used within AudioProvider')
  }
  return context
}
```

### CSS Guidelines

- Use CSS layers: `@layer tokens, reset, base, states, components, utilities`
- Use design tokens from `tokens.css`
- Prefer semantic HTML + standard classes
- Use standard CSS nesting

```css
@layer components {
  .button {
    /* base styles */
    
    &.primary {
      /* primary variant */
    }
  }
}
```

### Error Handling

- Use try/catch for async operations
- Log errors to console with descriptive messages
- Return default values on failure rather than throwing

```typescript
async function scanDirectory(rootPath: string) {
  try {
    const files = await window.electronAPI.scanDirectory(rootPath)
    return files
  } catch (error) {
    console.error('Error scanning directory:', error)
    return []
  }
}
```

### Testing Patterns

**Unit Tests (Vitest):**
- Test files go in `tests/` directory, mirroring `src/` structure
- Use `@testing-library/react` for component tests
- Mock `window.electronAPI` for Electron API calls

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Button } from '../../src/app/components/atomic/Button'

describe('Button', () => {
  it('renders button with children', () => {
    render(<Button>Click me</Button>)
    expect(screen.getByRole('button')).toHaveTextContent('Click me')
  })
  
  it('has correct class', () => {
    render(<Button variant="primary">Click me</Button>)
    expect(screen.getByRole('button')).toHaveClass('primary')
  })
})
```

### ESLint Rules Summary

| Rule | Setting |
|------|---------|
| Semicolons | Never (`semi: ["warn", "never"]`) |
| Quotes | Single (`quotes: ["warn", "single"]`) |
| Indentation | 2 spaces |
| Max line length | 400 |
| Max complexity | 14 |
| Max statements per function | 40 |
| Arrow functions | Use `=>` without braces when possible |

---

## 3. Working with This Project

### Initializing for Development
When starting work in this codebase, initialize wcgw:
```bash
# Use wcgw_Initialize with the workspace path
any_workspace_path: "/Users/mia/Documents/Projects/desktop-audio"
```

### Key Technologies
- **Electron** - Desktop app framework
- **React 19** - UI library
- **Vite** - Build tool
- **TypeScript** - Type safety
- **Vitest** - Unit testing
- **Playwright** - E2E testing
- **Electron Forge** - App packaging

### TypeScript Configuration
- Target: ESNext
- Module: ESNext
- Strict mode enabled
- JSX: react-jsx

---

This file should be updated as project conventions evolve.
