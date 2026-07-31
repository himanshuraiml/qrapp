import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Defense-in-depth against credential stuffing / password brute-forcing on
// the login form. Hardened against unauthenticated Account Lockout DoS via
// Origin matching & IP rate-limiting.
const MAX_FAILED_ATTEMPTS = 5
const LOCKOUT_MINUTES = 15

// Simple in-memory IP rate limiter for login attempt actions
const ipAttempts = new Map<string, number[]>()
const MAX_IP_ATTEMPTS_PER_MINUTE = 15

function isIpRateLimited(ip: string): boolean {
  const now = Date.now()
  const windowStart = now - 60_000
  const hits = (ipAttempts.get(ip) ?? []).filter((t) => t > windowStart)
  hits.push(now)
  ipAttempts.set(ip, hits)
  return hits.length > MAX_IP_ATTEMPTS_PER_MINUTE
}

function normalizeEmail(email: unknown): string | null {
  if (typeof email !== 'string') return null
  const trimmed = email.trim().toLowerCase()
  return trimmed.length > 0 ? trimmed : null
}

export async function POST(request: Request) {
  const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1'

  // Rate limit total attempts per client IP to stop mass lockout scripts
  if (isIpRateLimited(clientIp)) {
    return NextResponse.json({ error: 'Too many requests from this IP address.' }, { status: 429 })
  }

  // Validate Origin / Host header to prevent cross-site DoS trigger
  const origin = request.headers.get('origin')
  const host = request.headers.get('host')
  if (origin && host) {
    try {
      const originHost = new URL(origin).host
      if (originHost !== host) {
        return NextResponse.json({ error: 'Cross-origin request forbidden' }, { status: 403 })
      }
    } catch {
      return NextResponse.json({ error: 'Invalid origin header' }, { status: 403 })
    }
  }

  const body = await request.json().catch(() => ({}))
  const email = normalizeEmail(body?.email)
  const action = body?.action

  if (!email || !['check', 'fail', 'success'].includes(action)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const admin = createAdminClient()

  if (action === 'check') {
    const { data } = await admin
      .from('login_attempts')
      .select('locked_until')
      .eq('email', email)
      .maybeSingle()

    const lockedUntil = data?.locked_until ? new Date(data.locked_until) : null
    const locked = !!lockedUntil && lockedUntil.getTime() > Date.now()
    return NextResponse.json({ locked, locked_until: locked ? lockedUntil!.toISOString() : null })
  }

  if (action === 'success') {
    await admin.from('login_attempts').delete().eq('email', email)
    return NextResponse.json({ ok: true })
  }

  // action === 'fail'
  const { data: existing } = await admin
    .from('login_attempts')
    .select('failed_count, locked_until')
    .eq('email', email)
    .maybeSingle()

  const stillLocked = existing?.locked_until && new Date(existing.locked_until).getTime() > Date.now()
  const nextCount = stillLocked ? (existing?.failed_count ?? 0) : (existing?.failed_count ?? 0) + 1
  const lockedUntil = nextCount >= MAX_FAILED_ATTEMPTS
    ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000).toISOString()
    : existing?.locked_until ?? null

  await admin.from('login_attempts').upsert({
    email,
    failed_count: nextCount >= MAX_FAILED_ATTEMPTS ? 0 : nextCount,
    locked_until: lockedUntil,
    updated_at: new Date().toISOString(),
  })

  const locked = nextCount >= MAX_FAILED_ATTEMPTS
  return NextResponse.json({ locked, locked_until: locked ? lockedUntil : null })
}

