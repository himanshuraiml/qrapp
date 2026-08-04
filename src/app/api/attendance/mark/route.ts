import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { decryptQrPayload } from '@/lib/qrSignature'
import { todayIST } from '@/lib/utils'

// Replaces the old flow where the faculty scanner called
// supabase.rpc('mark_attendance_safe', ...) directly from the browser with
// a client-controlled p_marked_by UUID and no signature on the QR payload
// (VAPT Vuln 1-4: forgeable QR, direct RPC injection, self-registration
// UUID bypass, missing RBAC). This route:
//   1. Authenticates the caller from their session cookie (never trusts a
//      client-supplied marker id).
//   2. Decrypts the QR payload server-side (AES-256-GCM) — only ever issued
//      by /api/attendance/qr-token for a real logged-in student. The client
//      supplies only the opaque token; every field used below (student_id,
//      name, department, ts, date, mode...) comes from the decrypted
//      payload, never from client-supplied fields.
//   3. Calls the hardened mark_attendance_safe RPC, which itself re-derives
//      and re-checks the marker's role server-side (defense in depth).

// Best-effort in-process rate limit. Each serverless instance keeps its own
// map, so this does not guarantee a global cap — pair with edge/hosting
// level rate limiting (e.g. Vercel/Cloudflare) for real DoS protection.
const recentRequests = new Map<string, number[]>()
const RATE_LIMIT_PER_MINUTE = 60

function isRateLimited(key: string): boolean {
  const now = Date.now()
  const windowStart = now - 60_000
  const hits = (recentRequests.get(key) ?? []).filter((t) => t > windowStart)
  hits.push(now)
  recentRequests.set(key, hits)
  return hits.length > RATE_LIMIT_PER_MINUTE
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
    const { token, mode, scan_timestamp, scan_date } = body ?? {}

    const payload = decryptQrPayload(token)
    if (!payload) {
      return NextResponse.json({ success: false, message: 'Invalid or tampered QR code.' }, { status: 400 })
    }

    // `mode` from the request body is a client-supplied timing hint only —
    // it is never trusted for identity (every identity field below comes
    // from the decrypted, tamper-proof payload). It just says "apply the
    // lenient same-day expiry window instead of the strict 120s live-scan
    // TTL," which the faculty scanner sets when syncing a scan that was
    // queued while its device was offline, regardless of whether the
    // original QR was itself an offline pass.
    const isOfflineMode = mode === 'offline' || payload.mode === 'offline'

    const nowSec = Math.floor(Date.now() / 1000)
    const effectiveDate = typeof scan_date === 'string' ? scan_date : (payload.date || todayIST())

    if (isOfflineMode) {
      // Offline mode check: Must be for today's date in IST (or recorded within 12 hours).
      // Offline passes are always issued with ts=0 (see qr-token/route.ts), so
      // isRecentTs must default to false when ts is 0 — otherwise a captured
      // offline pass would stay valid forever instead of expiring after its
      // issued date, since !isToday && !isRecentTs would never be true.
      const isToday = effectiveDate === todayIST()
      const isRecentTs = payload.ts > 0 ? (nowSec - payload.ts <= 43200) : false
      if (!isToday && !isRecentTs) {
        return NextResponse.json({ success: false, message: 'Offline QR pass has expired (must be from today).' }, { status: 400 })
      }
    } else {
      // Live scan check (120s TTL to handle poor mobile network latency and clock skew)
      if (nowSec - payload.ts > 120 || payload.ts > nowSec + 10) {
        return NextResponse.json({ success: false, message: 'QR code expired. Ask student to refresh their code.' }, { status: 400 })
      }
    }

    const effectiveTimestamp = typeof scan_timestamp === 'string' ? scan_timestamp : new Date().toISOString()

    const { data, error } = await supabase.rpc('mark_attendance_safe', {
      p_student_id: payload.student_id,
      p_student_name: payload.name,
      p_department: payload.department,
      p_section: payload.section,
      p_year: payload.year,
      p_batch: payload.batch,
      p_session: null,
      p_date: effectiveDate,
      p_timestamp: effectiveTimestamp,
    })

    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err?.message ?? 'Unexpected error' }, { status: 500 })
  }
}
