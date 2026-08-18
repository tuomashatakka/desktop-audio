# Design Principles

Core philosophy and guiding principles for this project.

---

## Architecture Invariants

Two rules are enforced by convention and, where noted, by tests. Every
stylesheet, hook, and component must respect them.

### 1. One token contract

**Every** CSS custom property and every theme-dependent selector (`:root`,
`[data-theme=…]`, `[data-ui-density]`, `[data-corners]`) lives in
`src/app/styles/tokens.css` and nowhere else. No other stylesheet declares
`--*` on `:root` or branches on `data-theme`. This is the single source of
truth for all colours, spacing, type, motion, shadows, and ambient-wash
parameters.

A test in `tests/` parses every stylesheet and asserts no `:root` or
`[data-theme` selector appears outside `tokens.css`.

### 2. One writer for `--accent`

`useAppearance` (`src/app/hooks/useAppearance.ts`) is the sole writer of
`--accent` on `document.documentElement`. When the accent source is set to
artwork, `useAmbientPalette` *returns* a palette object — it does not write
the property. Two hooks writing the same custom property on the same element
is a race whose winner depends on effect ordering; the single-writer rule
eliminates that.

---

## Philosophy

This project is built on three fundamental principles:

### 1. **Semantic HTML First**

HTML5 provides semantic elements that convey meaning and structure. Use them
instead of recreating the wheel:

- `<article>` for independent, self-contained content
- `<section>` for thematic groupings
- `<nav>` for navigation links
- `<main>` for primary content
- `<header>` and `<footer>` for structural landmarks
- `<aside>` for tangential content
- `<time>` for temporal information
- `<dl>`, `<dt>`, `<dd>` for definition lists

**Benefits:**
- Better accessibility
- Improved SEO
- Cleaner code
- Browser default styling
- Easier maintenance

### 2. **Cascading Style Sheets (CSS)**

> CSS is not the enemy. Tailwind is the problem.

Use CSS the way it was designed: cascading, composable, and maintainable.

**Why we avoid utility-first frameworks:**
- Class name bloat (100+ characters per element)
- Difficult to maintain
- Loss of CSS benefits (cascading, inheritance, scoping)
- Vendor lock-in
- Learning curve for what CSS already does

**Our approach:**
- CSS custom properties for theming (all in `tokens.css`)
- Native CSS nesting (Vite targets `chrome146`)
- `@layer` for predictable cascade ordering
- `@property` for type-safe, interpolatable custom properties
- Semantic selectors
- Global element styles
- Component-specific styles in separate files

### 3. **Opinionated Linting**

> If it hurts, it's for a reason.

Strict linting enforces consistency and catches errors early:

- Functional components only
- Strict TypeScript
- No `any` — use `unknown` or specific types
- No unnecessary complexity

---

## Design System Principles

### Consistency

Use design tokens for all visual properties. Every token is declared in
`tokens.css` — see `docs/STYLE_GUIDE.md` for the full list.

```css
/* ☑︎ Good - Using design tokens */
.button {
  padding: var(--sp-2) var(--sp-4);
  background-color: var(--accent);
  border-radius: var(--radius);
}

/* ☒ Bad - Magic numbers */
.button {
  padding: 8px 16px;
  background-color: #00e5d1;
  border-radius: 4px;
}
```

### Simplicity

Minimize complexity at every level:

- **Components**: Single responsibility
- **Props**: Only what's necessary
- **State**: Local when possible, global when needed
- **Styles**: Leverage cascading and inheritance

```tsx
// ☑︎ Good - Simple component
export function Badge({ variant = 'neutral', children }: BadgeProps) {
  return <span className={`badge ${variant}`}>{children}</span>
}

// ☒ Bad - Over-engineered
export function Badge({
  variant = 'neutral',
  size = 'md',
  rounded = false,
  outlined = false,
  elevated = false,
  className = '',
  ...props
}: BadgeProps) {
  const classes = classNames(
    'badge',
    `badge--${variant}`,
    `badge--${size}`,
    { 'badge--rounded': rounded },
    { 'badge--outlined': outlined },
    { 'badge--elevated': elevated },
    className
  )
  return <span className={classes} {...props} />
}
```

