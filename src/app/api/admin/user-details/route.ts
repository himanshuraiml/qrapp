import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

// GET: Fetch user's current email from Supabase Auth
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')

    if (!userId) {
      return NextResponse.json({ success: false, error: 'User ID is required' }, { status: 400 })
    }

    // Verify caller is Admin
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

    const { data: callerProfile } = await supabase
      .from('profiles').select('role').eq('id', user.id).single()
    if (callerProfile?.role !== 'Admin')
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

    const admin = createAdminClient()

    // Fetch user details
    const { data: { user: targetUser }, error: fetchErr } = await admin.auth.admin.getUserById(userId)
    if (fetchErr || !targetUser) {
      return NextResponse.json({ success: false, error: fetchErr?.message ?? 'User not found' }, { status: 400 })
    }

    return NextResponse.json({ success: true, email: targetUser.email })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}

// POST: Update user's email and/or password in Supabase Auth
export async function POST(request: Request) {
  try {
    const { userId, email, password } = await request.json()

    if (!userId) {
      return NextResponse.json({ success: false, error: 'User ID is required' }, { status: 400 })
    }

    // Verify caller is Admin
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

    const { data: callerProfile } = await supabase
      .from('profiles').select('role').eq('id', user.id).single()
    if (callerProfile?.role !== 'Admin')
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

    const admin = createAdminClient()

    // Build update payload dynamically
    const updates: any = {}
    if (email !== undefined) {
      if (email.trim() === '') {
        return NextResponse.json({ success: false, error: 'Email address cannot be empty' }, { status: 400 })
      }
      updates.email = email.trim()
      updates.email_confirm = true
    }

    if (password !== undefined && password !== '') {
      if (password.length < 6) {
        return NextResponse.json({ success: false, error: 'Password must be at least 6 characters' }, { status: 400 })
      }
      updates.password = password
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ success: false, error: 'No fields to update were provided' }, { status: 400 })
    }

    // Perform updates using admin privileges
    const { error: updateErr } = await admin.auth.admin.updateUserById(userId, updates)
    if (updateErr) {
      return NextResponse.json({ success: false, error: updateErr.message }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
