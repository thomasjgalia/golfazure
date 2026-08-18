import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  server: {
    port: 5173,
    proxy: {
      // Mirrors Azure Static Web Apps' hosted behavior, where the app and
      // its linked API share one origin - locally, `func start` serves the
      // API on 7071, so forward /api there instead of 404ing against Vite.
      '/api': { target: 'http://localhost:7071', changeOrigin: true },
    },
  },
})

