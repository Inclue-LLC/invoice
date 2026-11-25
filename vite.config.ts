import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    // Firebase SDK だけで約 550kB あり、分割しても小さくならないため警告の基準を上げる
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: { manualChunks: { firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore'] } },
    },
  },
  test: {
    environment: 'node',
  },
} as never);