### Accessibility First

Design with accessibility in mind from the start:

- Semantic HTML
- ARIA labels where needed
- Keyboard navigation
- Focus indicators
- Color contrast
- Screen reader support

```tsx
// ☑︎ Good - Accessible button
export function IconButton({ label, icon, onClick }: IconButtonProps) {
  return (
    <button aria-label={label} onClick={onClick}>
      {icon}
    </button>
  )
}

// ☒ Bad - No accessibility
export function IconButton({ icon, onClick }: IconButtonProps) {
  return <div className="button" onClick={onClick}>{icon}</div>
}
```

### Performance

Optimize for performance without premature optimization:

- Code splitting at route level
- Memoize expensive calculations
- Virtualize long lists
- Lazy load non-critical components
- Minimize re-renders

```tsx
// ☑︎ Good - Memoized calculation
const sortedItems = useMemo(
  () => items.sort((a, b) => a.name.localeCompare(b.name)),
  [items]
)

// ☒ Bad - Recalculates on every render
const sortedItems = items.sort((a, b) => a.name.localeCompare(b.name))
```

---

## Component Architecture

### Atomic Design

Components are organized by complexity:

```
atomic/      → Smallest units (Button, Input, Badge)
composite/   → Functional groups (Card, Form, Modal)
page/        → Route-level (Dashboard, Settings)
view/        → Layout (Main, Sidebar, Header)
```

**Benefits:**
- Clear hierarchy
- Easy to find components
- Encourages reusability
- Scales with complexity

### Composition Over Configuration

Build complex UIs by composing simple components:

```tsx
// ☑︎ Good - Composition
<Card>
  <Card.Header>
    <h3>Title</h3>
  </Card.Header>
  <Card.Content>
    <p>Content goes here</p>
  </Card.Content>
  <Card.Footer>
    <Button>Action</Button>
  </Card.Footer>
</Card>

// ☒ Bad - Configuration
<Card
  title="Title"
  content="Content goes here"
  footer={<Button>Action</Button>}
  headerAlign="left"
  contentPadding="md"
  footerBorder={true}
/>
```

### Export Variants

Reduce prop drilling by exporting common variants:

```tsx
export function Button({ variant = 'primary', ...props }: ButtonProps) {
  return <button className={`button ${variant}`} {...props} />
}

// Export common variants
export const ButtonPrimary = (props) => <Button variant="primary" {...props} />
export const ButtonSecondary = (props) => <Button variant="secondary" {...props} />
export const ButtonGhost = (props) => <Button variant="ghost" {...props} />
```

---

## State Management

### Local vs Global

**Use local state** (`useState`) for:
- UI-only state (open/closed, selected tab)
- Form inputs
- Component-specific state

**Use context** (`createContext` + custom hooks) for:
- App-wide settings (`SettingsContext`)
- Audio state (`AudioContext`)
- Library state (`LibraryContext`)
- UI state (`UIContext`)

### Derived State

Prefer `useMemo` over `useEffect` for derived state:

```tsx
// ☑︎ Good - Derived state
const activeItems = useMemo(
  () => items.filter(item => item.active),
  [items]
)

// ☒ Bad - useEffect
const [activeItems, setActiveItems] = useState([])
useEffect(() => {
  setActiveItems(items.filter(item => item.active))
}, [items])
```

---

## Styling Philosophy

### CSS Nesting

Use native CSS nesting for organization (Vite targets `chrome146`):

```css
.card {
  background: var(--bg-raised);
  padding: var(--sp-4);

  & header {
    border-bottom: 1px solid var(--border);
    margin-bottom: var(--sp-2);

    & h3 {
      font-size: var(--text-lg);
    }
  }

  & .content {
    color: var(--text-dim);
  }
}
```

### No BEM

Simple class names with nesting instead of BEM:

```css
/* ☑︎ Good - Simple classes with nesting */
.button {
  &.primary { }
  &.secondary { }
  &.sm { }
  &.lg { }
}

/* ☒ Bad - BEM */
.button--primary { }
.button--secondary { }
.button--sm { }
.button--lg { }
```

