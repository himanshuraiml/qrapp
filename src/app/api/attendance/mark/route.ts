import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { verifyQrSignature } from '@/lib/qrSignature'
import { todayIST } from '@/lib/utils'

// Replaces the old flow where the faculty scanner called
// supabase.rpc('mark_attendance_safe', ...) directly from the browser with
// a client-controlled p_marked_by UUID and no signature on the QR payload
// (VAPT Vuln 1-4: forgeable QR, direct RPC injection, self-registration
// UUID bypass, missing RBAC). This route:
//   1. Authenticates the caller from their session cookie (never trusts a
//      client-supplied marker id).
//   2. Verifies the QR payload's HMAC signature — only ever issued by
//      /api/attendance/qr-token for a real logged-in student.
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
    const { sig, mode, scan_timestamp, scan_date, ...payload } = body ?? {}

    if (!payload?.student_id || !payload?.ts) {
      return NextResponse.json({ success: false, message: 'Invalid QR code structure.' }, { status: 400 })
    }

    if (!verifyQrSignature(payload, sig)) {
      return NextResponse.json({ success: false, message: 'Invalid or tampered QR code.' }, { status: 400 })
    }

    // Live scans must be fresh (30s TTL, matches QrDisplay's refresh cycle).
    // Offline-queued scans are verified at sync time, potentially hours
    // later, so they get a coarser 24h bound instead — the signature check
    // above is what actually prevents forgery either way.
    const nowSec = Math.floor(Date.now() / 1000)
    const maxAgeSeconds = mode === 'offline' ? 60 * 60 * 24 : 30
    if (nowSec - payload.ts > maxAgeSeconds || payload.ts > nowSec + 5) {
      return NextResponse.json({ success: false, message: 'QR code expired. Ask student to refresh their code.' }, { status: 400 })
    }

    const effectiveTimestamp = typeof scan_timestamp === 'string' ? scan_timestamp : new Date().toISOString()
    const effectiveDate = typeof scan_date === 'string' ? scan_date : todayIST()

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
