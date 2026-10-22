import { defineConfig } from 'vite'
import { resolve } from 'node:path'

export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      // The game, the creator stats panel at /stats and the second screen at /duo/ (its own app scope)
      input: { main: resolve(__dirname, 'index.html'), stats: resolve(__dirname, 'stats.html'), duo: resolve(__dirname, 'duo.html') },
    },
  },
})
