import crypto from 'crypto'

// Server-only. Never import this from a 'use client' component.
//
// QR payloads are AES-256-GCM encrypted (not just signed) so that a generic
// QR scanner app only ever sees an opaque ciphertext blob — never a
// student's name, ID, department, section, etc. GCM's auth tag also
// verifies integrity, replacing the separate HMAC signature this module
// used to compute. The faculty scanner still needs to decrypt scans while
// fully offline (no server round-trip possible), so an authenticated
// Faculty/Admin session can fetch the raw decryption key once via
// /api/attendance/scan-key and cache it locally — see getRawKeyBase64().
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

function getKey(): Buffer {
  const secret = process.env.QR_SIGNING_SECRET
  if (!secret) {
    // No fallback to SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY
    // or a hardcoded default — any of those would make encryption either
    // meaningless (a public key) or a needless extra use of a highly
    // sensitive key. Fail loudly instead.
    throw new Error('QR_SIGNING_SECRET is not configured')
  }
  return crypto.createHash('sha256').update(secret).digest() // 32 bytes -> AES-256
}

export function getRawKeyBase64(): string {
  return getKey().toString('base64')
}

const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16

export function encryptQrPayload(payload: QrPayloadCore): string {
  const key = getKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8')
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const authTag = cipher.getAuthTag()
  // iv || ciphertext || authTag — this layout (tag appended, not separate)
  // matches what the browser's SubtleCrypto AES-GCM decrypt expects, so the
  // faculty scanner's offline client-side decrypt can consume it directly.
  return Buffer.concat([iv, ciphertext, authTag]).toString('base64url')
}

export function decryptQrPayload(token: unknown): QrPayloadCore | null {
  if (typeof token !== 'string' || token.length === 0) return null
  try {
    const key = getKey()
    const raw = Buffer.from(token, 'base64url')
    if (raw.length < IV_LENGTH + AUTH_TAG_LENGTH) return null

    const iv = raw.subarray(0, IV_LENGTH)
    const authTag = raw.subarray(raw.length - AUTH_TAG_LENGTH)
    const ciphertext = raw.subarray(IV_LENGTH, raw.length - AUTH_TAG_LENGTH)

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(authTag)
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()])

    const parsed = JSON.parse(plaintext.toString('utf8'))
    if (typeof parsed?.student_id !== 'string' || typeof parsed?.ts !== 'number') return null
    return parsed as QrPayloadCore
  } catch {
    // Wrong key, tampered ciphertext, corrupted scan, or garbage from a
    // non-app QR — all treated the same: not a valid payload.
    return null
  }
}
