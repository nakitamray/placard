import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Served from a domain root locally and in most hosts, but from /<repo>/ on
  // GitHub Pages. Every generated-asset URL goes through src/lib/asset.ts, so
  // setting this is all that is needed to move the site under a subpath.
  base: process.env.BASE_PATH || '/',
  plugins: [react()],
  assetsInclude: ['**/*.bin', '**/*.glsl'],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        /**
         * Split the renderer away from the exhibition.
         *
         * three plus drei is the great majority of the bundle and changes only
         * when a dependency is upgraded, while the exhibition itself changes
         * every time a placard is edited. Shipping them as one file means every
         * copy edit invalidates a megabyte of cache for every returning
         * visitor. Split, the vendor chunk is fetched once and reused, and the
         * two download in parallel on a first visit.
         */
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('three')) return 'three';
          if (id.includes('@react-three')) return 'r3f';
          if (id.includes('gsap')) return 'gsap';
          if (id.includes('react') || id.includes('scheduler')) return 'react';
        },
      },
    },
  },
});
