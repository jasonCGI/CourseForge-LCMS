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
    // Don't <link rel=modulepreload> the lazy editor/block chunks — let them load on
    // demand when a frame that uses them is opened, so first paint only pulls the
    // entry + the eagerly-needed tree (dnd). Without this Vite preloads the ~128KB
    // tiptap 'editor' chunk on every cold load before any text frame is even opened.
    modulePreload: {
      resolveDependencies(filename, deps) {
        return deps.filter(d => !/\/(editor|videojs|TextBlock|Model3DBlock|IVideoBlock|OamBlock|GUIBlock)-[A-Za-z0-9_]+\.js$/.test(d))
      },
    },
    rollupOptions: {
      output: {
        // Split only the big, well-isolated leaf libs out of the entry chunk
        // (the bundle was one ~1.6MB file). React + everything else stays in the
        // entry — hand-splitting react/vendor caused a cross-chunk init TDZ.
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('video.js') || id.includes('@videojs') || id.includes('mux.js')) return 'videojs'
          // NB: don't force @tiptap/prosemirror into a named chunk — that made rollup
          // hoist it as an EAGER shared chunk loaded on first paint. Leaving it
          // un-named lets it fold into the lazy TextBlock chunk, so it only loads
          // when a text frame is actually opened.
          if (id.includes('@dnd-kit') || id.includes('react-dnd') || id.includes('react-arborist')) return 'dnd'
        },
      },
    },
  }
})
