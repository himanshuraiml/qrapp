import type { Metadata, Viewport } from 'next'
import './globals.css'
import InstallPWA from '@/components/InstallPWA'
import SwUpdateReloader from '@/components/SwUpdateReloader'

export const metadata: Metadata = {
  title: 'QR Attendance — SRMIST Tiruchirappalli Campus',
  description: 'QR Code Based Attendance System for SRMIST Tiruchirappalli Campus',
  manifest: '/manifest.json',
  icons: {
    icon: '/icon.svg',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'QR Attendance',
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
      </head>
      <body>
        {children}
        <InstallPWA />
        <SwUpdateReloader />
      </body>
    </html>
  )
}
