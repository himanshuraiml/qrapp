import type { Profile } from '@/types'

export interface CachedAuthSession {
  user_id: string
  access_token: string
  refresh_token: string
  profile: Profile
  timestamp: number // Last verified online timestamp (ms)
}

const DB_NAME = 'QrAttendanceAuthDB'
const STORE_NAME = 'auth_session'
const DB_VERSION = 1
const MAX_OFFLINE_TTL_MS = 24 * 60 * 60 * 1000 // 24 Hours

function openAuthDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      reject(new Error('IndexedDB is not supported'))
      return
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'user_id' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export function isOfflineSessionExpired(timestamp: number): boolean {
  if (!timestamp) return true
  const elapsed = Date.now() - timestamp
  return elapsed > MAX_OFFLINE_TTL_MS
}

export async function saveOfflineAuthSession(
  userId: string,
  tokens: { access_token: string | null; refresh_token: string | null },
  profile: Profile | null
): Promise<void> {
  if (!userId || !profile) return

  const record: CachedAuthSession = {
    user_id: userId,
    access_token: tokens.access_token || '',
    refresh_token: tokens.refresh_token || '',
    profile,
    timestamp: Date.now(),
  }

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('qr_last_active_user_id', userId)
    } catch {}
  }

  try {
    const db = await openAuthDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const req = store.put(record)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  } catch (e) {
    console.warn('IndexedDB saveOfflineAuthSession failed, falling back to localStorage:', e)
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('qr_offline_auth_session', JSON.stringify(record))
      } catch {}
    }
  }
}

export async function getOfflineAuthSession(expectedUserId?: string | null): Promise<{
  session: { access_token: string; refresh_token: string } | null
  profile: Profile | null
  isExpired: boolean
  lastOnline: number
} | null> {
  let targetUserId = expectedUserId

  if (!targetUserId && typeof window !== 'undefined') {
    targetUserId = localStorage.getItem('qr_last_active_user_id')
  }

  // Never return an arbitrary cached session without knowing which user identity to expect
  if (!targetUserId) return null

  let cached: CachedAuthSession | null = null

  try {
    const db = await openAuthDB()
    cached = await new Promise<CachedAuthSession | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const req = store.get(targetUserId!)
      req.onsuccess = () => {
        resolve((req.result as CachedAuthSession) || null)
      }
      req.onerror = () => reject(req.error)
    })
  } catch (e) {
    console.warn('IndexedDB getOfflineAuthSession failed, checking localStorage fallback:', e)
    if (typeof window !== 'undefined') {
      try {
        const item = localStorage.getItem('qr_offline_auth_session')
        if (item) {
          const parsed = JSON.parse(item)
          if (parsed?.user_id === targetUserId) {
            cached = parsed
          }
        }
      } catch {}
    }
  }

  if (!cached || cached.user_id !== targetUserId) return null

  const expired = isOfflineSessionExpired(cached.timestamp)

  return {
    session: cached.access_token
      ? { access_token: cached.access_token, refresh_token: cached.refresh_token }
      : null,
    profile: cached.profile,
    isExpired: expired,
    lastOnline: cached.timestamp,
  }
}

export async function clearOfflineAuthSession(): Promise<void> {
  try {
    const db = await openAuthDB()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const req = store.clear()
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  } catch (e) {
    console.warn('IndexedDB clearOfflineAuthSession failed:', e)
  }

  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem('qr_offline_auth_session')
      localStorage.removeItem('qr_last_active_user_id')
      localStorage.removeItem('faculty_scan_key')
      localStorage.removeItem('student_daily_offline_pass')
      localStorage.removeItem('scan_haptics_enabled')
    } catch {}
  }
}
