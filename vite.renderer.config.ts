import { defineConfig } from 'vite'

export default defineConfig(async () => {
  const react = (await import('@vitejs/plugin-react')).default
  return {
    plugins: [react()],
    optimizeDeps: {
      exclude: ['animejs'],
    },
  }
})
