import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { spawn } from 'child_process';
import net from 'net';
import { defineConfig } from 'vite';

function backendBridgePlugin() {
  return {
    name: 'backend-bridge-starter',
    configureServer() {
      const sock = new net.Socket();
      sock.setTimeout(500);
      sock.on('connect', () => {
        sock.destroy();
      });
      sock.on('error', () => {
        sock.destroy();
        console.log('[yebente] Auto-starting Daraja backend bridge (node server.js)...');
        const child = spawn('node', ['server.js'], {
          stdio: 'inherit',
          env: process.env,
        });
        process.on('exit', () => child.kill());
      });
      sock.connect(3001, '127.0.0.1');
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), backendBridgePlugin()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify: file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      proxy: {
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true,
        },
      },
    },
  };
});
