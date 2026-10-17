/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import crypto from 'crypto';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command, mode }) => {
  const isDev = command === 'serve';

  return {
    build: {
      sourcemap: false,
    },
    plugins: [
      react(),
      {
        name: 'html-transform-csp',
        transformIndexHtml(html: string, ctx) {
          let modified = html;
          const devMode = isDev || Boolean(ctx?.server);

          if (devMode) {
            // Development: Allow blob: for Vite HMR and local server API ports
            modified = modified.replace(
              /script-src 'self' 'unsafe-inline'/,
              "script-src 'self' 'unsafe-inline' blob:",
            );
            modified = modified.replace(
              /connect-src ([^;]+);/,
              (match: string, current: string) => `${match.slice(0, -1)} http://localhost:3333 http://127.0.0.1:3333;`,
            );
          } else {
            // Production: Calculate SHA-256 hash of the inline theme script and replace 'unsafe-inline'
            const inlineScriptMatch = modified.match(/<script>([\s\S]*?)<\/script>/);
            if (inlineScriptMatch) {
              const scriptBody = inlineScriptMatch[1];
              const hash = crypto.createHash('sha256').update(scriptBody, 'utf8').digest('base64');
              modified = modified.replace(
                /script-src 'self' 'unsafe-inline'/,
                `script-src 'self' 'sha256-${hash}'`,
              );
            }
          }
          return modified;
        },
      },
      {
        name: 'clean-production-bundle',
        renderChunk(code: string) {
          if (command === 'build') {
            return code
              .replace(/http:\/\/localhost:?\d*/g, 'https://api.jsnc.co.in')
              .replace(/localhost/g, '127.0.0.1');
          }
          return null;
        },
      },
      {
        name: 'frame-security-headers',
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            const url = req.url || '';
            res.setHeader('X-Content-Type-Options', 'nosniff');
            res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
            if (url.startsWith('/inquiry') || url.startsWith('/quote-request')) {
              res.setHeader('Content-Security-Policy', "frame-ancestors *;");
            } else {
              res.setHeader('X-Frame-Options', 'SAMEORIGIN');
            }
            next();
          });
        },
      },
    ],
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: 'http://localhost:3333',
          changeOrigin: true,
        },
        '/uploads': {
          target: 'http://localhost:3333',
          changeOrigin: true,
        },
      },
    },
  };
});
