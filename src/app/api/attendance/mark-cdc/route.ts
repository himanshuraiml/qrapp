import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { decryptQrPayload } from '@/lib/qrSignature'
import { todayIST } from '@/lib/utils'

// Mirrors /api/attendance/mark (see that file for the full threat-model
// writeup): the QR is decrypted server-side, the marker is taken only from
// the authenticated session, and the hardened mark_cdc_attendance_safe RPC
// re-derives/re-checks the marker role itself. The only difference is which
// RPC gets called and that there is no offline-pass mode — CDC periods are
// short-lived (~50min) so a stale offline scan isn't a meaningful use case.
const recentRequests = new Map<string, number[]>()
const RATE_LIMIT_PER_MINUTE = 60

function isRateLimited(key: string): boolean {
  const now = Date.now()
  const windowStart = now - 60_000
  const hits = (recentRequests.get(key) ?? []).filter((t) => t > windowStart)
  if (hits.length >= RATE_LIMIT_PER_MINUTE) {
    return true
  }
  hits.push(now)
  recentRequests.set(key, hits)
  return false
}

if (typeof globalThis !== 'undefined') {
  const g = globalThis as any
  if (!g.__markCdcRateLimitCleanupTimer) {
    g.__markCdcRateLimitCleanupTimer = setInterval(() => {
      const cutoff = Date.now() - 60_000
      for (const [k, hits] of recentRequests) {
        if (hits.every((t) => t < cutoff)) recentRequests.delete(k)
      }
    }, 5 * 60_000)
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ success: false, message: 'Unauthorized: please log in again.' }, { status: 401 })
    }

    if (isRateLimited(user.id)) {
      return NextResponse.json({ success: false, message: 'Too many scans — please slow down.' }, { status: 429 })
    }

    const { data: marker } = await supabase
      .from('profiles')
      .select('role, status')
      .eq('id', user.id)
      .single()

    if (!marker || !['Faculty', 'Admin'].includes(marker.role)) {
      return NextResponse.json({ success: false, message: 'Forbidden: only Faculty or Admin can mark attendance.' }, { status: 403 })
    }
    if (marker.status !== 'Active') {
      return NextResponse.json({ success: false, message: 'Restricted: your account is deactivated.' }, { status: 403 })
    }

    const body = await request.json()
    const rawScans: any[] = Array.isArray(body?.scans) ? body.scans : [body ?? {}]

    if (rawScans.length === 0 || (!rawScans[0]?.token && rawScans.length === 1)) {
      return NextResponse.json({ success: false, message: 'No scan tokens provided.' }, { status: 400 })
    }

    const results: any[] = []
    const nowSec = Math.floor(Date.now() / 1000)

    for (const scanItem of rawScans) {
      const { token, mode, scan_timestamp, scan_date } = scanItem ?? {}

      const payload = decryptQrPayload(token)
      if (!payload) {
        results.push({ success: false, message: 'Invalid or tampered QR code.' })
        continue
      }

      // ts === 0 is the authoritative offline-pass indicator baked in by the server;
      // payload.mode === 'offline' is also present in all offline passes.
      const isOfflineMode = mode === 'offline' || payload.mode === 'offline' || payload.ts === 0
      const effectiveDate = typeof scan_date === 'string' ? scan_date : (payload.date || todayIST())

      if (isOfflineMode) {
        if (payload.date && payload.date !== effectiveDate) {
          results.push({
            success: false,
            message: `Offline QR pass was issued for ${payload.date}, but scanned on ${effectiveDate}.`
          })
          continue
        }

        const nowMs = Date.now()
        const scanDateMs = new Date(effectiveDate + 'T00:00:00+05:30').getTime()
        const diffDays = (nowMs - scanDateMs) / (1000 * 60 * 60 * 24)

        if (diffDays < -1 || diffDays > 7) {
          results.push({
            success: false,
            message: 'Offline scan date is outside the valid sync window (max 7 days).'
          })
          continue
        }
      } else {
        if (nowSec - payload.ts > 120 || payload.ts > nowSec + 15) {
          results.push({ success: false, message: 'QR code expired. Ask student to refresh their code.' })
          continue
        }
      }

      const effectiveTimestamp = typeof scan_timestamp === 'string' ? scan_timestamp : new Date().toISOString()

      const { data, error } = await supabase.rpc('mark_cdc_attendance_safe', {
        p_student_id: payload.student_id,
        p_student_name: payload.name,
        p_department: payload.department,
        p_section: payload.section,
        p_year: payload.year,
        p_batch: payload.batch,
        p_date: effectiveDate,
        p_timestamp: effectiveTimestamp,
      })

      if (error) {
        results.push({ success: false, message: error.message })
      } else {
        results.push(data)
      }
    }

    if (Array.isArray(body?.scans)) {
      return NextResponse.json({
        success: true,
        count: results.length,
        results,
      })
    }

    return NextResponse.json(results[0] ?? { success: false, message: 'No scan processed.' })
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err?.message ?? 'Unexpected error' }, { status: 500 })
  }
}

