import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getRawKeyBase64 } from '@/lib/qrSignature'

// Delivers the raw AES-256-GCM key used to encrypt QR payloads, but only to
// an authenticated, Active Faculty/Admin session. The faculty scanner caches
// this locally (IndexedDB) so it can decrypt scans while fully offline —
// there is no server round-trip available in that case. Anyone without a
// real faculty/admin login (including any generic QR scanner app pointed at
// a student's screen) never gets this key, so the QR content stays opaque
// to them.
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, status')
      .eq('id', user.id)
      .single()

    if (!profile || !['Faculty', 'Admin'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (profile.status !== 'Active') {
      return NextResponse.json({ error: 'Account inactive' }, { status: 403 })
    }

    return NextResponse.json({ key: getRawKeyBase64() })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to fetch scan key' }, { status: 500 })
  }
}
