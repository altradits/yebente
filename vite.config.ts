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
      sock.connect(3002, '127.0.0.1');
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
      proxy: {
        '/api': {
          target: 'http://localhost:3002',
          changeOrigin: true,
        },
      },
    },
  };
});
