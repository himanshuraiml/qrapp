import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const rawPage = parseInt(searchParams.get('page') || '1')
    const rawLimit = parseInt(searchParams.get('limit') || '50')
    const page = Math.max(rawPage, 1)
    const limit = Math.min(Math.max(rawLimit, 1), 200)
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

    if (fetchAll) {
      // Supabase caps un-ranged queries at 1000 rows — paginate in chunks
      const chunkSize = 1000
      let allData: any[] = []
      let fromIndex = 0
      while (true) {
        const { data: chunk, error } = await admin
          .rpc('get_unified_student_roster', rpcParams)
          .range(fromIndex, fromIndex + chunkSize - 1)
        if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
        if (!chunk || chunk.length === 0) break
        allData.push(...chunk)
        if (chunk.length < chunkSize) break
        fromIndex += chunkSize
      }
      return NextResponse.json({ success: true, data: allData, count: allData.length })
    }

    const fromIndex = (page - 1) * limit
    const toIndex = fromIndex + limit - 1
    const { data, count, error } = await admin
      .rpc('get_unified_student_roster', rpcParams, { count: 'exact' })
      .range(fromIndex, toIndex)

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

    return NextResponse.json({ success: true, data, count })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
