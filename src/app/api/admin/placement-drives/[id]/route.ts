import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const driveId = params.id
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

    const { data: callerProfile } = await supabase
      .from('profiles').select('role').eq('id', user.id).single()
    if (!['Admin', 'Faculty'].includes(callerProfile?.role || '')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const admin = createAdminClient()

    // 1. Fetch drive
    const { data: drive, error: driveErr } = await admin
      .from('placement_drives')
      .select('*')
      .eq('id', driveId)
      .single()

    if (driveErr || !drive) {
      return NextResponse.json({ success: false, error: 'Placement drive not found' }, { status: 404 })
    }

    // 2. Fetch drive students
    const { data: driveStudents, error: dsErr } = await admin
      .from('placement_drive_students')
      .select('*')
      .eq('drive_id', driveId)
      .order('created_at', { ascending: true })

    if (dsErr) {
      return NextResponse.json({ success: false, error: dsErr.message }, { status: 500 })
    }

    // 3. Fetch profile information for each student_id
    const studentIds = (driveStudents || []).map((ds) => ds.student_id)
    
    let profileMap: Record<string, any> = {}
    if (studentIds.length > 0) {
      const { data: profiles } = await admin
        .from('profiles')
        .select('student_id, name, department, year, section, batch')
        .in('student_id', studentIds)

      if (profiles) {
        profiles.forEach((p) => {
          if (p.student_id) {
            profileMap[p.student_id.toUpperCase()] = p
          }
        })
      }
    }

    // Combine roster with profile data
    const roster = (driveStudents || []).map((ds) => {
      const prof = profileMap[ds.student_id.toUpperCase()] || {}
      return {
        ...ds,
        name: prof.name || 'N/A (Not Registered)',
        department: prof.department || 'N/A',
        year: prof.year || null,
        section: prof.section || 'N/A',
        batch: prof.batch || 'N/A',
      }
    })

    const totalEligible = roster.length
    const totalPresent = roster.filter((r) => r.status === 'Present').length

    return NextResponse.json({
      success: true,
      data: {
        ...drive,
        total_eligible: totalEligible,
        total_present: totalPresent,
        roster,
      },
    })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const driveId = params.id
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

    const { data: callerProfile } = await supabase
      .from('profiles').select('role').eq('id', user.id).single()
    if (callerProfile?.role !== 'Admin') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { students } = body

    if (!Array.isArray(students) || students.length === 0) {
      return NextResponse.json({ success: false, error: 'No students provided' }, { status: 400 })
    }

    const admin = createAdminClient()

    const rowMap = new Map<string, any>()
    for (const s of students) {
      const sid = String(s?.student_id || '').trim().toUpperCase()
      if (!sid) continue
      rowMap.set(sid, {
        drive_id: driveId,
        student_id: sid,
        status: 'Eligible',
        mobile: s.mobile?.trim() || null,
        assessment_date: s.assessment_date?.trim() || null,
        test_time: s.test_time?.trim() || null,
        slot: s.slot?.trim() || null,
        venue: s.venue?.trim() || null,
      })
    }
    const rowsToInsert = Array.from(rowMap.values())

    const { error: insertErr } = await admin
      .from('placement_drive_students')
      .upsert(rowsToInsert, { onConflict: 'drive_id,student_id', ignoreDuplicates: true })

    if (insertErr) {
      return NextResponse.json({ success: false, error: insertErr.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, added_count: rowsToInsert.length })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const driveId = params.id
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

    const { data: callerProfile } = await supabase
      .from('profiles').select('role').eq('id', user.id).single()
    if (callerProfile?.role !== 'Admin') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const admin = createAdminClient()
    const { error } = await admin
      .from('placement_drives')
      .delete()
      .eq('id', driveId)

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
