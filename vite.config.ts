import fs from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { codeInspectorPlugin } from 'code-inspector-plugin'

// Dev only: lets the hidden test-data menu ("Save current banners to the project", see
// src/lib/test-playground.ts) write the current banners to public/test-playground.json, so they
// can be committed and loaded from any browser.
function testPlaygroundFile(): Plugin {
  return {
    name: 'test-playground-file',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__test-playground', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end()
          return
        }
        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', () => {
          try {
            JSON.parse(body)
            fs.writeFileSync(path.resolve(__dirname, 'public/test-playground.json'), body)
            res.end('ok')
          } catch {
            res.statusCode = 400
            res.end('invalid JSON')
          }
        })
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    // Dev only: hold ⌥ Option + ⇧ Shift and click anything in the app to open the exact line that
    // renders it in VS Code. Not part of production builds. Opened through VS Code's own
    // `vscode://` link (macOS), so it works without the `code` command being installed.
    codeInspectorPlugin({ bundler: 'vite', editor: 'code', launchType: 'open' }),
    testPlaygroundFile(),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
