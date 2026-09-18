import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import { VitePWA } from 'vite-plugin-pwa';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sdkRoot = path.resolve(__dirname, '../../packages/sdk');

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // 'prompt', not 'autoUpdate'. autoUpdate reloads the page the instant a new build
      // activates, which here can mean losing a half-entered fare or a pickup pin. See
      // src/pwaUpdate.js -- the user is told and picks the moment.
      registerType: 'prompt',
      includeManifestIcons: false,
      // Important: make the PWA assets available in dev mode too.
      // Without this, /sw.js and /registerSW.js fall back to index.html.
      devOptions: {
        enabled: true,
        type: 'classic',
      },
      manifest: {
        id: '/',
        lang: 'en',
        name: 'Clutch Stage',
        short_name: 'Clutch',
        description: 'Clutch decentralized ride-sharing demo',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        display_override: ['standalone', 'browser'],
        orientation: 'portrait',
        prefer_related_applications: false,
        // The light palette's background. These were the dark theme's, which survived the toggle's
        // removal and would have shown a dark splash before a light app.
        background_color: '#f7f9ff',
        theme_color: '#f7f9ff',
        icons: [
          {
            src: '/favicon.ico',
            sizes: '64x64 32x32 24x24 16x16',
            type: 'image/x-icon',
            purpose: 'any',
          },
          {
            src: '/clutch-logo.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        navigateFallback: '/index.html',
      },
    }),
  ],
  resolve: {
    alias: {
      // Always use repo SDK + fresh dist (avoids stale Vite pre-bundle of an old version)
      'clutch-hub-sdk-js': sdkRoot,
    },
  },
  optimizeDeps: {
    exclude: ['clutch-hub-sdk-js'],
  },
});
