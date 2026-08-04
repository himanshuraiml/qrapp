import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { signQrPayload } from '@/lib/qrSignature'

// Issues a short-lived, server-signed attendance QR payload for the
// currently logged-in student. Replaces the old flow where the browser
// built the entire QR payload (including the "ts" freshness field) itself
// with no signature — which let anyone decode a captured QR, swap in any
// student_id, regenerate ts, and re-encode a forged code (VAPT Vuln 1).
import { todayIST } from '@/lib/utils'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('student_id, name, department, year, section, batch, role, status')
      .eq('id', user.id)
      .single()

    if (!profile || profile.role !== 'Student') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (profile.status !== 'Active' || !profile.student_id) {
      return NextResponse.json({ error: 'Account inactive' }, { status: 403 })
    }

    const payload = {
      student_id: profile.student_id,
      name: profile.name,
      department: profile.department ?? '',
      year: profile.year ?? 1,
      section: profile.section ?? '',
      batch: profile.batch ?? '',
      ts: Math.floor(Date.now() / 1000),
    }

    const sig = signQrPayload(payload)

    const today = todayIST()
    const offlinePayload = {
      student_id: profile.student_id,
      name: profile.name,
      department: profile.department ?? '',
      year: profile.year ?? 1,
      section: profile.section ?? '',
      batch: profile.batch ?? '',
      ts: 0,
      date: today,
      mode: 'offline' as const,
    }
    const offlineSig = signQrPayload(offlinePayload)

    return NextResponse.json({
      ...payload,
      sig,
      offline_pass: {
        ...offlinePayload,
        sig: offlineSig,
      },
    })
  } catch (err: any) {
    console.error('Error generating QR token:', err)
    return NextResponse.json({ error: err?.message || 'Failed to generate QR token' }, { status: 500 })
  }
}
