const withPWA = require('@ducanh2912/next-pwa').default({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  cacheOnFrontEndNav: false,
  // aggressiveFrontEndNavCaching REMOVED — caused iOS Safari service worker to serve
  // stale JS chunks after a new deployment, producing "Application error: client-side
  // exception" on all iPhones. iOS Safari's SW update flow is more conservative than
  // Chrome's and this option breaks it.
  reloadOnOnline: true, // Reload on reconnect to clear any stale SW state on iOS
  workboxOptions: {
    // skipWaiting + clientsClaim can cause a race condition on iOS Safari where the new
    // SW takes over mid-navigation and serves mixed old/new JS chunks. Removed skipWaiting
    // so the SW only takes over when all tabs using the old version are closed.
    // The page will auto-reload via the 'controllerchange' listener in sw-update.ts.
    skipWaiting: false,
    clientsClaim: true,
    runtimeCaching: [
      {
        // Never cache Supabase — attendance data must always be live
        urlPattern: /supabase\.co/,
        handler: 'NetworkOnly',
      },
      {
        // Never cache internal API routes
        urlPattern: /^\/api\//,
        handler: 'NetworkOnly',
      },
      {
        // Authenticated routes MUST NEVER be cached in service worker Cache Storage
        urlPattern: /\/(faculty|student|admin|login|change-password)/,
        handler: 'NetworkOnly',
      },
    ],
  },
})

const securityHeaders = [
  {
    key: 'X-DNS-Prefetch-Control',
    value: 'on',
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY',
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(self), microphone=(), geolocation=()',
  },
  {
    key: 'X-XSS-Protection',
    value: '1; mode=block',
  },
  {
    // Restricts where resources can be loaded from.
    // 'unsafe-inline' for styles is needed by Tailwind / Next.js SSR.
    // Tighten further (add nonces) if an inline script injection is later discovered.
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Next.js needs unsafe-eval in dev; harmless in prod
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob:",
      "connect-src 'self' https://*.supabase.co https://wgdhuaatzolkrofkwxdb.supabase.co wss://*.supabase.co wss://wgdhuaatzolkrofkwxdb.supabase.co",
      "media-src 'self'",
      "worker-src 'self' blob:",
      "frame-ancestors 'none'",
    ].join('; '),
  },
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ]
  },
}

module.exports = withPWA(nextConfig)

