import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const rawPage = parseInt(searchParams.get('page') || '1')
    const rawLimit = parseInt(searchParams.get('limit') || '50')
    const page = Math.max(rawPage, 1)             // guard against page=0 or negative
    const limit = Math.min(Math.max(rawLimit, 1), 200) // cap at 200 rows per request
    const search = searchParams.get('search') || ''
    const institution = searchParams.get('institution') || 'all'
    const department = searchParams.get('department') || 'all'
    const year = searchParams.get('year') || 'all'
    const batch = searchParams.get('batch') || 'all'
    const qrBlocked = searchParams.get('qr_blocked') || 'all'

    // Verify caller is Admin
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

    const { data: callerProfile } = await supabase
      .from('profiles').select('role').eq('id', user.id).single()
    if (callerProfile?.role !== 'Admin')
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

    const admin = createAdminClient()
    
    // Build query with exact count for pagination controls
    let query = admin
      .from('profiles')
      .select('*', { count: 'exact' })
      .eq('role', 'Student')

    // Apply filters
    if (search.trim()) {
      query = query.or(`name.ilike.%${search}%,student_id.ilike.%${search}%`)
    }
    if (institution !== 'all' && institution.trim() !== '') {
      query = query.eq('institution', institution)
    }
    if (department !== 'all' && department.trim() !== '') {
      query = query.eq('department', department)
    }
    if (year !== 'all' && year.trim() !== '') {
      query = query.eq('year', parseInt(year))
    }
    if (batch !== 'all' && batch.trim() !== '') {
      query = query.eq('batch', batch)
    }
    if (qrBlocked === 'blocked') {
      query = query.eq('qr_blocked', true)
    } else if (qrBlocked === 'active') {
      query = query.eq('qr_blocked', false)
    }

    // Apply sorting (which uses composite index)
    query = query
      .order('department')
      .order('year')
      .order('section')
      .order('name')

    // Apply range pagination
    const fromIndex = (page - 1) * limit
    const toIndex = fromIndex + limit - 1
    query = query.range(fromIndex, toIndex)

    const { data, count, error } = await query

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

    return NextResponse.json({ success: true, data, count })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}

