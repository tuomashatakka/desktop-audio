import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { CUSTOM_THEME_VARIABLES } from '../../src/app/utils/theme'


const STYLES_DIR = join(__dirname, '../../src/app/styles')
const TOKENS_CSS = readFileSync(join(STYLES_DIR, 'tokens.css'), 'utf8')

function cssFiles (): string[] {
  return readdirSync(STYLES_DIR)
    .filter(f => f.endsWith('.css'))
    .map(f => join(STYLES_DIR, f))
}

describe('token contract', () => {
  it('every CUSTOM_THEME_VARIABLE is declared in tokens.css', () => {
    for (const name of CUSTOM_THEME_VARIABLES) {
      // Match `--foo:` or `--foo :` anywhere in tokens.css
      expect(TOKENS_CSS).toMatch(new RegExp(`${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:`))
    }
  })

  it('no bare :root or [data-theme selector outside tokens.css (except documented exceptions)', () => {
    const violations: string[] = []

    for (const filePath of cssFiles()) {
      if (filePath.endsWith('tokens.css')) continue

      const content = readFileSync(filePath, 'utf8')
      const lines = content.split('\n')
      const fileName = filePath.split('/').pop()!

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]

        // Check for :root selectors
        if (/[:@]\s*root\b/.test(line) || /^\s*:root\b/.test(line)) {
          // Exception: :root[data-runtime='browser'] in layout.css
          if (/root\[data-runtime=.browser.\]/.test(line)) continue

          // Exception: :root[data-art-tick=...] in layout.css
          if (/root\[data-art-tick/.test(line)) continue

          // Exception: :root inside @media (prefers-reduced-motion) in layout.css
          // There is only one such :root — it sets `transition: none` to flatten
          // motion at the token level for reduced-motion users.
          if (fileName === 'layout.css' && /transition:\s*none/.test(line)) continue

          // Exception: :root in tokens.css's @media (prefers-reduced-motion) block
          // (tokens.css is already skipped above, so this won't trigger)

          violations.push(`${fileName}:${i + 1}: ${line.trim()}`)
        }

        // Check for [data-theme selectors
        if (/\[data-theme/.test(line)) {
          // Exception: nested [data-theme='light'] & inside a component rule in layout.css
          // This is the img filter override at line 586: `  [data-theme='light'] & {`
          if (/\[data-theme=.light.\]\s*&/.test(line)) continue

          violations.push(`${fileName}:${i + 1}: ${line.trim()}`)
        }
      }
    }

    expect(violations).toEqual([])
  })
})
