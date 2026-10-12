import { defineConfig } from 'vite'
import { resolve } from 'node:path'

export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      // The game, plus the creator stats panel at /stats
      input: { main: resolve(__dirname, 'index.html'), stats: resolve(__dirname, 'stats.html') },
    },
  },
})