### Global Element Styles

Define base styles for HTML elements in `base.css`:

```css
button {
  font-family: inherit;
  cursor: pointer;
  transition: var(--duration-fast) var(--ease);
}

input {
  font-family: inherit;
  border: 1px solid var(--border);
  padding: var(--sp-1);
}
```

This reduces the need for utility classes and keeps components clean.

---

## TypeScript Best Practices

### Strict Mode

Always use strict TypeScript:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

### Type Imports

Use type imports for type-only imports:

```typescript
import type { User, Post } from './types'
import { api } from './api'
```

### No `any`

Never use `any`. Use specific types or `unknown`:

```typescript
// ☑︎ Good
function handleError(error: unknown) {
  if (error instanceof Error) {
    console.error(error.message)
  }
}

// ☒ Bad
function handleError(error: any) {
  console.error(error.message)
}
```

---

## Code Organization

### File Structure

Organize by feature/domain:

```
src/app/
├── components/
│   ├── atomic/          # Smallest units (Button, Input, Rating)
│   └── composite/       # Functional groups (Player, Card, DspPanel)
├── contexts/            # React context providers
├── hooks/               # Custom hooks
├── layout/              # App shell, titlebar, overlays
├── services/            # Business logic (audio, DSP, analysis)
├── styles/              # CSS entry point, tokens, fonts
├── utils/               # Pure helpers (color, theme, time)
└── views/               # Route-level pages (Library, Settings, NowPlaying)
```

### Naming Conventions

- **Files**: PascalCase for components, camelCase for utilities
- **Directories**: kebab-case
- **Components**: PascalCase
- **Functions**: camelCase
- **Constants**: SCREAMING_SNAKE_CASE

---

## Testing Philosophy

### Type Safety First

TypeScript catches most bugs before runtime:

```typescript
// Type errors caught at compile time
interface User {
  id: number
  name: string
}

function greet(user: User) {
  return `Hello, ${user.name}`
}

greet({ id: 1, name: 'Alice' }) // ☑︎
greet({ id: 1 }) // ☒ Type error
```

### Manual Testing

For UI components, manual testing in the browser is often sufficient:

1. Start dev server
2. Test all variants
3. Test responsive behavior
4. Test accessibility (keyboard, screen reader)

---

## Performance Guidelines

### Lazy Loading

Load heavy views on demand:

```tsx
import { lazy, Suspense } from 'react'

const DspView = lazy(() => import('./views/DspView'))

function App() {
  return (
    <Suspense fallback={<Loading />}>
      <DspView />
    </Suspense>
  )
}
```

### Memoization

Use `useMemo` and `useCallback` strategically:

```tsx
// Expensive calculation
const sortedData = useMemo(
  () => data.sort((a, b) => a.value - b.value),
  [data]
)

// Stable callback
const handleClick = useCallback(
  (id: number) => console.log('Clicked:', id),
  []
)
```

### Virtualization

Use virtualization for long lists:

```tsx
import { useVirtualizer } from '@tanstack/react-virtual'

const virtualizer = useVirtualizer({
  count: items.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 50,
})
```

---

## Summary

**Invariants (enforced by convention + tests):**
1. **One token contract** — all custom properties live in `tokens.css`, nowhere else
2. **One writer for `--accent`** — `useAppearance` only; `useAmbientPalette` returns, never writes

**Core Values:**
1. **Simplicity** - Minimize complexity
2. **Consistency** - Use design tokens from `tokens.css`
3. **Accessibility** - Design for everyone
4. **Performance** - Optimize smartly
5. **Maintainability** - Code for humans

**Key Practices:**
- Semantic HTML
- CSS custom properties and native nesting
- `@layer` architecture
- `@property` for interpolatable tokens
- Atomic design
- Strict TypeScript
- Minimal state management via React context
- Composition over configuration

**Avoid:**
- Utility-first CSS frameworks
- Over-engineering
- Premature optimization
- Magic numbers
- Inline styles
- Class components
- `any` types
- Token declarations outside `tokens.css`
