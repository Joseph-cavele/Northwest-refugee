import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // Mirrors `paths` in tsconfig.app.json. TypeScript resolves `@/…` for the editor and
    // the typecheck, but the bundler does not read tsconfig paths — without this the app
    // compiles clean and then fails at build time on every aliased import.
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    // The API is same-origin in the browser during development, so the httpOnly refresh
    // cookie (Path=/api/v1/auth, SameSite=Lax) is sent without any CORS relaxation.
    proxy: {
      '/api': { target: 'http://localhost:5000', changeOrigin: true },
    },
  },
  build: { outDir: 'dist', sourcemap: true },
});
