'use client'

import { useEffect, useState } from 'react'

export default function InstallPWA() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)
  const [showAndroidPrompt, setShowAndroidPrompt] = useState(false)
  const [showIOSPrompt, setShowIOSPrompt] = useState(false)

  useEffect(() => {
    // Check if user previously dismissed the prompt
    const isDismissed = localStorage.getItem('pwa_prompt_dismissed')
    const dismissedAt = localStorage.getItem('pwa_prompt_dismissed_at')
    
    // Auto-reset dismissal after 7 days
    if (isDismissed && dismissedAt) {
      const daysSinceDismissal = (Date.now() - parseInt(dismissedAt)) / (1000 * 60 * 60 * 24)
      if (daysSinceDismissal > 7) {
        localStorage.removeItem('pwa_prompt_dismissed')
        localStorage.removeItem('pwa_prompt_dismissed_at')
      } else {
        return // Still dismissed
      }
    }

    // Detect if app is already running as installed PWA (Standalone mode)
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as any).standalone === true

    if (isStandalone) return

    // Detect iOS devices (iPhone / iPad / iPod) in Safari browser
    const userAgent = window.navigator.userAgent.toLowerCase()
    const isIOS = /iphone|ipad|ipod/.test(userAgent) && !(window as any).MSStream

    if (isIOS) {
      setShowIOSPrompt(true)
      return
    }

    // Standard Android / Chrome beforeinstallprompt event listener
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e)
      setShowAndroidPrompt(true)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)

    // Hide prompt if app is installed
    window.addEventListener('appinstalled', () => {
      setShowAndroidPrompt(false)
      setDeferredPrompt(null)
    })

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    }
  }, [])

  const handleInstallClick = async () => {
    if (!deferredPrompt) return
    
    // Show the native install prompt
    deferredPrompt.prompt()
    
    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice
    
    if (outcome === 'accepted') {
      setShowAndroidPrompt(false)
    }
    setDeferredPrompt(null)
  }

  const handleDismiss = () => {
    setShowAndroidPrompt(false)
    setShowIOSPrompt(false)
    localStorage.setItem('pwa_prompt_dismissed', 'true')
    localStorage.setItem('pwa_prompt_dismissed_at', Date.now().toString())
  }

  // Render iOS Safari Add to Home Screen Instructions Prompt
  if (showIOSPrompt) {
    return (
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-11/12 max-w-sm animate-slide-up">
        <div className="bg-slate-900/95 text-white rounded-2xl p-4 shadow-2xl border border-white/15 backdrop-blur-md">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-brand-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shrink-0">
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-bold tracking-wide">Install QR Attendance</p>
                <p className="text-xs text-slate-300">Add to iPhone Home Screen</p>
              </div>
            </div>
            <button
              onClick={handleDismiss}
              className="p-1 text-slate-400 hover:text-white transition-colors"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="bg-slate-800/80 rounded-xl p-3 text-xs text-slate-200 space-y-2 border border-white/5">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-brand-400">Step 1:</span>
              <span>Tap the <strong className="text-white">Share</strong> button</span>
              <svg className="w-4 h-4 text-brand-400 inline shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
              <span>at bottom</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-brand-400">Step 2:</span>
              <span>Scroll & select <strong className="text-white">Add to Home Screen</strong></span>
              <svg className="w-4 h-4 text-emerald-400 inline shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>

          <div className="mt-2 text-[10px] text-center text-slate-400">
            Works in Safari on iPhone / iPad
          </div>
        </div>
      </div>
    )
  }

  // Render Android / Chrome native prompt banner
  if (showAndroidPrompt) {
    return (
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-11/12 max-w-sm animate-slide-up">
        <div className="glass-dark bg-slate-900/90 text-white rounded-2xl p-4 shadow-2xl flex items-center justify-between border border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-brand-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-bold tracking-wide">Install App</p>
              <p className="text-xs text-slate-300 mt-0.5">Add to home screen</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDismiss}
              className="p-2 text-slate-400 hover:text-white transition-colors"
              aria-label="Dismiss"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <button
              onClick={handleInstallClick}
              className="bg-brand-500 hover:bg-brand-400 text-white text-sm font-semibold py-1.5 px-4 rounded-lg transition-colors shadow-md"
            >
              Install
            </button>
          </div>
        </div>
      </div>
    )
  }

  return null
}

