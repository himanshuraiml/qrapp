const withPWA = require('@ducanh2912/next-pwa').default({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  cacheOnFrontEndNav: false,
  aggressiveFrontEndNavCaching: false,
  reloadOnOnline: false,
  workboxOptions: {
    skipWaiting: true,
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
    ],
  },
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
}

module.exports = withPWA(nextConfig)
