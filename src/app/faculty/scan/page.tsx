'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { todayIST, isQrFresh } from '@/lib/utils'
import type { QrPayload } from '@/types'
import { saveOfflineScan, getOfflineQueue, clearOfflineQueue, type OfflineScan } from '@/lib/offlineStore'
import { decryptQrToken } from '@/lib/qrCryptoClient'
import { getOfflineAuthSession } from '@/lib/offlineAuth'
import { useModule } from '@/context/ModuleContext'
import { safeStorage } from '@/lib/safeStorage'

type ScanResult = { type: 'success' | 'error' | 'duplicate'; message: string; studentName?: string; studentId?: string; session?: string }

export default function ScanPage() {
  const router = useRouter()
  const supabase = createClient()
  const scannerRef = useRef<any>(null)
  // Auto-start immediately on page load
  const [active, setActive] = useState(true)
  const [cameraError, setCameraError] = useState<string | null>(null)
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

  const [scanKey, setScanKey] = useState<string | null>(null)
  const scanKeyRef = useRef<string | null>(null)

  const offlineQueueRef = useRef(offlineQueue)
  const isSyncingRef = useRef(isSyncing)

  // The QR scanner (html5-qrcode) is started once and keeps calling the same
  // handleQrCode/syncOfflineScans closures from that render, so any state
  // they read must be mirrored into a ref — otherwise switching scan target
  // mode (CDC vs Placement) after the camera has started is silently ignored.
  const scanTargetModeRef = useRef(scanTargetMode)
  const selectedPlacementDriveIdRef = useRef(selectedPlacementDriveId)
  const placementDrivesRef = useRef(placementDrives)

  useEffect(() => { offlineQueueRef.current = offlineQueue }, [offlineQueue])
  useEffect(() => { isSyncingRef.current = isSyncing }, [isSyncing])
  useEffect(() => { scanKeyRef.current = scanKey }, [scanKey])
  useEffect(() => { scanTargetModeRef.current = scanTargetMode }, [scanTargetMode])
  useEffect(() => { selectedPlacementDriveIdRef.current = selectedPlacementDriveId }, [selectedPlacementDriveId])
  useEffect(() => { placementDrivesRef.current = placementDrives }, [placementDrives])

  const fetchScanKey = useCallback(async () => {
    try {
      const res = await fetch('/api/attendance/scan-key', { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      if (data?.key) {
        setScanKey(data.key)
        safeStorage.setItem('faculty_scan_key', data.key)
      }
    } catch (e) {
      console.warn('Could not refresh scan key:', e)
    }
  }, [])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const cached = safeStorage.getItem('faculty_scan_key')
      if (cached) setScanKey(cached)
    }
    fetchScanKey()
    window.addEventListener('online', fetchScanKey)
    return () => window.removeEventListener('online', fetchScanKey)
  }, [fetchScanKey])

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
      if (newBatch) await fetchVenue(newBatch)
      else setBatchVenue(null)
    }
    setUpdatingBatch(false)
  }

  useEffect(() => {
    const hour = new Date().getHours()
    setSessionMode(hour < 12 ? 'FN' : 'AN')

    if (typeof window !== 'undefined') {
      const savedHaptics = safeStorage.getItem('scan_haptics_enabled')
      if (savedHaptics !== null) setHapticsEnabled(savedHaptics === 'true')
      getOfflineQueue().then((queue) => {
        if (queue && queue.length > 0) setOfflineQueue(queue)
      }).catch((e) => console.warn('Error fetching IndexedDB queue:', e))
    }

    async function loadConfig() {
      setLoadingConfig(true)
      try {
        const cachedAuth = await getOfflineAuthSession().catch(() => null)
        if (cachedAuth?.profile) setFacultyProfile(cachedAuth.profile)

        if (typeof window !== 'undefined') {
          const cachedRestrict = safeStorage.getItem('faculty_restrict_batch')
          if (cachedRestrict !== null) setRestrictFaculty(cachedRestrict === 'true')
          const cachedProfile = safeStorage.getItem('faculty_cached_profile')
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
          if (typeof window !== 'undefined') safeStorage.setItem('faculty_cached_profile', JSON.stringify(prof))
          if (prof.batch) {
            supabase.from('batch_venues').select('venue').eq('batch', prof.batch).maybeSingle()
              .then(({ data }) => { if (data) setBatchVenue(data.venue) })
          }
        }

        const { data: settings } = await supabase
          .from('session_settings')
          .select('restrict_faculty_batch')
          .eq('id', 1)
          .single()
        if (settings) {
          setRestrictFaculty(!!settings.restrict_faculty_batch)
          if (typeof window !== 'undefined') safeStorage.setItem('faculty_restrict_batch', String(!!settings.restrict_faculty_batch))
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

        fetch('/api/admin/placement-drives')
          .then((res) => res.json())
          .then((json) => {
            if (json.success && Array.isArray(json.data)) {
              // Filter out drives whose end date (or start date) has already passed
              const todayIST = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
              const activeDrives = json.data.filter(
                (d: any) => {
                  const effectiveEnd = d.drive_date_end || d.drive_date
                  return !effectiveEnd || effectiveEnd >= todayIST
                }
              )
              setPlacementDrives(activeDrives)
              if (typeof window !== 'undefined') {
                const params = new URLSearchParams(window.location.search)
                const urlDriveId = params.get('drive_id')
                if (urlDriveId) {
                  setScanTargetMode('placement')
                  setSelectedPlacementDriveId(urlDriveId)
                } else {
                  if (activeDrives.length > 0) setSelectedPlacementDriveId(activeDrives[0].id)
                  if (activeModule === 'cdc') setScanTargetMode('cdc')
                  else if (activeModule === 'placements') setScanTargetMode('placement')
                }
              }
            }
          })
          .catch((e) => console.error('Error loading placement drives:', e))
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
      safeStorage.setItem('scan_haptics_enabled', String(newVal))
      return newVal
    })
  }

  const triggerHaptic = (pattern: number[]) => {
    if (hapticsEnabled && typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate(pattern) } catch {}
    }
  }

  // Restart scanner when user returns from phone call or tab switch
  useEffect(() => {
    if (!active) return
    function handleVisibility() {
      if (document.visibilityState === 'visible') {
        processingRef.current = false
        // Re-apply focus constraints without a full restart when returning from background
        applyFocusConstraints()
        setActive(false)
        setTimeout(() => setActive(true), 200)
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [active])

  // Apply continuous autofocus to whichever video track is active
  const applyFocusConstraints = async () => {
    try {
      const videoEl = document.querySelector<HTMLVideoElement>('#qr-reader video')
      if (!videoEl?.srcObject) return
      const stream = videoEl.srcObject as MediaStream
      const track = stream.getVideoTracks()[0]
      if (!track) return
      const caps = track.getCapabilities?.() as any
      const constraints: MediaTrackConstraintSet & { advanced?: any[] } = {}
      // Only set what the device supports to avoid OverconstrainedError
      if (caps?.focusMode?.includes?.('continuous')) {
        constraints.advanced = [{ focusMode: 'continuous' }]
      }
      await track.applyConstraints(constraints)
    } catch {
      // Focus API not supported on this device — silently ignore
    }
  }

  useEffect(() => {
    if (!active) return
    let isCancelled = false

    async function startScanner() {
      setCameraError(null)
      try {
        if (typeof window !== 'undefined' && !window.isSecureContext && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
          throw new Error('Camera access requires HTTPS or localhost. Current HTTP connection is insecure.')
        }
        if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('Camera API (getUserMedia) is not supported or blocked by browser settings.')
        }

        const { Html5Qrcode } = await import('html5-qrcode')
        if (isCancelled) return

        if (scannerRef.current) {
          try {
            if (scannerRef.current.isScanning) {
              await scannerRef.current.stop()
            }
            await scannerRef.current.clear()
          } catch (e) {
            console.warn('Error clearing existing scanner:', e)
          }
          scannerRef.current = null
        }

        const html5QrCode = new Html5Qrcode('qr-reader')
        scannerRef.current = html5QrCode

        const qrConfig = { fps: 30, qrbox: { width: 240, height: 240 }, aspectRatio: 1.0 }

        let started = false

        // Attempt 1: Facing mode environment (Back Camera)
        try {
          await html5QrCode.start(
            { facingMode: 'environment' },
            qrConfig,
            handleQrCode,
            () => {}
          )
          started = true
        } catch (envErr) {
          console.warn('Environment camera failed, trying fallback camera:', envErr)
        }

        // Attempt 2: Facing mode user (Front Camera / Desktop Webcam)
        if (!started && !isCancelled) {
          try {
            await html5QrCode.start(
              { facingMode: 'user' },
              qrConfig,
              handleQrCode,
              () => {}
            )
            started = true
          } catch (userErr) {
            console.warn('User camera failed, trying available devices list:', userErr)
          }
        }

        // Attempt 3: Specific Camera device ID
        if (!started && !isCancelled) {
          try {
            const devices = await Html5Qrcode.getCameras()
            if (devices && devices.length > 0) {
              await html5QrCode.start(
                devices[0].id,
                qrConfig,
                handleQrCode,
                () => {}
              )
              started = true
            }
          } catch (devErr) {
            console.warn('Device ID camera start failed:', devErr)
          }
        }

        if (!started && !isCancelled) {
          throw new Error('Could not access camera. Please check camera permissions in your browser.')
        }

        if (isCancelled && html5QrCode.isScanning) {
          await html5QrCode.stop()
          return
        }

        await applyFocusConstraints()
      } catch (err: any) {
        if (!isCancelled) {
          console.error('Camera start failed:', err)
          const errMsg = err?.message || 'Camera access denied. Enable camera permission in your browser.'
          setCameraError(errMsg)
          setResult({ type: 'error', message: errMsg })
          setActive(false)
        }
      }
    }

    startScanner()
    return () => {
      isCancelled = true
      if (scannerRef.current) {
        const scanner = scannerRef.current
        scannerRef.current = null
        if (scanner?.isScanning) scanner.stop().catch(() => {})
      }
    }
  }, [active])

  useEffect(() => {
    return () => { if (timeoutIdRef.current) clearTimeout(timeoutIdRef.current) }
  }, [])

  const addToRecentScans = (
    id: string, name: string, session: string,
    type: 'success' | 'duplicate' | 'error', message?: string
  ) => {
    const timeStr = new Date().toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
    setRecentScans((prev) => {
      if (prev.length > 0 && prev[0].id === id && prev[0].type === type) return prev
      return [{ id, name, session, type, time: timeStr, message }, ...prev].slice(0, 8)
    })
  }

  // ⚡ Fast inline feedback — no blocking modal, short display then auto-clear
  const FEEDBACK_DURATION = 350 // ms — clear and unlock for next scan

  const scheduleClear = (delay: number = FEEDBACK_DURATION) => {
    if (timeoutIdRef.current) clearTimeout(timeoutIdRef.current)
    timeoutIdRef.current = setTimeout(() => {
      setResult(null)
      processingRef.current = false
    }, delay)
  }

  const dismissPopup = () => {
    if (timeoutIdRef.current) clearTimeout(timeoutIdRef.current)
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

      try {
        const syncEndpoint = scanTargetModeRef.current === 'cdc' ? '/api/attendance/mark-cdc' : '/api/attendance/mark'
        const res = await fetch(syncEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            scans: offlineQueueRef.current.map((scan) => ({
              token: scan.token, mode: 'offline',
              scan_timestamp: scan.timestamp, scan_date: scan.date,
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
              processedScans.push({ id: originalScan.student_id, name: originalScan.name, session: resItem.session || (sessionMode + '1'), type: 'success', message: 'Marked Present (Synced)' })
            } else {
              duplicateCount++
              processedScans.push({ id: originalScan.student_id, name: originalScan.name, session: sessionMode + '1', type: 'duplicate', message: resItem?.message ?? 'Already Verified' })
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

      setOfflineQueue(remainingQueue)
      if (remainingQueue.length === 0) clearOfflineQueue().catch(() => {})
      if (successCount > 0) setScanCount(c => c + successCount)
      processedScans.forEach(scan => addToRecentScans(scan.id, scan.name, scan.session, scan.type, scan.message))

      let alertMsg = `Sync complete! `
      if (successCount > 0) alertMsg += `${successCount} present marked. `
      if (duplicateCount > 0) alertMsg += `${duplicateCount} already verified. `
      if (failureCount > 0) alertMsg += `${failureCount} failed. `
      if (remainingQueue.length > 0) alertMsg += `${remainingQueue.length} scans remaining in queue.`
      alert(alertMsg)
    } catch (e) {
      console.error('Sync failed', e)
      alert('An unexpected error occurred during sync.')
    } finally {
      setIsSyncing(false)
    }
  }, [supabase, sessionMode])

  useEffect(() => {
    const handleOnline = () => { if (offlineQueueRef.current.length > 0) syncOfflineScans() }
    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [syncOfflineScans])

  async function handleQrCode(text: string) {
    if (processingRef.current) return
    processingRef.current = true
    if (timeoutIdRef.current) clearTimeout(timeoutIdRef.current)

    try {
      const key = scanKeyRef.current
      if (!key) {
        setResult({ type: 'error', message: 'Scanner not ready — connect once to sync key.' })
        triggerHaptic([400])
        addToRecentScans('N/A', 'No Key', 'N/A', 'error')
        scheduleClear()
        return
      }

      const payload: QrPayload | null = await decryptQrToken(text, key)
      if (!payload) {
        setResult({ type: 'error', message: 'Invalid QR — re-align.' })
        triggerHaptic([400])
        addToRecentScans('N/A', 'Invalid QR', 'N/A', 'error')
        scheduleClear()
        return
      }

      if (!payload.student_id || payload.ts === undefined || payload.ts === null) {
        setResult({ type: 'error', message: 'Invalid QR structure.' })
        triggerHaptic([400])
        addToRecentScans('N/A', payload.name || 'Unknown', 'N/A', 'error')
        scheduleClear()
        return
      }

      const isOfflinePass = payload.mode === 'offline' || payload.ts === 0
      if (isOfflinePass && payload.date && payload.date !== todayIST()) {
        setResult({ type: 'error', message: `Offline pass expired (${payload.date}).` })
        triggerHaptic([400])
        addToRecentScans(payload.student_id, payload.name, 'N/A', 'error')
        scheduleClear()
        return
      }

      if (!isQrFresh(payload.ts, isOfflinePass)) {
        setResult({ type: 'error', message: 'QR expired. Ask student to refresh.' })
        triggerHaptic([400])
        addToRecentScans(payload.student_id, payload.name, 'N/A', 'error')
        scheduleClear()
        return
      }

      // CDC Classes
      if (scanTargetModeRef.current === 'cdc') {
        // Offline or force-offline: fall back to the general offline queue
        if (forceOffline || !navigator.onLine) {
          const isAlreadyQueued = offlineQueueRef.current.some(x => x.student_id === payload.student_id)
          if (isAlreadyQueued) {
            setResult({ type: 'duplicate', message: 'Already queued offline', studentName: payload.name, studentId: payload.student_id })
            triggerHaptic([300])
            addToRecentScans(payload.student_id, payload.name, 'CDC', 'duplicate')
            scheduleClear()
            return
          }
          const newScan: OfflineScan = {
            student_id: payload.student_id, name: payload.name,
            department: payload.department, section: payload.section,
            year: payload.year, batch: payload.batch || null,
            ts: payload.ts, token: text,
            timestamp: new Date().toISOString(), date: todayIST()
          }
          const updatedQueue = [...offlineQueueRef.current, newScan]
          setOfflineQueue(updatedQueue)
          saveOfflineScan(newScan).catch(() => {})
          triggerHaptic([80, 40, 80])
          processingRef.current = false
          setResult({ type: 'success', message: 'Saved Offline (CDC)', studentName: payload.name, studentId: payload.student_id, session: 'CDC' })
          addToRecentScans(payload.student_id, payload.name, 'CDC', 'success', 'Offline')
          scheduleClear(500)
          return
        }
        const cdcController = new AbortController()
        const cdcTimeout = setTimeout(() => cdcController.abort(), 5000)
        try {
          const res = await fetch('/api/attendance/mark-cdc', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: cdcController.signal,
            body: JSON.stringify({ token: text }),
          })
          clearTimeout(cdcTimeout)
          const json = await res.json()
          if (json.success) {
            setScanCount((c) => c + 1)
            setCdcCurrentPeriod(json.period_number ?? cdcCurrentPeriod)
            setResult({ type: 'success', message: 'Present', studentName: payload.name, studentId: payload.student_id, session: json.period_number ? `P${json.period_number}` : 'CDC' })
            triggerHaptic([80, 40, 80])
            addToRecentScans(payload.student_id, payload.name, json.period_number ? `P${json.period_number}` : 'CDC', 'success')
          } else {
            const isDup = json.message?.toLowerCase().includes('already')
            setResult({ type: isDup ? 'duplicate' : 'error', message: json.message || 'Error', studentName: payload.name, studentId: payload.student_id })
            triggerHaptic([300])
            addToRecentScans(payload.student_id, payload.name, 'CDC', isDup ? 'duplicate' : 'error', json.message)
          }
        } catch (err: any) {
          clearTimeout(cdcTimeout)
          // Network failure → fall back to offline queue
          if (err?.name === 'AbortError' || err instanceof TypeError || !navigator.onLine) {
            const isAlreadyQueued = offlineQueueRef.current.some(x => x.student_id === payload.student_id)
            if (!isAlreadyQueued) {
              const newScan: OfflineScan = {
                student_id: payload.student_id, name: payload.name,
                department: payload.department, section: payload.section,
                year: payload.year, batch: payload.batch || null,
                ts: payload.ts, token: text,
                timestamp: new Date().toISOString(), date: todayIST()
              }
              const updatedQueue = [...offlineQueueRef.current, newScan]
              setOfflineQueue(updatedQueue)
              saveOfflineScan(newScan).catch(() => {})
              triggerHaptic([80, 40, 80])
              processingRef.current = false
              setResult({ type: 'success', message: 'Saved Offline (CDC)', studentName: payload.name, studentId: payload.student_id, session: 'CDC' })
              addToRecentScans(payload.student_id, payload.name, 'CDC', 'success', 'Offline')
              scheduleClear(500)
              return
            }
          } else {
            setResult({ type: 'error', message: err.message || 'CDC error' })
            triggerHaptic([300])
          }
        } finally {
          scheduleClear()
        }
        return
      }

      // Placement Drive
      if (scanTargetModeRef.current === 'placement') {
        const activeDriveId = selectedPlacementDriveIdRef.current
        if (!activeDriveId) {
          setResult({ type: 'error', message: 'Select a Placement Drive first.' })
          triggerHaptic([300])
          addToRecentScans(payload.student_id, payload.name, 'Placement', 'error')
          scheduleClear()
          return
        }
        try {
          const res = await fetch(`/api/admin/placement-drives/${activeDriveId}/attendance`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: text, status: 'Present' }),
          })
          const json = await res.json()
          const driveLabel = placementDrivesRef.current.find((d) => d.id === activeDriveId)?.company_name || 'Drive'
          if (json.success) {
            setScanCount((c) => c + 1)
            setResult({ type: 'success', message: 'Present', studentName: json.student_name, studentId: json.student_id, session: driveLabel })
            triggerHaptic([80, 40, 80])
            addToRecentScans(json.student_id, json.student_name, driveLabel, 'success')
          } else {
            setResult({ type: 'error', message: json.error || 'Not eligible', studentName: json.student_name || payload.name, studentId: payload.student_id })
            triggerHaptic([300])
            addToRecentScans(payload.student_id, payload.name, driveLabel, 'error', json.error)
          }
        } catch (err: any) {
          setResult({ type: 'error', message: err.message || 'Placement error' })
          triggerHaptic([300])
        } finally {
          scheduleClear()
        }
        return
      }

      // Batch restriction check
      if (restrictFaculty && !facultyProfile?.special_login) {
        if (!facultyProfile?.batch) {
          setResult({ type: 'error', message: 'Select a batch first.' })
          triggerHaptic([300])
          addToRecentScans('N/A', payload.name, 'N/A', 'error')
          scheduleClear()
          return
        }
        if (!payload.batch || payload.batch !== facultyProfile.batch) {
          setResult({ type: 'error', message: `Batch mismatch: You→${facultyProfile.batch}, Student→${payload.batch || 'None'}` })
          triggerHaptic([300])
          addToRecentScans(payload.student_id, payload.name, 'N/A', 'error')
          scheduleClear()
          return
        }
      }

      // Online / Offline attendance mark
      let dbResult: any = null
      let networkErrorOccurred = false

      if (forceOffline || !navigator.onLine) {
        networkErrorOccurred = true
      } else {
        const controller = new AbortController()
        const fetchTimeout = setTimeout(() => controller.abort(), 800)
        try {
          const res = await fetch('/api/attendance/mark', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
              token: text,
              // Explicitly signal offline-pass mode so server can detect it from
              // BOTH the request body AND the encrypted payload.mode / ts===0.
              ...(isOfflinePass ? { mode: 'offline', scan_date: todayIST() } : {}),
            }),
          })
          clearTimeout(fetchTimeout)
          const contentType = res.headers.get('content-type') || ''
          const data = contentType.includes('application/json') ? await res.json().catch(() => null) : null
          if (!data) {
            networkErrorOccurred = true
          } else if (res.status === 401) {
            setResult({ type: 'error', message: 'Session expired. Please log in again.' })
            triggerHaptic([300])
            addToRecentScans(payload.student_id, payload.name, 'N/A', 'error')
            scheduleClear()
            return
          } else if (!res.ok) {
            setResult({ type: 'error', message: data?.message || 'DB error' })
            triggerHaptic([300])
            addToRecentScans(payload.student_id, payload.name, 'N/A', 'error')
            scheduleClear()
            return
          } else {
            dbResult = data
          }
        } catch (err: any) {
          clearTimeout(fetchTimeout)
          if (
            err?.name === 'AbortError' || err?.name === 'SyntaxError' || err instanceof TypeError ||
            err.message?.includes('fetch') || err.message?.includes('network') ||
            err.message?.includes('Failed to fetch') || err.message?.includes('JSON') ||
            err.message?.includes('Unexpected token') || err.status === 0 || !navigator.onLine
          ) {
            networkErrorOccurred = true
          } else {
            setResult({ type: 'error', message: err?.message ?? 'Unexpected error' })
            triggerHaptic([300])
            addToRecentScans(payload.student_id, payload.name, 'N/A', 'error')
            scheduleClear()
            return
          }
        }
      }

      if (networkErrorOccurred) {
        const isAlreadyOffline = offlineQueueRef.current.some(x => x.student_id === payload.student_id)
        if (isAlreadyOffline) {
          setResult({ type: 'duplicate', message: 'Already queued offline', studentName: payload.name, studentId: payload.student_id })
          triggerHaptic([300])
          addToRecentScans(payload.student_id, payload.name, sessionMode + '1', 'duplicate')
          scheduleClear()
          return
        }
        const newScan: OfflineScan = {
          student_id: payload.student_id, name: payload.name,
          department: payload.department, section: payload.section,
          year: payload.year, batch: payload.batch || null,
          ts: payload.ts, token: text,
          timestamp: new Date().toISOString(), date: todayIST()
        }
        const updatedQueue = [...offlineQueueRef.current, newScan]
        setOfflineQueue(updatedQueue)
        saveOfflineScan(newScan).catch(() => {})
        triggerHaptic([80, 40, 80])
        processingRef.current = false
        setResult({ type: 'success', message: 'Saved Offline', studentName: payload.name, studentId: payload.student_id, session: sessionMode + '1' })
        addToRecentScans(payload.student_id, payload.name, sessionMode + '1', 'success', 'Offline')
        scheduleClear(500)
        return
      }

      if (dbResult?.success) {
        setScanCount((c) => c + 1)
        const sess = dbResult.session || (sessionMode + '1')
        setResult({ type: 'success', message: 'Present ✓', studentName: payload.name, studentId: payload.student_id, session: sess })
        triggerHaptic([80, 40, 80])
        addToRecentScans(payload.student_id, payload.name, sess, 'success')
        scheduleClear()
      } else {
        const msg = dbResult?.message ?? 'Already verified'
        setResult({ type: 'duplicate', message: msg, studentName: payload.name, studentId: payload.student_id })
        triggerHaptic([300])
        addToRecentScans(payload.student_id, payload.name, sessionMode + '1', 'duplicate', msg)
        scheduleClear()
      }
    } catch (err: any) {
      setResult({ type: 'error', message: err?.message ?? 'Unexpected error' })
      triggerHaptic([300])
      addToRecentScans('N/A', 'Error', 'N/A', 'error')
      scheduleClear()
    }
  }

  const isRestricted = restrictFaculty && !facultyProfile?.batch && !facultyProfile?.special_login

  return (
    <div className="relative space-y-4 animate-fade-in pb-16 max-w-2xl mx-auto px-3 md:px-0">
      {/* Ambient background */}
      <div className="absolute inset-0 z-[-1] pointer-events-none opacity-50 overflow-hidden">
        <div className="absolute top-[-5%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-indigo-200/40 blur-[120px] mix-blend-multiply animate-pulse" style={{ animationDuration: '8s' }} />
        <div className="absolute bottom-[-5%] right-[-10%] w-[45vw] h-[45vw] rounded-full bg-purple-200/40 blur-[120px] mix-blend-multiply animate-pulse" style={{ animationDuration: '10s' }} />
      </div>

      {/* ── TOP BAR ── */}
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={() => router.push('/faculty')}
          className="clay-button-secondary inline-flex items-center gap-2 px-4 py-2.5 text-xs font-extrabold text-slate-700 min-h-[44px]"
        >
          <span>←</span>
          <span>Dashboard</span>
        </button>

        <div className="flex items-center gap-2">
          {/* Scan counter badge */}
          <span className="clay-badge bg-brand-50 border border-brand-200 px-3 py-1.5 text-xs font-black text-brand-700 flex items-center gap-1.5">
            ✓ <span className="text-base">{scanCount}</span> scanned
          </span>

          {/* Online status */}
          {!scanKey ? (
            <span className="clay-badge bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-extrabold px-3 py-1.5">🔑 Syncing…</span>
          ) : isOnline ? (
            <span className="clay-badge bg-emerald-100 text-emerald-900 border border-emerald-300 text-[10px] font-black px-3 py-1.5 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />Online
            </span>
          ) : (
            <span className="clay-badge bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-black px-3 py-1.5 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500" />Offline
            </span>
          )}
        </div>
      </div>

      {/* ── COMPACT CONTROLS ROW ── */}
      <div className="grid grid-cols-2 gap-2">
        {/* Offline / Online toggle */}
        <button
          onClick={() => setForceOffline((prev) => !prev)}
          className={`clay-card p-3 flex items-center justify-between text-left transition-all min-h-[48px] ${
            forceOffline ? 'clay-card-amber text-amber-950 border-amber-300' : 'bg-white text-slate-800 border-slate-200/80'
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="text-lg">{forceOffline ? '⚡' : '📡'}</span>
            <div>
              <p className="text-[10px] font-black leading-tight">{forceOffline ? 'Fast Offline' : 'Online Sync'}</p>
              <p className="text-[9px] opacity-70 font-semibold">{forceOffline ? 'Queue locally' : 'Live verify'}</p>
            </div>
          </div>
          <span className={`clay-badge px-2 py-0.5 text-[9px] font-black ${forceOffline ? 'bg-amber-200/80 text-amber-950' : 'bg-emerald-100 text-emerald-800'}`}>
            {forceOffline ? 'OFF' : 'ON'}
          </span>
        </button>

        {/* Haptic toggle */}
        <button
          onClick={toggleHaptics}
          className={`clay-card p-3 flex items-center justify-between text-left transition-all min-h-[48px] ${
            hapticsEnabled ? 'bg-gradient-to-r from-indigo-50 to-purple-50 text-indigo-950 border-indigo-200' : 'bg-white text-slate-400 border-slate-200/80'
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="text-lg">{hapticsEnabled ? '📳' : '📴'}</span>
            <div>
              <p className="text-[10px] font-black text-slate-800 leading-tight">Vibration</p>
              <p className="text-[9px] text-slate-500 font-semibold">{hapticsEnabled ? 'Active' : 'Disabled'}</p>
            </div>
          </div>
          <span className={`clay-badge px-2 py-0.5 text-[9px] font-black ${hapticsEnabled ? 'bg-indigo-100 text-indigo-900' : 'bg-slate-100 text-slate-500'}`}>
            {hapticsEnabled ? 'ON' : 'OFF'}
          </span>
        </button>
      </div>

      {/* ── TARGET MODE SWITCHER ── */}
      <div className="clay-card p-1.5 rounded-[1.5rem] flex items-center gap-1.5 min-h-[48px]">
        <button
          onClick={() => setScanTargetMode('cdc')}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-extrabold transition-all min-h-[40px] ${
            scanTargetMode === 'cdc' ? 'clay-button text-white shadow-md' : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          🎓 CDC Period
        </button>
        <button
          onClick={() => setScanTargetMode('placement')}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-extrabold transition-all min-h-[40px] ${
            scanTargetMode === 'placement' ? 'clay-button text-white shadow-md' : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          🚀 Placement
        </button>
      </div>

      {/* CDC period info (compact) */}
      {scanTargetMode === 'cdc' && cdcCurrentPeriod && (
        <div className="clay-badge bg-emerald-50 border border-emerald-200 px-4 py-2 text-xs font-black text-emerald-800 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          Period {cdcCurrentPeriod} active — scans go here
        </div>
      )}
      {scanTargetMode === 'cdc' && !cdcCurrentPeriod && !loadingConfig && (
        <div className="clay-badge bg-amber-50 border border-amber-200 px-4 py-2 text-xs font-bold text-amber-800 flex items-center gap-2">
          ⚠️ No active CDC period
        </div>
      )}

      {/* Placement Drive selector */}
      {scanTargetMode === 'placement' && (
        <div className="clay-card p-4 space-y-2">
          <label className="block text-[10px] font-black text-brand-900 uppercase tracking-wider">Placement Drive *</label>
          {placementDrives.length === 0 ? (
            <p className="text-xs text-slate-500 font-semibold">No active drives. Create in Admin Portal.</p>
          ) : (
            <select
              value={selectedPlacementDriveId}
              onChange={(e) => setSelectedPlacementDriveId(e.target.value)}
              className="clay-input w-full min-h-[44px] px-3 py-2.5 text-xs font-extrabold text-slate-800"
            >
              {placementDrives.map((d) => (
                <option key={d.id} value={d.id}>{d.company_name} — {d.drive_date}</option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* Offline Queue Sync */}
      {offlineQueue.length > 0 && (
        <div className="clay-card-amber p-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="text-xl animate-pulse">☁️</span>
            <div>
              <p className="text-xs font-black text-amber-950">{offlineQueue.length} pending offline scan{offlineQueue.length > 1 ? 's' : ''}</p>
              <p className="text-[9px] text-amber-800 font-bold">Tap to sync when connected</p>
            </div>
          </div>
          <button
            onClick={syncOfflineScans}
            disabled={isSyncing}
            className={`clay-button px-3.5 py-2 text-xs font-extrabold flex-shrink-0 min-h-[40px] ${isSyncing ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {isSyncing ? 'Syncing…' : 'Sync'}
          </button>
        </div>
      )}

      {/* ── MAIN CAMERA VIEWFINDER ── */}
      <div className="clay-card p-0 rounded-[2rem] bg-slate-950 border border-white/10 relative overflow-hidden shadow-2xl">
        {/* Scanner laser overlay */}
        {active && (
          <div className="absolute inset-0 z-20 pointer-events-none neon-scanner-border">
            <div className="scanner-laser" />
          </div>
        )}

        {/* ── INLINE RESULT OVERLAY (non-blocking, inside camera frame) ── */}
        {result && active && (
          <div
            onClick={dismissPopup}
            className="absolute inset-0 z-30 flex items-center justify-center pointer-events-auto"
            style={{
              background: result.type === 'success'
                ? 'rgba(16,185,129,0.88)'
                : result.type === 'duplicate'
                ? 'rgba(245,158,11,0.88)'
                : 'rgba(239,68,68,0.88)',
              backdropFilter: 'blur(4px)',
              transition: 'opacity 120ms',
            }}
          >
            <div className="text-center space-y-2 px-6 py-4">
              <div className="text-5xl select-none">
                {result.type === 'success' ? '✓' : result.type === 'duplicate' ? '⚠' : '✕'}
              </div>
              {result.studentName && (
                <p className="text-white font-black text-base leading-tight">{result.studentName}</p>
              )}
              {result.studentId && (
                <p className="text-white/80 font-mono text-xs">{result.studentId}</p>
              )}
              {result.session && (
                <p className="text-white/90 text-[10px] font-black uppercase tracking-widest">
                  {result.session}
                </p>
              )}
              <p className="text-white/80 text-[10px] font-bold">{result.message}</p>
              <p className="text-white/50 text-[9px]">tap to continue</p>
            </div>
          </div>
        )}

        <div id="qr-reader" className="w-full relative z-10 min-h-[300px] bg-slate-900" />

        {/* Restricted or Camera Start prompt */}
        {!active ? (
          <div className="p-8 text-center space-y-4 relative z-20 bg-slate-950">
            <div className="w-16 h-16 rounded-full bg-brand-500/20 border border-brand-500/30 text-brand-400 flex items-center justify-center text-3xl mx-auto animate-pulse clay-badge-dark">
              📷
            </div>
            <div className="space-y-1">
              <h4 className="text-base font-black text-white font-heading">Camera Access Required</h4>
              <p className="text-xs text-slate-400 max-w-xs mx-auto font-medium">
                Grant camera permission to scan QR codes.
              </p>
            </div>

            {cameraError && (
              <div className="p-3 bg-red-950/80 border border-red-500/50 rounded-xl text-left space-y-1 my-2">
                <p className="text-xs font-bold text-red-300 flex items-center gap-1.5">
                  <span>⚠️</span> Camera Error
                </p>
                <p className="text-[11px] text-red-200/90 font-medium leading-relaxed">
                  {cameraError}
                </p>
                <p className="text-[10px] text-red-300/70 font-semibold pt-1">
                  Click the lock 🔒 or camera icon in your browser URL bar to allow camera access.
                </p>
              </div>
            )}

            {isRestricted ? (
              <button disabled className="clay-button w-full min-h-[52px] py-4 text-sm font-extrabold opacity-40 cursor-not-allowed shadow-none">
                Select Batch to Start Scanner
              </button>
            ) : (
              <button
                onClick={() => {
                  setCameraError(null)
                  setActive(true)
                }}
                className="clay-button w-full min-h-[52px] py-4 text-sm font-extrabold text-white"
              >
                Start Attendance Scanner
              </button>
            )}
          </div>
        ) : (
          <div className="px-4 py-3 bg-slate-950/90 border-t border-white/10 relative z-20 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span className="text-[10px] text-slate-300 font-bold uppercase tracking-wider">Scanning…</span>
            </div>
            <div className="flex items-center gap-2">
              {/* Tap to force a continuous-autofocus reset without stopping camera */}
              <button
                onClick={applyFocusConstraints}
                title="Re-focus camera"
                className="py-2 px-3 rounded-xl bg-white/10 border border-white/20 text-white text-xs font-black min-h-[40px] active:translate-y-0.5 transition-all flex items-center gap-1.5"
              >
                🔍 Focus
              </button>
              <button
                onClick={() => {
                  if (scannerRef.current?.isScanning) scannerRef.current.stop()
                  setActive(false)
                }}
                className="py-2 px-4 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 text-white text-xs font-black min-h-[40px] shadow-lg shadow-red-600/30 active:translate-y-0.5 transition-all"
              >
                Stop
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── RECENT SCANS FEED ── */}
      {active && recentScans.length > 0 && (
        <div className="clay-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-[10px] font-black text-slate-800 uppercase tracking-wider">Recent Scans</h3>
            <span className="clay-badge bg-emerald-100 text-emerald-800 border border-emerald-200 px-2.5 py-0.5 text-[9px] font-black flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />Live
            </span>
          </div>
          <div className="space-y-1.5 max-h-[240px] overflow-y-auto pr-0.5">
            {recentScans.map((scan, i) => (
              <div
                key={`${scan.id}-${i}`}
                className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50/80 border border-slate-200/60 gap-2"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-[10px] flex-shrink-0 font-black ${
                    scan.type === 'success' ? 'bg-emerald-100 text-emerald-800' :
                    scan.type === 'duplicate' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {scan.type === 'success' ? '✓' : scan.type === 'duplicate' ? '!' : '✕'}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-black text-slate-800 truncate">{scan.name}</p>
                    <p className="text-[9px] font-mono text-slate-500">{scan.id}</p>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-[9px] font-bold text-slate-500">{scan.time}</p>
                  <p className="text-[9px] font-black text-slate-600">{scan.session}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
