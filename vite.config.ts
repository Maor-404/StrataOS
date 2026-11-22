import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const crossOriginIsolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    headers: crossOriginIsolationHeaders,
  },
  preview: {
    headers: crossOriginIsolationHeaders,
  },
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    exclude: ['unkernel'],
  },
  build: {
    target: 'esnext',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('@xterm')) {
            return 'vendor-terminal'
          }
          if (id.includes('@codemirror') || id.includes('/codemirror/') || id.includes('@lezer')) {
            return 'vendor-codemirror'
          }
          if (
            id.includes('node_modules/react') ||
            id.includes('node_modules/lucide-react') ||
            id.includes('node_modules/zustand') ||
            id.includes('node_modules/immer') ||
            id.includes('node_modules/@tanstack/react-virtual')
          ) {
            return 'vendor-ui'
          }
          return undefined
        },
      },
    },
  },
})
