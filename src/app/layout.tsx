import type { Metadata, Viewport } from 'next'
import './globals.css'
import InstallPWA from '@/components/InstallPWA'

export const metadata: Metadata = {
  title: 'QR Attendance — SRMIST Tiruchirappalli Campus',
  description: 'QR Code Based Attendance System for SRMIST Tiruchirappalli Campus',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'QR Attend',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#6366f1',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="apple-touch-icon" href="/icon-192.png" />
        {/* Unregister any previously-installed service workers so stale caches
            don't affect users who visited before the SW was disabled. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                navigator.serviceWorker.getRegistrations().then(function(registrations) {
                  registrations.forEach(function(r) { r.unregister(); });
                });
              }
            `,
          }}
        />
      </head>
      <body>
        {children}
        <InstallPWA />
      </body>
    </html>
  )
}
