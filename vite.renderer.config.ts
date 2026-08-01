import { defineConfig } from 'vite'


export default defineConfig(async ({ command }) => {
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
  if (command === 'serve' && process.env.VITE_BRIDGE === 'browser') {
    const { default: mkcert } = await import('vite-plugin-mkcert')
    plugins.push(mkcert())
  }

  return {
    plugins,
    optimizeDeps: {
      exclude: ['animejs'],
    },
  }
})
