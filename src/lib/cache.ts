import { safeSessionStorage } from './safeStorage'

export const CACHE_TTL = {
  profile:    5  * 60 * 1000, // 5 min — profile data rarely changes mid-session
  attendance: 2  * 60 * 1000, // 2 min — tolerate brief staleness for read-heavy views
  scans:      60 * 1000,      // 1 min — faculty scans update as they work
  options:    10 * 60 * 1000, // 10 min — dept/section dropdown lists
}

export function readCache<T>(key: string, ttl: number): T | null {
  try {
    const raw = safeSessionStorage.getItem(key)
    if (!raw) return null
    const { data, ts } = JSON.parse(raw)
    if (Date.now() - ts > ttl) { safeSessionStorage.removeItem(key); return null }
    return data as T
  } catch {
    return null
  }
}

export function writeCache<T>(key: string, data: T): void {
  safeSessionStorage.setItem(key, JSON.stringify({ data, ts: Date.now() }))
}

export function clearCache(prefix?: string): void {
  if (!prefix) { safeSessionStorage.clear(); return }
  safeSessionStorage.keys()
    .filter((k) => k.startsWith(prefix))
    .forEach((k) => safeSessionStorage.removeItem(k))
}
