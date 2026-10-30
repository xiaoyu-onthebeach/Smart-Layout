import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { codeInspectorPlugin } from 'code-inspector-plugin'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    // Dev only: hold ⌥ Option + ⇧ Shift and click anything in the app to open the exact line that
    // renders it in VS Code. Not part of production builds.
    codeInspectorPlugin({ bundler: 'vite', editor: 'code' }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
