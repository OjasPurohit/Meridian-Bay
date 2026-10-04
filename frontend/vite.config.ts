import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, r('.'), 'VITE_');
  // The dev server talks to the local backend unless preview mode is chosen on purpose with `--mode preview` (
  // or `npm run dev:preview`). Builds keep whatever the environment says.
  const api = env.VITE_API_BASE_URL ?? process.env.VITE_API_BASE_URL ?? (command === 'serve' && mode !== 'preview' ? 'http://localhost:4000' : '');
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': r('./src'),
        '@shared': r('../shared'),
        '@mock': r('../mock-data'),
      },
    },
    define: { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify(api) },
    server: { port: 5173, fs: { allow: ['..'] } },
  };
});
