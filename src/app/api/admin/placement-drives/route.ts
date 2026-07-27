import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

    const { data: callerProfile } = await supabase
      .from('profiles').select('role').eq('id', user.id).single()
    if (!['Admin', 'Faculty'].includes(callerProfile?.role || '')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const admin = createAdminClient()
    const { data: drives, error } = await admin
      .from('placement_drives')
      .select('*')
      .order('drive_date', { ascending: false })

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

    // For each drive, get counts
    const result = await Promise.all(
      (drives || []).map(async (drive) => {
        const { count: totalEligible } = await admin
          .from('placement_drive_students')
          .select('*', { count: 'exact', head: true })
          .eq('drive_id', drive.id)

        const { count: totalPresent } = await admin
          .from('placement_drive_students')
          .select('*', { count: 'exact', head: true })
          .eq('drive_id', drive.id)
          .eq('status', 'Present')

        return {
          ...drive,
          total_eligible: totalEligible || 0,
          total_present: totalPresent || 0,
        }
      })
    )

    return NextResponse.json({ success: true, data: result })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

    const { data: callerProfile } = await supabase
      .from('profiles').select('role').eq('id', user.id).single()
    if (callerProfile?.role !== 'Admin') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { company_name, title, drive_date, venue, description, students } = body

    if (!company_name || !title || !drive_date || !venue) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: company_name, title, drive_date, venue' },
        { status: 400 }
      )
    }

    const admin = createAdminClient()

    // 1. Insert drive
    const { data: drive, error: driveErr } = await admin
      .from('placement_drives')
      .insert({
        company_name: company_name.trim(),
        title: title.trim(),
        drive_date,
        venue: venue.trim(),
        description: description?.trim() || null,
        status: 'Active',
      })
      .select()
      .single()

    if (driveErr || !drive) {
      return NextResponse.json({ success: false, error: driveErr?.message || 'Failed to create drive' }, { status: 500 })
    }

    // 2. Add eligible students if provided
    let addedCount = 0
    if (Array.isArray(students) && students.length > 0) {
      // De-dupe by student_id (last row wins)
      const rowMap = new Map<string, any>()
      for (const s of students) {
        const sid = String(s?.student_id || '').trim().toUpperCase()
        if (!sid) continue
        rowMap.set(sid, {
          drive_id: drive.id,
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
        // Drive was already created — surface the failure instead of silently
        // returning success with 0 students added.
        return NextResponse.json({
          success: true,
          data: drive,
          eligible_count: 0,
          student_insert_error: insertErr.message,
        })
      }
      addedCount = rowsToInsert.length
    }

    return NextResponse.json({
      success: true,
      data: drive,
      eligible_count: addedCount,
    })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
