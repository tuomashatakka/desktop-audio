import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      // better-sqlite3 is a native .node module — must not be bundled
      external: ['better-sqlite3'],
    },
  },
});
