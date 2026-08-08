import { defineConfig } from 'vite'


export default defineConfig(async ({ command }) => {
  const isBrowser = process.env.VITE_BRIDGE === 'browser'
  const isWebBuild = command === 'build' && isBrowser
  const react = (await import('@vitejs/plugin-react')).default
  const plugins = [react()]

  // mkcert only matters for `bun run dev:web` (VITE_BRIDGE=browser), which
  // serves the renderer to a real browser over HTTPS.
  //
  // It must NOT run under `electron-forge start`: forge also uses command
  // === 'serve' there, but it builds MAIN_WINDOW_VITE_DEV_SERVER_URL with a
  // hardcoded `http://` scheme. mkcert flips the server to HTTPS, so the
  // main process loads http:// against an HTTPS server and the window dies
  // with ERR_EMPTY_RESPONSE.
  //
  // It also pulls undici under bun and breaks
  // `webidl.util.markAsUncloneable`, so it stays out of `vite build` too.
  if (command === 'serve' && isBrowser) {
    const { default: mkcert } = await import('vite-plugin-mkcert')
    plugins.push(mkcert())
  }

  return {
    // GitHub Pages hosts the browser build below /app/. Relative asset URLs
    // keep the artifact portable across project-page and custom-domain roots.
    ...(isWebBuild
      ? {
        base:      './',
        publicDir: false,
      }
      : {}),
    plugins,
    // Bind dual-stack. Vite's default resolves `localhost` to a single family
    // (here `::1`), while Forge freezes the literal string
    // `http://localhost:<port>` into the main bundle — so whether the window
    // loaded came down to which family Chromium happened to try, and a refused
    // connection on a transparent frameless window looks like no window at all.
    // `::` accepts IPv4-mapped connections too, so both spellings answer.
    server: { host: '::' },
    build: {
      ...(isWebBuild
        ? {
          outDir:      'dist/web',
          emptyOutDir: true,
        }
        : {}),
      target:    'chrome146',
      cssTarget: 'chrome146',
    },
    optimizeDeps: {
      exclude: ['animejs'],
    },
  }
})
