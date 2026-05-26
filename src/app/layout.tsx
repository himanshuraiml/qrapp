import type { Metadata, Viewport } from 'next'
import './globals.css'
import InstallPWA from '@/components/InstallPWA'

export const metadata: Metadata = {
  title: 'QR Attendance — SRMIST',
  description: 'QR Code Based Attendance System for SRMIST Trichy',
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
      </head>
      <body>
        {children}
        <InstallPWA />
      </body>
    </html>
  )
}
