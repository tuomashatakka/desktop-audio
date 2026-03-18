# Universal Design System

A minimal, dark-first design system. Framework-agnostic, semantic HTML-driven.

---

## Core Philosophy

1. **Semantic HTML first** — Style elements, not just classes
2. **Standard CSS Classes** — `.button`, `.stack`, `.field`
3. **CSS layers for cascade** — Predictable specificity
4. **Minimal footprint** — No dependencies, no build tools required
5. **Accessibility built-in** — Focus states, ARIA support, reduced motion

---

## Quick Start

```html
<!-- Single import -->
<link rel="stylesheet" href="main.css">

<!-- Or inline in <style> tag -->
```

```html
<!-- Just write semantic HTML with classes -->
<button class="button primary">Save</button>
<input class="input" type="email" placeholder="you@example.com">
<span class="badge success">Active</span>
```

---

## Architecture

### CSS Layer Order

```css
@layer tokens, reset, base, states, components, utilities;
```

| Layer | Purpose |
|-------|---------|
| `tokens` | CSS custom properties |
| `reset` | Normalize defaults |
| `base` | Element styles (button, input, h1, etc.) |
| `states` | Success, warning, error, info, loading |
| `components` | Badge, Card, Alert, etc. |
| `utilities` | Layout helpers, visibility |

### File Structure

```
css/
├── main.css        # Entry point
├── tokens.css      # Design tokens
├── reset.css       # CSS reset
├── base.css        # Element defaults
├── states.css      # State mixins
├── components.css  # Components
└── utilities.css   # Helpers
```

---

## Design Tokens

### Colors

```css
/* Backgrounds */
--bg: #121212;
--bg-raised: #1a1a1a;
--bg-input: #2a2a2a;
--bg-hover: #333333;

/* Accents */
--accent: #ff5500;
--accent-hover: #ff7733;
--accent-muted: rgba(255, 85, 0, 0.15);
--accent-alt: #3a86ff;

/* Semantic */
--success: #38b000;
--warning: #ffbe0b;
--danger: #ff006e;
--info: #3a86ff;

/* Text */
--text: #ffffff;
--text-dim: #cccccc;
--text-muted: #888888;

/* Borders */
--border: rgba(255, 255, 255, 0.1);
--border-hover: rgba(255, 255, 255, 0.2);
--border-focus: var(--accent);
```

### Typography

```css
/* Fonts */
--font: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
--font-mono: "SF Mono", Monaco, "Cascadia Code", monospace;

/* Sizes */
--text-xs: 10px;
--text-sm: 12px;
--text-base: 14px;
--text-lg: 16px;
--text-xl: 20px;
--text-2xl: 24px;
--text-3xl: 32px;

/* Weights */
--font-normal: 400;
--font-medium: 500;
--font-semibold: 600;
--font-bold: 700;
```

### Spacing

```css
/* Base: 4px */
--sp-1: 4px;
--sp-2: 8px;
--sp-3: 12px;
--sp-4: 16px;
--sp-6: 24px;
--sp-8: 32px;
--sp-12: 48px;
```

### Effects

```css
/* Radius */
--radius-sm: 2px;
--radius: 4px;
--radius-lg: 8px;
--radius-full: 9999px;

/* Shadows */
--shadow-sm: 0 1px 2px rgba(0,0,0,0.2);
--shadow: 0 2px 4px rgba(0,0,0,0.2), 0 1px 2px rgba(0,0,0,0.3);
--shadow-lg: 0 8px 16px rgba(0,0,0,0.2), 0 4px 8px rgba(0,0,0,0.3);

/* Transitions */
--ease: cubic-bezier(0.4, 0, 0.2, 1);
--duration-fast: 100ms;
--duration: 200ms;
--duration-slow: 300ms;
```

---

## Components

### Buttons

```html
<!-- Variants -->
<button class="button">Default</button>
<button class="button primary">Primary</button>
<button class="button danger">Danger</button>
<button class="button ghost">Ghost</button>
<button class="button outline">Outline</button>

<!-- Sizes -->
<button class="button sm">Small</button>
<button class="button lg">Large</button>

<!-- States -->
<button class="button" disabled>Disabled</button>
<button class="button loading">Loading</button>

<!-- Icon button -->
<button class="button icon">★</button>
```

### Inputs

```html
<!-- Text -->
<label class="field">
  <span>Email</span>
  <input class="input" type="email" placeholder="you@example.com">
</label>

<!-- With validation -->
<label class="field error">
  <span>Password</span>
  <input class="input" type="password" aria-invalid="true">
  <small>Must be 8+ characters</small>
</label>

<!-- Select -->
<label class="field">
  <span>Country</span>
  <select class="select">
    <option>Select...</option>
  </select>
</label>

<!-- Checkbox / Radio -->
<label><input type="checkbox"> Remember me</label>
<label><input type="radio" name="plan"> Basic</label>

<!-- Input group -->
<div class="input-group">
  <span class="prefix">$</span>
  <input class="input" type="number">
  <span class="suffix">.00</span>
</div>
```

### Badges

