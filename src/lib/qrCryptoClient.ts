'use client'

// Browser-only counterpart to src/lib/qrSignature.ts. Decrypts a scanned QR
// token using SubtleCrypto so the faculty scanner can show a student's name
// immediately — including while fully offline, using a key it cached
// earlier from /api/attendance/scan-key. This is intentionally the ONLY
// place client code can turn a token back into a readable payload; the key
// never leaves an authenticated Faculty/Admin session.
import type { QrPayloadCore } from './qrSignature'

const IV_LENGTH = 12

function base64UrlToBytes(b64url: string): Uint8Array<ArrayBuffer> {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(b64url.length / 4) * 4, '=')
  const binary = atob(b64)
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64)
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export async function decryptQrToken(token: string, keyBase64: string): Promise<QrPayloadCore | null> {
  try {
    const raw = base64UrlToBytes(token)
    if (raw.length < IV_LENGTH + 16) return null

    const iv = raw.slice(0, IV_LENGTH)
    // ciphertext || authTag, exactly what SubtleCrypto's AES-GCM decrypt expects as `data`
    const ciphertextAndTag = raw.slice(IV_LENGTH)

    const keyBytes = base64ToBytes(keyBase64)
    const cryptoKey = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt'])
    const plaintextBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, ciphertextAndTag)
    const parsed = JSON.parse(new TextDecoder().decode(plaintextBuf))

    if (typeof parsed?.student_id !== 'string' || typeof parsed?.ts !== 'number') return null
    return parsed as QrPayloadCore
  } catch {
    return null
  }
}
