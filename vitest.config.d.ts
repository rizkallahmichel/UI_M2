import type { InlineConfig } from 'vitest'

declare module 'vite' {
  interface UserConfig {
    test?: InlineConfig
  }
}
