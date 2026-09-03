import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'robots.txt', 'icons/*.svg'],
      manifest: {
        name: 'TradeMind OS',
        short_name: 'TradeMind',
        description: 'A behavioral operating system for disciplined traders',
        theme_color: '#070c18',
        background_color: '#070c18',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: '/icons/icon-192.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: '/icons/icon-512.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
        categories: ['finance', 'productivity'],
        shortcuts: [
          {
            name: 'Log Trade',
            short_name: 'Trade',
            description: 'Quickly log a new trade',
            url: '/trade',
            icons: [{ src: '/icons/icon-192.svg', sizes: '192x192' }],
          },
          {
            name: 'Daily Plan',
            short_name: 'Plan',
            description: 'View or create today\'s plan',
            url: '/plan',
            icons: [{ src: '/icons/icon-192.svg', sizes: '192x192' }],
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^http:\/\/localhost:8000\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 300 },
              networkTimeoutSeconds: 10,
            },
          },
        ],
      },
    }),
  ],
});
