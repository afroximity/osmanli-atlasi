import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // GitHub Pages serves the app under /<repo>/; the deploy workflow sets BASE
  base: process.env.BASE ?? '/',
  plugins: [react()],
  server: { port: 5173 },
});
