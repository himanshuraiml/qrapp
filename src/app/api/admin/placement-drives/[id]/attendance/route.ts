import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

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
      .from('profiles').select('name, role').eq('id', user.id).single()
    if (!['Admin', 'Faculty'].includes(callerProfile?.role || '')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const rawStudentId = body.student_id
    const targetStatus = body.status || 'Present' // 'Present', 'Eligible', or 'Absent'

    if (!rawStudentId) {
      return NextResponse.json({ success: false, error: 'Student ID is required' }, { status: 400 })
    }

    const studentId = String(rawStudentId).trim().toUpperCase()
    const admin = createAdminClient()

    // 1. Verify if drive exists
    const { data: drive } = await admin
      .from('placement_drives')
      .select('title, company_name')
      .eq('id', driveId)
      .single()

    if (!drive) {
      return NextResponse.json({ success: false, error: 'Placement drive not found' }, { status: 404 })
    }

    // 2. Check if student is in eligibility list
    const { data: record } = await admin
      .from('placement_drive_students')
      .select('*')
      .eq('drive_id', driveId)
      .eq('student_id', studentId)
      .maybeSingle()

    // Retrieve student profile details for response display
    const { data: studentProfile } = await admin
      .from('profiles')
      .select('name, department, year, section, batch')
      .eq('student_id', studentId)
      .maybeSingle()

    const studentName = studentProfile?.name || studentId

    if (!record) {
      return NextResponse.json({
        success: false,
        error: `Student ${studentId} (${studentName}) is NOT eligible for ${drive.company_name} drive`,
        is_eligible: false,
        student_id: studentId,
        student_name: studentName,
      }, { status: 400 })
    }

    // Update status and timestamp (allows multiple scans for the same day, updating timestamp each time)
    const isReScan = record.status === 'Present' && targetStatus === 'Present'
    const updatePayload = {
      status: targetStatus,
      marked_at: targetStatus === 'Present' ? new Date().toISOString() : null,
      marked_by: targetStatus === 'Present' ? user.id : null,
      marked_by_name: targetStatus === 'Present' ? (callerProfile?.name || 'Admin') : null,
    }

    const { error: updateErr } = await admin
      .from('placement_drive_students')
      .update(updatePayload)
      .eq('id', record.id)

    if (updateErr) {
      return NextResponse.json({ success: false, error: updateErr.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: isReScan 
        ? `Re-scanned & Verified Present for ${studentName} (${studentId})`
        : `Marked ${targetStatus} for ${studentName} (${studentId})`,
      student_id: studentId,
      student_name: studentName,
      department: studentProfile?.department || 'N/A',
      section: studentProfile?.section || 'N/A',
      mobile: record.mobile || null,
      status: targetStatus,
      marked_at: updatePayload.marked_at,
      is_rescan: isReScan,
    })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
