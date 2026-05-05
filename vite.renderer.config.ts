import { defineConfig } from 'vite'


export default defineConfig(async ({ command }) => {
  const react = (await import('@vitejs/plugin-react')).default
  const plugins = [react()]

  // mkcert only matters for `vite dev` (HTTPS dev server). It pulls undici
  // under bun and breaks `webidl.util.markAsUncloneable`, so skip it during
  // `vite build` / electron-forge make.
  if (command === 'serve') {
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
