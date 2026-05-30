import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const TYPO_1 = 'RA2311003050472'; // INDAL KUMAR (typoed CSE ID)
const REAL_1 = 'RA2311026050472'; // INDAL KUMAR (correct AIML ID)

const TYPO_2 = 'RA2311003010773'; // SHALINI M (typoed CSE ID)
const REAL_2 = 'RA2311003050773'; // SHALINI M (correct CSE ID)

export async function GET() {
  const admin = createAdminClient()
  const logs: string[] = []

  logs.push('=== STARTING DUPLICATE STUDENT PROFILE FIX ===')

  // Helper for attendance migration
  const migrateAttendance = async (oldId: string, newId: string, name: string) => {
    logs.push(`Checking attendance records for ${name} (${oldId} -> ${newId})...`)
    const { data: oldRecords, error: findErr } = await admin
      .from('attendance')
      .select('id, session, date')
      .eq('student_id', oldId)

    if (findErr) {
      logs.push(`Error finding attendance for ${name}: ${findErr.message}`)
      return
    }

    if (oldRecords && oldRecords.length > 0) {
      logs.push(`Found ${oldRecords.length} old attendance records to migrate.`)
      const { data: updated, error: updateErr } = await admin
        .from('attendance')
        .update({ student_id: newId })
        .eq('student_id', oldId)
        .select()

      if (updateErr) {
        logs.push(`Error migrating attendance for ${name}: ${updateErr.message}`)
      } else {
        logs.push(`Successfully migrated ${updated?.length ?? 0} attendance records to ${newId}.`)
      }
    } else {
      logs.push(`No attendance records found under old ID ${oldId}.`)
    }
  }

  // Helper for profile removal
  const removeDuplicateProfile = async (typoId: string, name: string) => {
    logs.push(`Processing profile removal for duplicate account: ${name} (${typoId})...`)

    const { data: profile, error: findErr } = await admin
      .from('profiles')
      .select('id, name')
      .eq('student_id', typoId)
      .maybeSingle()

    if (findErr) {
      logs.push(`Error checking profile for ${typoId}: ${findErr.message}`)
      return
    }

    if (profile) {
      const uuid = profile.id
      logs.push(`Found active profile for typoed ID ${typoId} with UUID: ${uuid}`)

      logs.push(`Deleting Auth user with ID ${uuid}...`)
      const { error: authDelErr } = await admin.auth.admin.deleteUser(uuid)

      if (authDelErr) {
        logs.push(`Error deleting Auth user ${uuid}: ${authDelErr.message}`)
      } else {
        logs.push(`Successfully deleted Auth user ${uuid}.`)
      }

      // Explicit profiles cleanup in case DB trigger is missing
      const { error: profDelErr } = await admin
        .from('profiles')
        .delete()
        .eq('student_id', typoId)

      if (profDelErr) {
        logs.push(`Error cleaning up profile row for ${typoId}: ${profDelErr.message}`)
      } else {
        logs.push(`Successfully cleaned up profile row for ${typoId}.`)
      }
    } else {
      logs.push(`No active profile found for typoed ID ${typoId}. Checking if auth user exists...`)
      
      const email = `${typoId.toLowerCase()}@student.local`
      const { data: usersData, error: listErr } = await admin.auth.admin.listUsers()
      
      if (!listErr && usersData && usersData.users) {
        const match = usersData.users.find((u: any) => u.email?.toLowerCase() === email.toLowerCase())
        if (match) {
          logs.push(`Found orphaned Auth user for email ${email} with UUID ${match.id}. Deleting...`)
          const { error: authDelErr } = await admin.auth.admin.deleteUser(match.id)
          if (authDelErr) {
            logs.push(`Error deleting orphaned Auth user: ${authDelErr.message}`)
          } else {
            logs.push(`Successfully deleted orphaned Auth user.`)
          }
        } else {
          logs.push(`No orphaned Auth user found for ${email}.`)
        }
      }
    }
  }

  try {
    // 1. Migrate attendance records for Indal Kumar
    await migrateAttendance(TYPO_1, REAL_1, 'INDAL KUMAR')
    
    // 2. Migrate attendance records for Shalini M
    await migrateAttendance(TYPO_2, REAL_2, 'SHALINI M')

    // 3. Remove typo profile and auth user for Indal Kumar
    await removeDuplicateProfile(TYPO_1, 'INDAL KUMAR')

    // 4. Remove typo profile and auth user for Shalini M
    await removeDuplicateProfile(TYPO_2, 'SHALINI M')

    logs.push('=== DUPLICATE STUDENT PROFILE FIX COMPLETED ===')
    return NextResponse.json({ success: true, logs })
  } catch (err: any) {
    logs.push(`CRITICAL ERROR: ${err.message}`)
    return NextResponse.json({ success: false, error: err.message, logs }, { status: 500 })
  }
}
