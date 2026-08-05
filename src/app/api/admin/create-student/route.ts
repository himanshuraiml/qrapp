import { NextResponse } from 'next/server'
import { createAdminClient, getAuthUserByEmail } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { studentEmail } from '@/lib/utils'

export async function POST(request: Request) {
  try {
    const { student_id, name, institution, department, year, section, batch, password } = await request.json()

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
      .from('profiles').select('id').eq('student_id', student_id).maybeSingle()
    if (existing)
      return NextResponse.json({ success: false, error: 'Roll number already exists' }, { status: 400 })

    let authUserId: string | null = null
    let createdNewAuthUser = false

    // Create auth user with virtual email
    const email = studentEmail(student_id)
    const { data: authData, error: authErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role: 'Student' },
    })

    if (authErr) {
      if (authErr.message?.includes('already been registered') || authErr.code === 'email_exists') {
        try {
          const existingUser = await getAuthUserByEmail(admin, email)
          if (existingUser) {
            authUserId = existingUser.id
            // Update password to the new one
            await admin.auth.admin.updateUserById(existingUser.id, { password })
          } else {
            return NextResponse.json({ success: false, error: 'Auth user exists but could not be retrieved' }, { status: 400 })
          }
        } catch (err: any) {
          return NextResponse.json({ success: false, error: `Auth retrieval failed: ${err.message}` }, { status: 400 })
        }
      } else {
        return NextResponse.json({ success: false, error: authErr.message }, { status: 400 })
      }
    } else if (authData?.user) {
      authUserId = authData.user.id
      createdNewAuthUser = true
    }

    if (!authUserId) {
      return NextResponse.json({ success: false, error: 'Failed to create or find login user' }, { status: 400 })
    }

    // Create profile
    const { error: profileErr } = await admin.from('profiles').insert({
      id:         authUserId,
      name,
      role:       'Student',
      student_id: student_id.toUpperCase(),
      institution: institution ? String(institution).trim() : 'FET',
      department,
      year:       parseInt(year),
      section,
      batch:      batch ? String(batch).trim().toUpperCase() : null,
      status:     'Active',
    })
    if (profileErr) {
      if (createdNewAuthUser) {
        await admin.auth.admin.deleteUser(authUserId)
      }
      return NextResponse.json({ success: false, error: profileErr.message }, { status: 500 })
    }


    return NextResponse.json({ success: true, id: authUserId })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
