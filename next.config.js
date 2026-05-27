const withPWA = require('@ducanh2912/next-pwa').default({
  dest: 'public',
  disable: true, // SW disabled — causes stale-cache issues on Vercel; re-enable when cache strategy is ready
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
}

module.exports = withPWA(nextConfig)