```html
<span class="badge">Default</span>
<span class="badge primary">Primary</span>
<span class="badge success">Success</span>
<span class="badge warning">Warning</span>
<span class="badge danger">Danger</span>
<span class="badge info">Info</span>

<!-- With dot -->
<span class="badge dot success">Online</span>

<!-- Sizes -->
<span class="badge sm">Small</span>
<span class="badge lg">Large</span>
```

### Cards

```html
<!-- Basic -->
<article class="card">
  <header>Title</header>
  <p>Content goes here.</p>
</article>

<!-- Variants -->
<article class="card outlined">...</article>
<article class="card elevated">...</article>

<!-- Interactive -->
<article class="card interactive">
  Clickable card
</article>

<!-- With footer -->
<article class="card">
  <header>Title</header>
  <p>Content</p>
  <footer>
    <button class="button ghost">Cancel</button>
    <button class="button primary">Save</button>
  </footer>
</article>
```

### Alerts

```html
<aside class="alert">
  <strong>Info</strong>
  Informational message.
</aside>

<aside class="alert success">
  <strong>Success!</strong>
  Operation completed.
</aside>

<aside class="alert warning">
  <strong>Warning</strong>
  Please review.
</aside>

<aside class="alert danger">
  <strong>Error</strong>
  Something went wrong.
</aside>
```

### More Components

```html
<!-- Chip/Tag -->
<span class="chip">
  Tag <button>×</button>
</span>

<!-- Avatar -->
<span class="avatar">JD</span>
<span class="avatar sm">A</span>
<span class="avatar lg">XL</span>

<!-- Skeleton -->
<div class="skeleton"></div>

<!-- Tooltip -->
<span class="tooltip" data-tooltip="Helpful info">Hover me</span>
```

---

## State Mixins

Apply states using classes:

```html
<!-- On containers -->
<label class="field error">
  <span>Field</span>
  <input class="input" type="text">
  <small>Error message</small>
</label>

<article class="card success">
  Success state card
</article>

<!-- On inputs directly -->
<input class="input warning">
<input class="input" aria-invalid="true">  <!-- Also triggers error state in some implementations -->

<!-- Loading state -->
<button class="button loading">Processing</button>
<div class="loading">Loading content...</div>
```

### Available States

| Class | Effect |
|-----------|--------|
| `.success` | Green border/background |
| `.warning` | Yellow border/background |
| `.error` | Red border/background |
| `.info` | Blue border/background |
| `.loading` | Spinner overlay, disabled |
| `disabled` | Opacity 0.5, no interaction |

---

## Layout Utilities

```html
<!-- Vertical stack -->
<div class="stack">
  <p>Item 1</p>
  <p>Item 2</p>
</div>
<div class="stack sm">Tight spacing</div>
<div class="stack lg">Loose spacing</div>

<!-- Horizontal cluster -->
<div class="cluster">
  <button class="button">A</button>
  <button class="button">B</button>
</div>

<!-- Auto grid -->
<div class="grid">
  <article class="card">1</article>
  <article class="card">2</article>
  <article class="card">3</article>
</div>

<!-- Visibility -->
<div hidden>Hidden</div>
<div class="hidden">Also hidden</div>
```

---

## Typography

All heading and text elements are styled by default:

```html
<h1>Page Title (32px)</h1>
<h2>Section Title (24px)</h2>
<h3>Subsection (20px)</h3>
<h4>Component Title (16px)</h4>
<h5>LABEL STYLE (14px, uppercase)</h5>

<p>Body text with <strong>bold</strong> and <em>italic</em>.</p>
<p><small>Muted caption text</small></p>
<p><a href="#">Hyperlink</a></p>
<p><code>inline code</code></p>
<p>Press <kbd>Ctrl</kbd> + <kbd>S</kbd></p>

<pre><code>Code block</code></pre>

<blockquote>
  Quote text
  <cite>Author</cite>
</blockquote>
```

---

## Framework Integration

### Vanilla JS

```html
<button id="submit" class="button primary">Submit</button>
<script>
  document.getElementById('submit').addEventListener('click', (e) => {
    e.target.classList.add('loading')
  })
</script>
```

### React

```tsx
interface ButtonProps {
  variant?: 'primary' | 'danger' | 'ghost'
  size?: 'sm' | 'lg'
  loading?: boolean
  children: React.ReactNode
}

function Button({ variant, size, loading, children, ...props }: ButtonProps) {
  const classes = ['button', variant, size, loading && 'loading'].filter(Boolean).join(' ')
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

---

## Accessibility

- **Focus visible** — Clear outline on keyboard navigation
- **Reduced motion** — Respects `prefers-reduced-motion`
- **ARIA support** — `aria-invalid`, `aria-disabled` trigger states
- **Semantic HTML** — Proper element usage throughout
- **Color contrast** — WCAG AA compliant

---

## Browser Support

- Chrome/Edge 88+
- Firefox 78+
- Safari 14+

Requires support for:
- CSS Custom Properties
- CSS Nesting
- `@layer`
- `:has()`, `:where()`

---

## Customization

Override tokens in your own CSS:

```css
:root {
  --accent: #6366f1;  /* Change primary color */
  --bg: #0a0a0a;      /* Darker background */
  --radius: 8px;      /* Rounder corners */
}
```

---

That's it! Semantic HTML + class names = minimal, maintainable styles ♪(´▽｀)
