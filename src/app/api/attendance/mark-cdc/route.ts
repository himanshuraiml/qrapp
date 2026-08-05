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
    const { token } = body ?? {}

    const payload = decryptQrPayload(token)
    if (!payload) {
      return NextResponse.json({ success: false, message: 'Invalid or tampered QR code.' }, { status: 400 })
    }

    const nowSec = Math.floor(Date.now() / 1000)
    if (nowSec - payload.ts > 120 || payload.ts > nowSec + 10) {
      return NextResponse.json({ success: false, message: 'QR code expired. Ask student to refresh their code.' }, { status: 400 })
    }

    const { data, error } = await supabase.rpc('mark_cdc_attendance_safe', {
      p_student_id: payload.student_id,
      p_student_name: payload.name,
      p_department: payload.department,
      p_section: payload.section,
      p_year: payload.year,
      p_batch: payload.batch,
      p_date: todayIST(),
      p_timestamp: new Date().toISOString(),
    })

    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err?.message ?? 'Unexpected error' }, { status: 500 })
  }
}
