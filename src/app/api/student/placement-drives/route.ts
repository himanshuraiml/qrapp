import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles')
      .select('student_id, role')
      .eq('id', user.id)
      .single()

    if (!profile || profile.role !== 'Student' || !profile.student_id) {
      return NextResponse.json({ success: false, error: 'Student profile not found' }, { status: 400 })
    }

    const studentId = profile.student_id.toUpperCase()
    const admin = createAdminClient()

    // Query drives student is eligible for
    const { data: driveRecords, error } = await admin
      .from('placement_drive_students')
      .select(`
        id,
        status,
        marked_at,
        marked_by_name,
        assessment_date,
        test_time,
        slot,
        venue,
        created_at,
        placement_drives (
          id,
          company_name,
          title,
          drive_date,
          venue,
          description,
          status
        )
      `)
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

    const result = (driveRecords || []).map((rec: any) => {
      const drive = rec.placement_drives || {}
      return {
        id: drive.id,
        company_name: drive.company_name,
        title: drive.title,
        drive_date: drive.drive_date,
        venue: drive.venue,
        description: drive.description,
        drive_status: drive.status,
        display_date: rec.assessment_date || drive.drive_date,
        display_venue: rec.venue || drive.venue,
        test_time: rec.test_time,
        slot: rec.slot,
        student_attendance_status: rec.status, // 'Eligible', 'Present', 'Absent'
        marked_at: rec.marked_at,
        marked_by_name: rec.marked_by_name,
      }
    })

    return NextResponse.json({ success: true, data: result })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
