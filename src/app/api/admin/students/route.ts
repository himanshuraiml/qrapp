import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    // Verify caller is Admin
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

    const { data: callerProfile } = await supabase
      .from('profiles').select('role').eq('id', user.id).single()
    if (callerProfile?.role !== 'Admin')
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

    // Fetch all students using range-pagination to bypass the default Supabase Max Rows limit of 1000
    const admin = createAdminClient()
    let allStudents: any[] = []
    let fromIndex = 0
    const chunkSize = 1000

    while (true) {
      const { data, error } = await admin
        .from('profiles')
        .select('*')
        .eq('role', 'Student')
        .order('department')
        .order('year')
        .order('section')
        .order('name')
        .range(fromIndex, fromIndex + chunkSize - 1)

      if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
      if (!data || data.length === 0) break

      allStudents.push(...data)
      if (data.length < chunkSize) break
      fromIndex += chunkSize
    }

    const data = allStudents

    return NextResponse.json({ success: true, data })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
