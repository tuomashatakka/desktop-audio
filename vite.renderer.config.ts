import { defineConfig } from 'vite'
import mkcert from 'vite-plugin-mkcert'


export default defineConfig(async () => {
  const react = (await import('@vitejs/plugin-react')).default
  return {
    plugins: [react(), mkcert()],
    optimizeDeps: {
      exclude: ['animejs'],
    },
  }
})
