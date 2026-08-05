'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { todayIST, isQrFresh } from '@/lib/utils'
import type { QrPayload } from '@/types'
import { saveOfflineScan, getOfflineQueue, removeOfflineScan, clearOfflineQueue, type OfflineScan } from '@/lib/offlineStore'
import { decryptQrToken } from '@/lib/qrCryptoClient'
import { getOfflineAuthSession } from '@/lib/offlineAuth'
import { useModule } from '@/context/ModuleContext'

type ScanResult = { type: 'success' | 'error' | 'duplicate'; message: string; studentName?: string; studentId?: string; session?: string }

export default function ScanPage() {
  const router = useRouter()
  const supabase = createClient()
  const scannerRef = useRef<any>(null)
  const [active, setActive] = useState(false)
  const [result, setResult] = useState<ScanResult | null>(null)
  const [scanCount, setScanCount] = useState(0)
  const [sessionMode, setSessionMode] = useState<'FN' | 'AN'>(() => {
    if (typeof window === 'undefined') return 'FN'
    const currentHourIST = parseInt(new Date().toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour12: false, hour: '2-digit' }), 10)
    return currentHourIST < 13 ? 'FN' : 'AN'
  })
  const processingRef = useRef(false)

  const { activeModule } = useModule()

  // Placement Drive scan states
  const [scanTargetMode, setScanTargetMode] = useState<'cdc' | 'placement'>('cdc')
  const [placementDrives, setPlacementDrives] = useState<any[]>([])
  const [selectedPlacementDriveId, setSelectedPlacementDriveId] = useState<string>('')
  const [cdcCurrentPeriod, setCdcCurrentPeriod] = useState<number | null>(null)

  // Batch & Restriction states
  const [facultyProfile, setFacultyProfile] = useState<any>(null)
  const [restrictFaculty, setRestrictFaculty] = useState(false)
  const [batchesList, setBatchesList] = useState<string[]>([])
  const [batchVenue, setBatchVenue] = useState<string | null>(null)
  const [loadingConfig, setLoadingConfig] = useState(true)
  const [updatingBatch, setUpdatingBatch] = useState(false)

  // Network & Offline Queue states
  const [isOnline, setIsOnline] = useState(true)
  const [recentScans, setRecentScans] = useState<Array<{
    id: string
    name: string
    session: string
    type: 'success' | 'duplicate' | 'error'
    time: string
    message?: string
  }>>([])
  const timeoutIdRef = useRef<NodeJS.Timeout | null>(null)

  // Haptic feedback & Offline queue states
  const [hapticsEnabled, setHapticsEnabled] = useState(true)
  const [forceOffline, setForceOffline] = useState(false)
  const [offlineQueue, setOfflineQueue] = useState<OfflineScan[]>([])
  const [isSyncing, setIsSyncing] = useState(false)

  // QR payloads are encrypted (AES-256-GCM) — a generic scanner app only
  // ever sees ciphertext. Decrypting to show a name/ID requires this key,
  // which is only ever handed to an authenticated Faculty/Admin session
  // (see /api/attendance/scan-key). It's cached in localStorage so scanning
  // keeps working across full offline stretches (poor-network blocks) once
  // fetched at least once while online.
  const [scanKey, setScanKey] = useState<string | null>(null)
  const scanKeyRef = useRef<string | null>(null)

  const offlineQueueRef = useRef(offlineQueue)
  const isSyncingRef = useRef(isSyncing)

  useEffect(() => {
    offlineQueueRef.current = offlineQueue
  }, [offlineQueue])

  useEffect(() => {
    isSyncingRef.current = isSyncing
  }, [isSyncing])

  useEffect(() => {
    scanKeyRef.current = scanKey
  }, [scanKey])

  const fetchScanKey = useCallback(async () => {
    try {
      const res = await fetch('/api/attendance/scan-key', { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      if (data?.key) {
        setScanKey(data.key)
        localStorage.setItem('faculty_scan_key', data.key)
      }
    } catch (e) {
      console.warn('Could not refresh scan key:', e)
    }
  }, [])

  // Load any cached key immediately (covers app launch while offline), then
  // try to refresh it whenever we have connectivity.
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const cached = localStorage.getItem('faculty_scan_key')
      if (cached) setScanKey(cached)
    }
    fetchScanKey()
    window.addEventListener('online', fetchScanKey)
    return () => window.removeEventListener('online', fetchScanKey)
  }, [fetchScanKey])

  // Track physical online/offline status
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsOnline(navigator.onLine)
      const handleOnline = () => setIsOnline(true)
      const handleOffline = () => setIsOnline(false)
      window.addEventListener('online', handleOnline)
      window.addEventListener('offline', handleOffline)
      return () => {
        window.removeEventListener('online', handleOnline)
        window.removeEventListener('offline', handleOffline)
      }
    }
  }, [])

  async function fetchVenue(batchName: string) {
    const { data } = await supabase
      .from('batch_venues')
      .select('venue')
      .eq('batch', batchName)
      .maybeSingle()
    if (data) setBatchVenue(data.venue)
    else setBatchVenue(null)
  }

  async function handleAssignBatch(newBatch: string) {
    if (!facultyProfile) return
    setUpdatingBatch(true)
    const { error } = await supabase
      .from('profiles')
      .update({ batch: newBatch || null })
      .eq('id', facultyProfile.id)

    if (error) {
      alert('Failed to assign batch: ' + error.message)
    } else {
      setFacultyProfile((prev: any) => prev ? { ...prev, batch: newBatch || null } : prev)
      if (newBatch) {
        await fetchVenue(newBatch)
      } else {
        setBatchVenue(null)
      }
    }
    setUpdatingBatch(false)
  }

  // Get active session mode and load settings/queue on mount from IndexedDB
  useEffect(() => {
    const hour = new Date().getHours()
    setSessionMode(hour < 12 ? 'FN' : 'AN')

    if (typeof window !== 'undefined') {
      const savedHaptics = localStorage.getItem('scan_haptics_enabled')
      if (savedHaptics !== null) {
        setHapticsEnabled(savedHaptics === 'true')
      }
      
      // Load offline queue from IndexedDB
      getOfflineQueue().then((queue) => {
        if (queue && queue.length > 0) {
          setOfflineQueue(queue)
        }
      }).catch((e) => console.warn('Error fetching IndexedDB queue:', e))
    }

    async function loadConfig() {
      setLoadingConfig(true)
      try {
        // Try restoring cached profile/settings first for offline readiness
        const cachedAuth = await getOfflineAuthSession().catch(() => null)
        if (cachedAuth?.profile) {
          setFacultyProfile(cachedAuth.profile)
        }
        if (typeof window !== 'undefined') {
          const cachedRestrict = localStorage.getItem('faculty_restrict_batch')
          if (cachedRestrict !== null) {
            setRestrictFaculty(cachedRestrict === 'true')
          }
          const cachedProfile = localStorage.getItem('faculty_cached_profile')
          if (cachedProfile && !cachedAuth?.profile) {
            try { setFacultyProfile(JSON.parse(cachedProfile)) } catch {}
          }
        }

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data: prof } = await supabase
          .from('profiles')
          .select('id, name, department, status, role, batch, special_login')
          .eq('id', user.id)
          .single()
        
        if (prof) {
          setFacultyProfile(prof)
          if (typeof window !== 'undefined') {
            localStorage.setItem('faculty_cached_profile', JSON.stringify(prof))
          }
          if (prof.batch) {
            supabase
              .from('batch_venues')
              .select('venue')
              .eq('batch', prof.batch)
              .maybeSingle()
              .then(({ data }) => {
                if (data) setBatchVenue(data.venue)
              })
          }
        }

        const { data: settings } = await supabase
          .from('session_settings')
          .select('restrict_faculty_batch')
          .eq('id', 1)
          .single()
        if (settings) {
          setRestrictFaculty(!!settings.restrict_faculty_batch)
          if (typeof window !== 'undefined') {
            localStorage.setItem('faculty_restrict_batch', String(!!settings.restrict_faculty_batch))
          }
        }

        const { data: batches } = await supabase
          .from('profiles')
          .select('batch')
          .eq('role', 'Student')
          .not('batch', 'is', null)
          .neq('batch', '')
        if (batches) {
          const unique = Array.from(new Set(batches.map((p: any) => p.batch))).filter(Boolean).sort() as string[]
          setBatchesList(unique)
        }

        // Load placement drives
        fetch('/api/admin/placement-drives')
          .then((res) => res.json())
          .then((json) => {
            if (json.success && Array.isArray(json.data)) {
              setPlacementDrives(json.data)
              if (typeof window !== 'undefined') {
                const params = new URLSearchParams(window.location.search)
                const urlDriveId = params.get('drive_id')
                if (urlDriveId) {
                  setScanTargetMode('placement')
                  setSelectedPlacementDriveId(urlDriveId)
                } else {
                  if (json.data.length > 0) setSelectedPlacementDriveId(json.data[0].id)
                  if (activeModule === 'cdc') setScanTargetMode('cdc')
                  else if (activeModule === 'placements') setScanTargetMode('placement')
                }
              }
            }
          })
          .catch((e) => console.error("Error loading placement drives:", e))
      } catch (e) {
        console.error(e)
      } finally {
        setLoadingConfig(false)
      }
    }
    loadConfig()
  }, [supabase])

  useEffect(() => {
    if (scanTargetMode !== 'cdc') return
    supabase.rpc('get_cdc_current_period').then(({ data }) => {
      setCdcCurrentPeriod(typeof data === 'number' ? data : null)
    })
  }, [scanTargetMode, supabase])

  const toggleHaptics = () => {
    setHapticsEnabled((prev) => {
      const newVal = !prev
      localStorage.setItem('scan_haptics_enabled', String(newVal))
      return newVal
    })
  }

  const triggerHaptic = (pattern: number[]) => {
    if (hapticsEnabled && typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(pattern)
      } catch (e) {
        console.warn("Haptic feedback error:", e)
      }
    }
  }

  // Restart scanner when user returns from phone call or tab switch
  useEffect(() => {
    if (!active) return

    function handleVisibility() {
      if (document.visibilityState === 'visible') {
        processingRef.current = false
        setActive(false)
        setTimeout(() => setActive(true), 200)
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [active])

  useEffect(() => {
    if (!active) return

    let html5QrCode: any
    let isCancelled = false

    async function startScanner() {
      try {
        const { Html5Qrcode } = await import('html5-qrcode')
        if (isCancelled) return

        html5QrCode = new Html5Qrcode('qr-reader')
        scannerRef.current = html5QrCode

        await html5QrCode.start(
          { facingMode: 'environment' },
          { fps: 25, qrbox: { width: 220, height: 220 } },
          handleQrCode,
          () => {}
        )

        if (isCancelled) {
          if (html5QrCode.isScanning) {
            await html5QrCode.stop()
          }
        }
      } catch {
        if (!isCancelled) {
          setResult({ type: 'error', message: 'Camera access denied. Enable camera permission.' })
          setActive(false)
        }
      }
    }

    startScanner()

    return () => {
      isCancelled = true
      if (html5QrCode) {
        if (html5QrCode.isScanning) {
          html5QrCode.stop().catch(() => {})
        }
      } else if (scannerRef.current) {
        if (scannerRef.current.isScanning) {
          scannerRef.current.stop().catch(() => {})
        }
      }
    }
  }, [active])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutIdRef.current) {
        clearTimeout(timeoutIdRef.current)
      }
    }
  }, [])

  // Listen for keyboard events to dismiss popup instantly
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (result && (e.key === 'Enter' || e.key === 'Escape' || e.key === ' ')) {
        e.preventDefault()
        dismissPopup()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [result])

  const addToRecentScans = (
    id: string,
    name: string,
    session: string,
    type: 'success' | 'duplicate' | 'error',
    message?: string
  ) => {
    const timeStr = new Date().toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    
    setRecentScans((prev) => {
      if (prev.length > 0 && prev[0].id === id && prev[0].type === type) {
        return prev
      }
      return [{ id, name, session, type, time: timeStr, message }, ...prev].slice(0, 5)
    })
  }

  const scheduleClear = (delay: number = 700) => {
    if (timeoutIdRef.current) {
      clearTimeout(timeoutIdRef.current)
    }
    timeoutIdRef.current = setTimeout(() => {
      setResult(null)
      processingRef.current = false
    }, delay)
  }

  const dismissPopup = () => {
    if (timeoutIdRef.current) {
      clearTimeout(timeoutIdRef.current)
    }
    setResult(null)
    processingRef.current = false
  }

  const syncOfflineScans = useCallback(async () => {
    if (isSyncingRef.current || offlineQueueRef.current.length === 0) return
    setIsSyncing(true)

    if (!navigator.onLine) {
      setIsSyncing(false)
      alert('You are still offline. Please connect to the internet first.')
      return
    }

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) {
        setIsSyncing(false)
        alert('Your session has expired. Please log out and log in again to sync.')
        return
      }

      let successCount = 0
      let duplicateCount = 0
      let failureCount = 0
      let remainingQueue = [...offlineQueueRef.current]
      const processedScans: Array<{ id: string; name: string; session: string; type: 'success' | 'duplicate' | 'error'; message: string }> = []

      if (offlineQueueRef.current.length > 0) {
        try {
          const res = await fetch('/api/attendance/mark', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              scans: offlineQueueRef.current.map((scan) => ({
                token: scan.token,
                mode: 'offline',
                scan_timestamp: scan.timestamp,
                scan_date: scan.date,
              })),
            }),
          })

          const contentType = res.headers.get('content-type') || ''
          const data = contentType.includes('application/json') ? await res.json().catch(() => null) : null

          if (res.ok && data?.success && Array.isArray(data.results)) {
            data.results.forEach((resItem: any, idx: number) => {
              const originalScan = offlineQueueRef.current[idx]
              if (!originalScan) return

              if (resItem?.success) {
                successCount++
                const sessionLabel = resItem.session || (sessionMode + '1')
                processedScans.push({
                  id: originalScan.student_id,
                  name: originalScan.name,
                  session: sessionLabel,
                  type: 'success' as const,
                  message: 'Marked Present (Synced)',
                })
              } else {
                duplicateCount++
                processedScans.push({
                  id: originalScan.student_id,
                  name: originalScan.name,
                  session: sessionMode + '1',
                  type: 'duplicate' as const,
                  message: resItem?.message ?? 'Already Verified',
                })
              }
            })
            remainingQueue = []
            await clearOfflineQueue().catch(() => {})
          } else if (!res.ok) {
            failureCount += offlineQueueRef.current.length
          }
        } catch (e) {
          console.error('Error syncing batch scans:', e)
        }
      }

      setOfflineQueue(remainingQueue)
      if (remainingQueue.length === 0) {
        clearOfflineQueue().catch(() => {})
      }

      if (successCount > 0) {
        setScanCount(c => c + successCount)
      }

      processedScans.forEach(scan => {
        addToRecentScans(scan.id, scan.name, scan.session, scan.type, scan.message)
      })

      let alertMsg = `Sync complete! `
      if (successCount > 0) alertMsg += `${successCount} present marked. `
      if (duplicateCount > 0) alertMsg += `${duplicateCount} already verified. `
      if (failureCount > 0) alertMsg += `${failureCount} failed. `
      if (remainingQueue.length > 0) alertMsg += `${remainingQueue.length} scans remaining in queue due to connection issues.`
      
      alert(alertMsg)
    } catch (e) {
      console.error("Sync failed", e)
      alert('An unexpected error occurred during sync.')
    } finally {
      setIsSyncing(false)
    }
  }, [supabase, sessionMode])

  // Auto-sync when system returns online
  useEffect(() => {
    const handleOnline = () => {
      if (offlineQueueRef.current.length > 0) {
        syncOfflineScans()
      }
    }
    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [syncOfflineScans])

  async function handleQrCode(text: string) {
    if (processingRef.current) return
    processingRef.current = true

    if (timeoutIdRef.current) {
      clearTimeout(timeoutIdRef.current)
    }

    try {
      const key = scanKeyRef.current
      if (!key) {
        const errResult: ScanResult = { type: 'error', message: 'Scanner not ready — connect to the internet once, then it will work fully offline.' }
        setResult(errResult)
        triggerHaptic([400])
        addToRecentScans('N/A', 'Scanner Not Ready', 'N/A', 'error', 'No scan key cached yet')
        scheduleClear(700)
        return
      }

      const payload: QrPayload | null = await decryptQrToken(text, key)
      if (!payload) {
        const errResult: ScanResult = { type: 'error', message: 'Could not read QR code. Re-align code.' }
        setResult(errResult)
        triggerHaptic([400])
        addToRecentScans('N/A', 'Malformed Code', 'N/A', 'error', 'Could not read QR code')
        scheduleClear(700)
        return
      }

      if (!payload.student_id || payload.ts === undefined || payload.ts === null) {
        const errResult: ScanResult = { type: 'error', message: 'Invalid academic QR code structure' }
        setResult(errResult)
        triggerHaptic([400])
        addToRecentScans('N/A', payload.name || 'Unknown Student', 'N/A', 'error', 'Invalid code structure')
        scheduleClear(700)
        return
      }

      const isOfflinePass = payload.mode === 'offline' || payload.ts === 0
      if (isOfflinePass && payload.date && payload.date !== todayIST()) {
        const errResult: ScanResult = { type: 'error', message: `Offline pass expired (issued for ${payload.date}, today is ${todayIST()}). Ask student to reconnect.` }
        setResult(errResult)
        triggerHaptic([400])
        addToRecentScans(payload.student_id, payload.name, 'N/A', 'error', 'Offline pass expired')
        scheduleClear(700)
        return
      }

      if (!isQrFresh(payload.ts, isOfflinePass)) {
        const errResult: ScanResult = { type: 'error', message: 'QR code expired. Ask student to tap refresh on dashboard.' }
        setResult(errResult)
        triggerHaptic([400])
        addToRecentScans(payload.student_id, payload.name, 'N/A', 'error', 'QR code expired')
        scheduleClear(700)
        return
      }

      // Handling CDC Classes period scanning
      if (scanTargetMode === 'cdc') {
        try {
          const res = await fetch('/api/attendance/mark-cdc', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: text }),
          })
          const json = await res.json()

          if (json.success) {
            setScanCount((c) => c + 1)
            setCdcCurrentPeriod(json.period_number ?? cdcCurrentPeriod)
            setResult({
              type: 'success',
              message: json.message || 'Marked Present',
              studentName: payload.name,
              studentId: payload.student_id,
              session: json.period_number ? `Period ${json.period_number}` : 'CDC',
            })
            triggerHaptic([100, 50, 100])
            addToRecentScans(payload.student_id, payload.name, json.period_number ? `P${json.period_number}` : 'CDC', 'success', json.message)
          } else {
            setResult({
              type: json.message?.toLowerCase().includes('already') ? 'duplicate' : 'error',
              message: json.message || 'Could not mark CDC attendance',
              studentName: payload.name,
              studentId: payload.student_id,
            })
            triggerHaptic([400])
            addToRecentScans(payload.student_id, payload.name, 'CDC', json.message?.toLowerCase().includes('already') ? 'duplicate' : 'error', json.message)
          }
        } catch (err: any) {
          setResult({ type: 'error', message: err.message || 'Error processing CDC attendance' })
          triggerHaptic([400])
        } finally {
          scheduleClear(700)
        }
        return
      }

      // Handling Placement Drive scanning
      if (scanTargetMode === 'placement') {
        if (!selectedPlacementDriveId) {
          const errResult: ScanResult = { type: 'error', message: 'Please select an active Placement Drive to scan.' }
          setResult(errResult)
          triggerHaptic([400])
          addToRecentScans(payload.student_id, payload.name, 'Placement', 'error', 'No Placement Drive selected')
          scheduleClear(700)
          return
        }

        try {
          const res = await fetch(`/api/admin/placement-drives/${selectedPlacementDriveId}/attendance`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              token: text,
              status: 'Present',
            }),
          })
          const json = await res.json()

          const activeDrive = placementDrives.find((d) => d.id === selectedPlacementDriveId)
          const driveLabel = activeDrive ? activeDrive.company_name : 'Placement Drive'

          if (json.success) {
            setScanCount((c) => c + 1)
            setResult({
              type: 'success',
              message: json.message || `Marked Present for ${driveLabel}`,
              studentName: json.student_name,
              studentId: json.student_id,
              session: driveLabel,
            })
            triggerHaptic([100, 50, 100])
            addToRecentScans(
              json.student_id,
              json.student_name,
              driveLabel,
              'success',
              json.is_rescan ? 'Re-verified Present' : 'Marked Present'
            )
          } else {
            setResult({
              type: 'error',
              message: json.error || `Student is NOT eligible for ${driveLabel}`,
              studentName: json.student_name || payload.name,
              studentId: payload.student_id,
            })
            triggerHaptic([400])
            addToRecentScans(payload.student_id, payload.name, driveLabel, 'error', json.error || 'Not Eligible')
          }
        } catch (err: any) {
          setResult({ type: 'error', message: err.message || 'Error processing placement drive attendance' })
          triggerHaptic([400])
        } finally {
          scheduleClear(700)
        }
        return
      }

      // Client-side Faculty Batch Restriction check
      if (restrictFaculty && !facultyProfile?.special_login) {
        if (!facultyProfile?.batch) {
          const errResult: ScanResult = { type: 'error', message: 'Restricted: Please select a batch first.' }
          setResult(errResult)
          triggerHaptic([400])
          addToRecentScans('N/A', payload.name || 'Unknown Student', 'N/A', 'error', 'No batch selected')
          scheduleClear(700)
          return
        }

        if (!payload.batch || payload.batch !== facultyProfile.batch) {
          const errResult: ScanResult = { 
            type: 'error', 
            message: `Restricted: You can only mark Batch ${facultyProfile.batch} (Student is Batch ${payload.batch || 'None'})` 
          }
          setResult(errResult)
          triggerHaptic([400])
          addToRecentScans(payload.student_id, payload.name, 'N/A', 'error', `Batch mismatch (Student is Batch ${payload.batch || 'None'})`)
          scheduleClear(700)
          return
        }
      }

      let dbResult: any = null
      let networkErrorOccurred = false

      if (forceOffline || !navigator.onLine) {
        networkErrorOccurred = true
      } else {
        const controller = new AbortController()
        const fetchTimeout = setTimeout(() => controller.abort(), 800) // 800ms max — faster offline fallback

        try {
          const res = await fetch('/api/attendance/mark', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({ token: text }),
          })
          clearTimeout(fetchTimeout)

          const contentType = res.headers.get('content-type') || ''
          const data = contentType.includes('application/json') ? await res.json().catch(() => null) : null

          if (!data) {
            // Non-JSON response (e.g. HTML 404/500/offline fallback page) — treat as network error to fallback to offline queue!
            networkErrorOccurred = true
          } else if (res.status === 401) {
            const errResult: ScanResult = { type: 'error', message: 'Session expired. Please log out and log in again.' }
            setResult(errResult)
            triggerHaptic([400])
            addToRecentScans(payload.student_id, payload.name, 'N/A', 'error', 'Session expired')
            scheduleClear(700)
            return
          } else if (!res.ok) {
            const errResult: ScanResult = { type: 'error', message: data?.message || 'Database error' }
            setResult(errResult)
            triggerHaptic([400])
            addToRecentScans(payload.student_id, payload.name, 'N/A', 'error', data?.message)
            scheduleClear(700)
            return
          } else {
            dbResult = data
          }
        } catch (err: any) {
          clearTimeout(fetchTimeout)
          if (
            err?.name === 'AbortError' ||
            err?.name === 'SyntaxError' ||
            err instanceof TypeError ||
            err.message?.includes('fetch') ||
            err.message?.includes('network') ||
            err.message?.includes('Failed to fetch') ||
            err.message?.includes('JSON') ||
            err.message?.includes('Unexpected token') ||
            err.status === 0 ||
            !navigator.onLine
          ) {
            networkErrorOccurred = true
          } else {
            const errMsg = err?.message ?? 'An unexpected error occurred'
            setResult({ type: 'error', message: errMsg })
            triggerHaptic([400])
            addToRecentScans(payload.student_id, payload.name, 'N/A', 'error', errMsg)
            scheduleClear(700)
            return
          }
        }
      }

      // Handle offline fallback queueing
      if (networkErrorOccurred) {
        const isAlreadyOffline = offlineQueueRef.current.some(x => x.student_id === payload.student_id)
        if (isAlreadyOffline) {
          setResult({
            type: 'duplicate',
            message: 'Already queued offline for sync',
            studentName: payload.name,
            studentId: payload.student_id
          })
          triggerHaptic([400])
          addToRecentScans(payload.student_id, payload.name, sessionMode + '1', 'duplicate', 'Already in offline queue')
          scheduleClear(700)
          return
        }

        const newScan: OfflineScan = {
          student_id: payload.student_id,
          name: payload.name,
          department: payload.department,
          section: payload.section,
          year: payload.year,
          batch: payload.batch || null,
          ts: payload.ts,
          token: text,
          timestamp: new Date().toISOString(),
          date: todayIST()
        }

        const updatedQueue = [...offlineQueueRef.current, newScan]
        setOfflineQueue(updatedQueue)
        saveOfflineScan(newScan).catch((e) => console.warn("Error saving scan to IndexedDB:", e))

        triggerHaptic([100, 50, 100])

        // Release processing lock immediately so next scan is not blocked
        processingRef.current = false

        setResult({
          type: 'success',
          message: 'Saved Offline (Pending Sync)',
          studentName: payload.name,
          studentId: payload.student_id,
          session: sessionMode + '1'
        })
        addToRecentScans(payload.student_id, payload.name, sessionMode + '1', 'success', 'Queued Offline')
        scheduleClear(600)
        return
      }

      // Handle online response
      if (dbResult?.success) {
        setScanCount((c) => c + 1)
        const sess = dbResult.session || (sessionMode + '1')
        setResult({
          type: 'success',
          message: `Scanned Successfully`,
          studentName: payload.name,
          studentId: payload.student_id,
          session: sess,
        })
        triggerHaptic([100, 50, 100])
        addToRecentScans(payload.student_id, payload.name, sess, 'success', 'Marked Present')
        scheduleClear(700)
      } else {
        const msg = dbResult?.message ?? `Attendance already verified`
        setResult({
          type: 'duplicate',
          message: msg,
          studentName: payload.name,
          studentId: payload.student_id,
        })
        triggerHaptic([400])
        addToRecentScans(payload.student_id, payload.name, (sessionMode + '1'), 'duplicate', msg)
        scheduleClear(700)
      }
    } catch (err: any) {
      const errMsg = err?.message ?? 'An unexpected error occurred'
      setResult({ type: 'error', message: errMsg })
      triggerHaptic([400])
      addToRecentScans('N/A', 'Error', 'N/A', 'error', errMsg)
      scheduleClear(700)
    }
  }

  return (
    <div className="relative space-y-6 animate-fade-in pb-16 max-w-2xl mx-auto px-4 md:px-0">
      {/* Soft Ambient Background Spheres */}
      <div className="absolute inset-0 z-[-1] pointer-events-none opacity-60 overflow-hidden">
        <div className="absolute top-[-5%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-indigo-200/40 blur-[120px] mix-blend-multiply animate-pulse" style={{ animationDuration: '8s' }}></div>
        <div className="absolute bottom-[-5%] right-[-10%] w-[45vw] h-[45vw] rounded-full bg-purple-200/40 blur-[120px] mix-blend-multiply animate-pulse" style={{ animationDuration: '10s' }}></div>
      </div>

      {/* Header bar with Back button */}
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={() => router.push('/faculty')}
          className="clay-button-secondary inline-flex items-center gap-2 px-4 py-2.5 text-xs font-extrabold text-slate-700 min-h-[44px]"
        >
          <span>←</span>
          <span>Faculty Dashboard</span>
        </button>

        {/* Network & Encryption Key Status Indicator */}
        <div className="flex items-center gap-2">
          {!scanKey ? (
            <span className="clay-badge bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-extrabold px-3 py-1.5" title="No encryption key cached. Online connection required for first scan.">
              🔑 Key Syncing...
            </span>
          ) : isOnline ? (
            <span className="clay-badge bg-emerald-100 text-emerald-900 border border-emerald-300 text-[10px] font-black px-3 py-1.5 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
              Online
            </span>
          ) : (
            <span className="clay-badge bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-black px-3 py-1.5 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
              Offline Mode
            </span>
          )}
        </div>
      </div>

      {/* Mobile-Optimized Scanner Settings Control Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Offline / Online Sync Mode Toggle */}
        <button
          onClick={() => setForceOffline((prev) => !prev)}
          className={`clay-card p-3.5 flex items-center justify-between text-left transition-all min-h-[52px] ${
            forceOffline
              ? 'clay-card-amber text-amber-950 border-amber-300'
              : 'bg-white text-slate-800 border-slate-200/80'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <span className="text-xl">{forceOffline ? '⚡' : '📡'}</span>
            <div>
              <p className="text-xs font-black leading-tight">
                {forceOffline ? 'Fast Offline Mode' : 'Auto Online Sync'}
              </p>
              <p className="text-[10px] opacity-75 font-semibold">
                {forceOffline ? 'Instant save (poor network)' : 'Live server verification'}
              </p>
            </div>
          </div>
          <span className={`clay-badge px-2.5 py-1 text-[10px] font-black ${
            forceOffline ? 'bg-amber-200/80 text-amber-950' : 'bg-emerald-100 text-emerald-800'
          }`}>
            {forceOffline ? 'OFFLINE' : 'ONLINE'}
          </span>
        </button>

        {/* Haptic Vibration Feedback Toggle */}
        <button
          onClick={toggleHaptics}
          className={`clay-card p-3.5 flex items-center justify-between text-left transition-all min-h-[52px] ${
            hapticsEnabled
              ? 'bg-gradient-to-r from-indigo-50 to-purple-50 text-indigo-950 border-indigo-200'
              : 'bg-white text-slate-400 border-slate-200/80'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <span className="text-xl">{hapticsEnabled ? '📳' : '📴'}</span>
            <div>
              <p className="text-xs font-black text-slate-800 leading-tight">Vibration Feedback</p>
              <p className="text-[10px] text-slate-500 font-semibold">
                {hapticsEnabled ? 'Haptics active on scan' : 'Haptic vibration disabled'}
              </p>
            </div>
          </div>
          <span className={`clay-badge px-2.5 py-1 text-[10px] font-black ${
            hapticsEnabled ? 'bg-indigo-100 text-indigo-900 border border-indigo-200' : 'bg-slate-100 text-slate-500'
          }`}>
            {hapticsEnabled ? 'ON' : 'OFF'}
          </span>
        </button>
      </div>

      {/* Target Mode Switcher: CDC Period vs Placement Drive */}
      <div className="clay-card p-2 rounded-[1.75rem] flex items-center gap-2 min-h-[52px]">
        <button
          onClick={() => setScanTargetMode('cdc')}
          className={`flex-1 py-2.5 px-4 rounded-2xl text-xs font-extrabold transition-all min-h-[44px] ${
            scanTargetMode === 'cdc'
              ? 'clay-button text-white shadow-md'
              : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          🎓 CDC Period
        </button>
        <button
          onClick={() => setScanTargetMode('placement')}
          className={`flex-1 py-2.5 px-4 rounded-2xl text-xs font-extrabold transition-all min-h-[44px] ${
            scanTargetMode === 'placement'
              ? 'clay-button text-white shadow-md'
              : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          🚀 Placement Drive
        </button>
      </div>

      {scanTargetMode === 'cdc' && (
        <div className="clay-card p-6 space-y-2">
          <label className="block text-xs font-black text-brand-900 uppercase tracking-wider">
            CDC Classes — Live Period
          </label>
          {cdcCurrentPeriod ? (
            <p className="text-sm font-black text-emerald-700">✅ Period {cdcCurrentPeriod} is active — scans will be marked here.</p>
          ) : (
            <p className="text-xs text-amber-700 font-bold">⚠️ No CDC period is active right now. Check the timetable in Settings.</p>
          )}
        </div>
      )}

      {scanTargetMode === 'placement' && (
        <div className="clay-card p-6 space-y-3">
          <label className="block text-xs font-black text-brand-900 uppercase tracking-wider">
            Select Placement Drive to Scan *
          </label>
          {placementDrives.length === 0 ? (
            <p className="text-xs text-slate-500 font-semibold">No active placement drives found. Create drives in Admin Portal.</p>
          ) : (
            <select
              value={selectedPlacementDriveId}
              onChange={(e) => setSelectedPlacementDriveId(e.target.value)}
              className="clay-input w-full min-h-[48px] px-4 py-3 text-xs font-extrabold text-slate-800"
            >
              {placementDrives.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.company_name} — {d.title} ({d.drive_date})
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* Offline Queue Sync Card */}
      {offlineQueue.length > 0 && (
        <div className="clay-card-amber p-5 flex items-center justify-between gap-4 animate-slide-up">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-200/80 border border-amber-300 flex items-center justify-center text-lg animate-pulse flex-shrink-0 clay-badge">
              ☁️
            </div>
            <div>
              <p className="text-xs font-black text-amber-950">
                {offlineQueue.length} Pending Scan{offlineQueue.length > 1 ? 's' : ''} Offline
              </p>
              <p className="text-[10px] text-amber-900 font-bold mt-0.5">
                Saved locally. Will sync when connection is restored.
              </p>
            </div>
          </div>
          <button
            onClick={syncOfflineScans}
            disabled={isSyncing}
            className={`clay-button px-4 py-2.5 text-xs font-extrabold flex-shrink-0 min-h-[44px] ${
              isSyncing ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            {isSyncing ? 'Syncing...' : 'Sync Now'}
          </button>
        </div>
      )}

      {/* Live Camera Viewfinder (Clay Rounded Box) */}
      <div className="clay-card p-0 rounded-[2.25rem] bg-slate-950 border border-white/10 relative overflow-hidden shadow-2xl">
        {active && (
          <div className="absolute inset-0 z-20 pointer-events-none neon-scanner-border">
            <div className="scanner-laser"></div>
          </div>
        )}

        <div id="qr-reader" className="w-full relative z-10 min-h-[300px] bg-slate-900" />

        {!active ? (
          <div className="p-8 text-center space-y-4 relative z-20 bg-slate-950">
            <div className="w-16 h-16 rounded-full bg-brand-500/20 border border-brand-500/30 text-brand-400 flex items-center justify-center text-3xl mx-auto mb-2 animate-pulse clay-badge-dark">
              📷
            </div>
            <div className="space-y-1">
              <h4 className="text-base font-black text-white font-heading">Camera Access Required</h4>
              <p className="text-xs text-slate-400 max-w-xs mx-auto font-medium">
                Grant camera permission to sweep student QR codes in real-time.
              </p>
            </div>
            {restrictFaculty && !facultyProfile?.batch && !facultyProfile?.special_login ? (
              <button
                disabled
                className="clay-button w-full min-h-[56px] py-4 text-sm font-extrabold opacity-40 cursor-not-allowed shadow-none"
              >
                Select Batch to Start Scanner
              </button>
            ) : (
              <button
                onClick={() => setActive(true)}
                className="clay-button w-full min-h-[56px] py-4 text-sm font-extrabold text-white"
              >
                Start Attendance Scanner
              </button>
            )}
          </div>
        ) : (
          <div className="p-6 text-center bg-slate-950/90 backdrop-blur-md border-t border-white/10 relative z-20">
            <button
              onClick={() => {
                if (scannerRef.current?.isScanning) scannerRef.current.stop()
                setActive(false)
              }}
              className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-red-600 to-rose-600 text-white text-xs font-black min-h-[48px] shadow-lg shadow-red-600/30 active:translate-y-0.5 transition-all"
            >
              Stop Camera Feed
            </button>
          </div>
        )}
      </div>

      {/* Tactile Scan Result Feedback Modal */}
      {result && (
        <div 
          onClick={dismissPopup}
          className="fixed inset-0 bg-slate-950/70 backdrop-blur-md z-50 flex items-center justify-center p-6 animate-fade-in"
          style={{ animationDuration: '150ms' }}
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm clay-card bg-slate-900 border border-white/20 p-6 rounded-[2.25rem] shadow-2xl text-center space-y-4 animate-scale-in"
          >
            {result.type === 'success' && (
              <>
                <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 flex items-center justify-center text-3xl mx-auto mb-1 animate-bounce clay-badge-dark">
                  ✓
                </div>
                <div className="space-y-1">
                  <h3 className="text-lg font-black text-white font-heading">Marked Present</h3>
                  <p className="text-brand-300 text-[10px] font-extrabold tracking-wider uppercase bg-brand-500/20 border border-brand-500/30 px-3 py-1 rounded-full inline-block clay-badge-dark">
                    Session: {result.session}
                  </p>
                </div>
                <div className="p-4 bg-white/10 border border-white/10 rounded-2xl clay-badge-dark">
                  <p className="text-base font-black text-white">{result.studentName}</p>
                  <p className="text-xs font-mono text-slate-300 mt-1 font-bold">ID: {result.studentId}</p>
                </div>
              </>
            )}

            {result.type === 'duplicate' && (
              <>
                <div className="w-16 h-16 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-300 flex items-center justify-center text-3xl mx-auto mb-1 clay-badge-dark">
                  ⚠️
                </div>
                <div className="space-y-1">
                  <h3 className="text-lg font-black text-amber-300 font-heading">
                    {result.message?.toLowerCase().includes('session') && !result.message?.toLowerCase().includes('already')
                      ? 'Invalid Scan Time'
                      : 'Already Verified'}
                  </h3>
                  <p className="text-slate-300 text-xs font-bold px-2">
                    {result.message || 'Attendance is already registered for this session.'}
                  </p>
                </div>
                <div className="p-4 bg-white/10 border border-white/10 rounded-2xl clay-badge-dark">
                  <p className="text-base font-black text-white">{result.studentName}</p>
                  <p className="text-xs font-mono text-slate-300 mt-1 font-bold">ID: {result.studentId}</p>
                </div>
              </>
            )}

            {result.type === 'error' && (
              <>
                <div className="w-16 h-16 rounded-full bg-red-500/20 border border-red-500/30 text-red-400 flex items-center justify-center text-3xl mx-auto mb-1 clay-badge-dark">
                  ✕
                </div>
                <div className="space-y-1">
                  <h3 className="text-lg font-black text-red-400 font-heading">Scan Error</h3>
                  <p className="text-slate-200 text-xs font-bold px-4 leading-relaxed">{result.message}</p>
                </div>
              </>
            )}

            <button 
              onClick={dismissPopup}
              className="clay-button w-full py-3 px-5 text-white text-xs font-black min-h-[48px] mt-2"
            >
              Scan Next (Enter)
            </button>
          </div>
        </div>
      )}

      {active && (
        <div className="space-y-4">
          <div className="clay-card p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-black text-slate-500 uppercase tracking-wider">Scans This Class Session</p>
              <p className="text-[10px] text-slate-400 font-semibold mt-0.5">Ready for next student QR code...</p>
            </div>
            <div className="clay-badge bg-brand-50 border border-brand-200 px-4 py-2 flex items-center justify-center">
              <span className="text-2xl font-black text-brand-700 font-heading">{scanCount}</span>
            </div>
          </div>

          <div className="clay-card p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">Recent Scans Feed</h3>
              <span className="clay-badge bg-emerald-100 text-emerald-800 border border-emerald-200 px-3 py-0.5 text-[9px] font-black inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                Live Feed
              </span>
            </div>

            {recentScans.length === 0 ? (
              <div className="text-center py-6 text-slate-400">
                <p className="text-xs font-bold">No students scanned yet in this session.</p>
                <p className="text-[10px] text-slate-400 mt-1">Scanned details will populate here in real-time.</p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                {recentScans.map((scan, i) => (
                  <div 
                    key={`${scan.id}-${i}`}
                    className="clay-badge bg-white border border-slate-200/80 flex items-center justify-between p-3.5 transition-all"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs flex-shrink-0 font-black ${
                        scan.type === 'success' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                        scan.type === 'duplicate' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                        'bg-red-100 text-red-800 border border-red-200'
                      }`}>
                        {scan.type === 'success' ? '✓' : scan.type === 'duplicate' ? '⚠️' : '✕'}
                      </div>

                      <div className="min-w-0">
                        <p className="text-xs font-black text-slate-800 truncate">{scan.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[9px] font-mono text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded-md font-extrabold">
                            {scan.id}
                          </span>
                          <span className="text-[9px] font-extrabold text-slate-500">
                            {scan.session}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right flex-shrink-0">
                      <p className="text-[10px] font-bold text-slate-500">{scan.time}</p>
                      <span className={`clay-badge inline-block text-[8px] font-black px-2 py-0.5 mt-1 ${
                        scan.type === 'success' ? 'bg-emerald-100 text-emerald-800' :
                        scan.type === 'duplicate' ? 'bg-amber-100 text-amber-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {scan.type === 'success' ? 'Present' : scan.type === 'duplicate' ? 'Verified' : 'Error'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
