import crypto from 'crypto'

// Server-only. Never import this from a 'use client' component.
export interface QrPayloadCore {
  student_id: string
  name: string
  department: string
  year: number
  section: string
  batch?: string | null
  ts: number
  date?: string
  mode?: 'online' | 'offline'
}

function getSecret(): string {
  const secret =
    process.env.QR_SIGNING_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    'qrapp-default-signature-key-2026'
  return secret
}

function canonicalize(payload: QrPayloadCore): string {
  const parts: Array<string | number> = [
    payload.student_id,
    payload.name,
    payload.department,
    payload.year,
    payload.section,
    payload.batch ?? '',
    payload.ts,
  ]
  if (payload.date || payload.mode) {
    parts.push(payload.date ?? '')
    parts.push(payload.mode ?? '')
  }
  return parts.join('|')
}

export function signQrPayload(payload: QrPayloadCore): string {
  return crypto.createHmac('sha256', getSecret()).update(canonicalize(payload)).digest('hex')
}

export function verifyQrSignature(payload: QrPayloadCore, sig: unknown): boolean {
  if (typeof sig !== 'string' || sig.length === 0) return false
  let expected: Buffer
  let given: Buffer
  try {
    expected = Buffer.from(signQrPayload(payload), 'hex')
    given = Buffer.from(sig, 'hex')
  } catch {
    return false
  }
  if (expected.length !== given.length) return false
  return crypto.timingSafeEqual(expected, given)
}
