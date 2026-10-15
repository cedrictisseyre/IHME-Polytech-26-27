import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const basePath = (process.env.APP_BASE_PATH || '').replace(/\/$/, '');

export default defineConfig({
  base: `${basePath}/`,
  plugins: [react()],
  server: { port: 5173, proxy: { [`${basePath}/api`]: 'http://127.0.0.1:3000' } }
});
