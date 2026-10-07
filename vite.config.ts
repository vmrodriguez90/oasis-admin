import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    // Firebase pesa más que toda la app junta: va en su propio archivo, así una
    // actualización del admin no obliga a bajarlo de nuevo.
    chunkSizeWarningLimit: 700,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'firebase', test: /node_modules[\\/](@firebase|firebase)[\\/]/ },
            { name: 'vendor', test: /node_modules[\\/]/ },
          ],
        },
      },
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
})
