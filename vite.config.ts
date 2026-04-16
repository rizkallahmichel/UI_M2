/// <reference types="vitest/config" />

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const coverageStatements = Number(process.env.UI_COVERAGE_STATEMENTS ?? 35)
const coverageBranches = Number(process.env.UI_COVERAGE_BRANCHES ?? 45)
const coverageFunctions = Number(process.env.UI_COVERAGE_FUNCTIONS ?? 45)
const coverageLines = Number(process.env.UI_COVERAGE_LINES ?? 35)

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          recharts: ['recharts'],
          reactVendor: ['react', 'react-dom', '@tanstack/react-query'],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['tests/e2e/**/*'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      thresholds: {
        statements: coverageStatements,
        branches: coverageBranches,
        functions: coverageFunctions,
        lines: coverageLines,
      },
    },
  },
})
