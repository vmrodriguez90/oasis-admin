import { defineConfig } from 'vitest/config'

// Tests de firestore.rules. Necesitan el emulador: correlos con `npm run test:rules`.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 20000,
    fileParallelism: false,
  },
})
