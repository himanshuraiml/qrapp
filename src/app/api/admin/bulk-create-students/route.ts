import { NextResponse } from 'next/server'
import { createAdminClient, getAuthUserByEmail } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { studentEmail } from '@/lib/utils'

// Mirrors the single-student create flow (see create-student/route.ts) but for a
// chunk of rows. The client sends rows in small chunks so no single request hits
// a serverless timeout; this route returns a per-row result for every row.

interface IncomingRow {
  rowNum: number          // 1-based source row in the spreadsheet (for error reporting)
  student_id: string
  name: string
  institution?: string | null
  department: string
  year: string | number
  section: string
  batch?: string | null
  password?: string | null
}

type RowResult = {
  rowNum: number
  student_id: string
  status: 'created' | 'updated' | 'skipped' | 'error'
  message?: string
}

const MAX_PER_REQUEST = 50

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const students: IncomingRow[] = Array.isArray(body?.students) ? body.students : []

    if (students.length === 0)
      return NextResponse.json({ success: false, error: 'No students provided' }, { status: 400 })
    if (students.length > MAX_PER_REQUEST)
      return NextResponse.json({ success: false, error: `Send at most ${MAX_PER_REQUEST} students per request` }, { status: 400 })

    // Verify caller is Admin (same gate as create-student)
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

    const { data: callerProfile } = await supabase
      .from('profiles').select('role').eq('id', user.id).single()
    if (callerProfile?.role !== 'Admin')
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

    const admin = createAdminClient()
    const results: RowResult[] = []

    for (const s of students) {
      const rowNum = s.rowNum
      const student_id = String(s.student_id ?? '').trim().toUpperCase()
      const name = String(s.name ?? '').trim()
      const institution = String(s.institution ?? '').trim() || 'FET'
      const department = String(s.department ?? '').trim()
      const section = String(s.section ?? '').trim()
      const batch = s.batch ? String(s.batch).trim().toUpperCase() : null
      const yearNum = parseInt(String(s.year ?? '').trim(), 10)
      // Default the password to the register number when the column is blank.
      const password = (s.password && String(s.password).trim()) || student_id

      if (!student_id || !name || !department || !section || !yearNum) {
        results.push({ rowNum, student_id, status: 'error', message: 'Missing required field (Register No / Name / Department / Year / Section)' })
        continue
      }
      if (yearNum < 1 || yearNum > 4) {
        results.push({ rowNum, student_id, status: 'error', message: 'Year must be 1–4' })
        continue
      }
      // Check if student already exists
      const { data: existing } = await admin
        .from('profiles').select('id').eq('student_id', student_id).maybeSingle()

      if (existing) {
        // If a password was explicitly provided, validate and update it
        if (s.password && String(s.password).trim() !== '') {
          const customPassword = String(s.password).trim()
          if (customPassword.length < 6) {
            results.push({ rowNum, student_id, status: 'error', message: 'Password must be at least 6 characters' })
            continue
          }
          try {
            await admin.auth.admin.updateUserById(existing.id, { password: customPassword })
          } catch (authErr: any) {
            results.push({ rowNum, student_id, status: 'error', message: `Auth update failed: ${authErr.message}` })
            continue
          }
        }

        // Update the profile in database
        const { error: profileErr } = await admin
          .from('profiles')
          .update({
            name,
            institution,
            department,
            year: yearNum,
            section,
            batch,
            status: 'Active',
          })
          .eq('id', existing.id)

        if (profileErr) {
          results.push({ rowNum, student_id, status: 'error', message: profileErr.message })
          continue
        }

        results.push({ rowNum, student_id, status: 'updated' })
        continue
      }

      // For new students, validate password length (must be at least 6 chars)
      if (password.length < 6) {
        results.push({ rowNum, student_id, status: 'error', message: 'Password (or Register No) must be at least 6 characters' })
        continue
      }

      let authUserId: string | null = null
      let createdNewAuthUser = false

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
              results.push({ rowNum, student_id, status: 'error', message: 'Auth user exists but could not be retrieved' })
              continue
            }
          } catch (err: any) {
            results.push({ rowNum, student_id, status: 'error', message: `Auth retrieval failed: ${err.message}` })
            continue
          }
        } else {
          results.push({ rowNum, student_id, status: 'error', message: authErr.message ?? 'Failed to create login' })
          continue
        }
      } else if (authData?.user) {
        authUserId = authData.user.id
        createdNewAuthUser = true
      }

      if (!authUserId) {
        results.push({ rowNum, student_id, status: 'error', message: 'Failed to create or find login user' })
        continue
      }

      const { error: profileErr } = await admin.from('profiles').insert({
        id:         authUserId,
        name,
        role:       'Student',
        student_id,
        institution,
        department,
        year:       yearNum,
        section,
        batch,
        status:     'Active',
      })
      if (profileErr) {
        if (createdNewAuthUser) {
          await admin.auth.admin.deleteUser(authUserId)
        }
        results.push({ rowNum, student_id, status: 'error', message: profileErr.message })
        continue
      }

      results.push({ rowNum, student_id, status: 'created' })
    }

    return NextResponse.json({
      success: true,
      created: results.filter((r) => r.status === 'created').length,
      updated: results.filter((r) => r.status === 'updated').length,
      skipped: results.filter((r) => r.status === 'skipped').length,
      errored: results.filter((r) => r.status === 'error').length,
      results,
    })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
