import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

const base = process.env.VITE_BASE || '/Graphic_app/'

export default defineConfig({
  base,
  plugins: [
    react(),
    {
      name: 'version-json',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'version.json',
          source: JSON.stringify({ sha: process.env.GITHUB_SHA || 'dev' }),
        })
      },
    },
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'qa/**/*.test.ts'],
  },
})
