import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  assetsInclude: ['**/*.bin', '**/*.glsl'],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
  },
});
