import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import pkg from './package.json' with { type: 'json' }

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    vue(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        timeline: resolve(__dirname, 'timeline.html'),
        editItem: resolve(__dirname, 'editItem.html'),
        calendar: resolve(__dirname, 'calendar.html'),
        yearCalendar: resolve(__dirname, 'yearCalendar.html'),
        characters: resolve(__dirname, 'characters.html'),
        relations: resolve(__dirname, 'relations.html'),
        map: resolve(__dirname, 'map.html'),
        mapCast: resolve(__dirname, 'mapCast.html'),
        archive: resolve(__dirname, 'archive.html')
      }
    }
  }
})
