import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

/**
 * Kultr build configuration.
 *
 * Two env vars matter for deployment:
 *   KULTR_BASE           - public path the app is served from ("/" for a normal
 *                          host, "/Kultr/" for GitHub Pages project sites).
 *   KULTR_PROXY_TARGET   - during `npm run dev`, requests to /rest and /share
 *                          are proxied to this Navidrome instance so the browser
 *                          never sees a cross-origin request.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), ['KULTR_', 'VITE_'])
  const base = env.KULTR_BASE ?? '/'
  const proxyTarget = env.KULTR_PROXY_TARGET ?? ''

  return {
    base,
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    define: {
      __KULTR_VERSION__: JSON.stringify(process.env.npm_package_version ?? '1.5.2'),
      __KULTR_BUILD_DATE__: JSON.stringify(new Date().toISOString()),
    },
    server: {
      host: true,
      port: 5173,
      proxy: proxyTarget
        ? {
            '/rest': { target: proxyTarget, changeOrigin: true, secure: false },
            '/share': { target: proxyTarget, changeOrigin: true, secure: false },
          }
        : undefined,
    },
    build: {
      target: 'es2020',
      sourcemap: false,
      chunkSizeWarningLimit: 1200,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
            icons: ['lucide-react'],
          },
        },
      },
    },
    plugins: [
      react(),
      VitePWA({
        registerType: 'prompt',
        includeAssets: ['favicon.png', 'logo.png', 'apple-touch-icon.png'],
        manifest: {
          name: 'Kultr',
          short_name: 'Kultr',
          description: 'A modern, minimalist client for your Navidrome server.',
          theme_color: '#0b0b0f',
          background_color: '#0b0b0f',
          display: 'standalone',
          orientation: 'any',
          start_url: base,
          scope: base,
          categories: ['music', 'entertainment'],
          icons: [
            { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
          maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
          // Never let the service worker intercept the Subsonic API or audio
          // streams — Kultr manages those caches itself.
          navigateFallbackDenylist: [/^\/rest/, /^\/share/],
          runtimeCaching: [
            {
              urlPattern: ({ url }) => url.pathname.includes('/rest/getCoverArt'),
              handler: 'CacheFirst',
              options: {
                cacheName: 'kultr-cover-art',
                expiration: { maxEntries: 3000, maxAgeSeconds: 60 * 60 * 24 * 60 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
        },
        devOptions: { enabled: false },
      }),
    ],
  }
})
