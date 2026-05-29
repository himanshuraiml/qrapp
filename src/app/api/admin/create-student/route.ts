import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { studentEmail } from '@/lib/utils'

export async function POST(request: Request) {
  try {
    const { student_id, name, department, year, section, password } = await request.json()

    // Verify caller is Admin
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

    const { data: callerProfile } = await supabase
      .from('profiles').select('role').eq('id', user.id).single()
    if (callerProfile?.role !== 'Admin')
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

    const admin = createAdminClient()

    // Check student_id uniqueness
    const { data: existing } = await admin
      .from('profiles').select('id').eq('student_id', student_id).single()
    if (existing)
      return NextResponse.json({ success: false, error: 'Roll number already exists' }, { status: 400 })

    // Create auth user with virtual email
    const email = studentEmail(student_id)
    const { data: authData, error: authErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role: 'Student' },
    })
    if (authErr) return NextResponse.json({ success: false, error: authErr.message }, { status: 400 })

    // Create profile
    const { error: profileErr } = await admin.from('profiles').insert({
      id:         authData.user.id,
      name,
      role:       'Student',
      student_id: student_id.toUpperCase(),
      department,
      year:       parseInt(year),
      section,
      status:     'Active',
    })
    if (profileErr) {
      await admin.auth.admin.deleteUser(authData.user.id)
      return NextResponse.json({ success: false, error: profileErr.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, id: authData.user.id })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
