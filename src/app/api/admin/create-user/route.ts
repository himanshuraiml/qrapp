import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    const { name, email, department, password, role } = await request.json()

    // Verify caller is Admin
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

    const { data: callerProfile } = await supabase
      .from('profiles').select('role').eq('id', user.id).single()
    if (callerProfile?.role !== 'Admin')
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

    const admin = createAdminClient()

    // Create auth user
    const { data: authData, error: authErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role: role ?? 'Faculty' },
    })
    if (authErr) return NextResponse.json({ success: false, error: authErr.message }, { status: 400 })

    // Create profile
    const { error: profileErr } = await admin.from('profiles').insert({
      id:         authData.user.id,
      name,
      role:       role ?? 'Faculty',
      department: department || null,
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
