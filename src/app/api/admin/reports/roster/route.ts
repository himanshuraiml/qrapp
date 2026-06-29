import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    const search = searchParams.get('search') || ''
    const dateFrom = searchParams.get('dateFrom') || ''
    const dateTo = searchParams.get('dateTo') || ''
    const department = searchParams.get('department') || ''
    const year = searchParams.get('year') || ''
    const section = searchParams.get('section') || ''
    const batch = searchParams.get('batch') || ''
    const attendanceFilter = searchParams.get('attendanceFilter') || 'all'

    // Verify caller is Admin
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

    const { data: callerProfile } = await supabase
      .from('profiles').select('role').eq('id', user.id).single()
    if (callerProfile?.role !== 'Admin')
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

    const admin = createAdminClient()

    const rpcParams = {
      p_date_from: dateFrom,
      p_date_to: dateTo,
      p_department: department || null,
      p_section: section || null,
      p_year: year ? parseInt(year) : null,
      p_batch: batch || null,
      p_search: search || null,
      p_attendance_filter: attendanceFilter || 'all',
    }

    const fetchAll = searchParams.get('all') === 'true'

    let query = admin.rpc('get_unified_student_roster', rpcParams, { count: 'exact' })

    if (!fetchAll) {
      const fromIndex = (page - 1) * limit
      const toIndex = fromIndex + limit - 1
      query = query.range(fromIndex, toIndex)
    }

    const { data, count, error } = await query

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

    return NextResponse.json({ success: true, data, count })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
