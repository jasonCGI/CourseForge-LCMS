import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      }
    }
  },
  build: {
    outDir: '../client/dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // Split only the big, well-isolated leaf libs out of the entry chunk
        // (the bundle was one ~1.6MB file). React + everything else stays in the
        // entry — hand-splitting react/vendor caused a cross-chunk init TDZ.
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('video.js') || id.includes('@videojs') || id.includes('mux.js')) return 'videojs'
          if (id.includes('@tiptap') || id.includes('prosemirror')) return 'editor'
          if (id.includes('@dnd-kit') || id.includes('react-dnd') || id.includes('react-arborist')) return 'dnd'
        },
      },
    },
  }
})
