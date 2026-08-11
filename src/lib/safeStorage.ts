/**
 * safeStorage — iOS Private Browsing safe localStorage wrapper.
 *
 * In iOS Safari Private Browsing, localStorage.setItem() throws
 * QuotaExceededError (quota is 0). getItem() and removeItem() are safe.
 * This wrapper silently swallows write failures so the app keeps running.
 */

export const safeStorage = {
  getItem(key: string): string | null {
    try {
      return typeof window !== 'undefined' ? localStorage.getItem(key) : null
    } catch {
      return null
    }
  },

  setItem(key: string, value: string): void {
    try {
      if (typeof window !== 'undefined') localStorage.setItem(key, value)
    } catch {
      // iOS Private Browsing: QuotaExceededError — fail silently
    }
  },

  removeItem(key: string): void {
    try {
      if (typeof window !== 'undefined') localStorage.removeItem(key)
    } catch {
      // ignore
    }
  },

  clear(): void {
    try {
      if (typeof window !== 'undefined') localStorage.clear()
    } catch {
      // ignore
    }
  },

  keys(): string[] {
    try {
      return typeof window !== 'undefined' ? Object.keys(localStorage) : []
    } catch {
      return []
    }
  },
}

/** Same safety wrapper as safeStorage, for sessionStorage. */
export const safeSessionStorage = {
  getItem(key: string): string | null {
    try {
      return typeof window !== 'undefined' ? sessionStorage.getItem(key) : null
    } catch {
      return null
    }
  },

  setItem(key: string, value: string): void {
    try {
      if (typeof window !== 'undefined') sessionStorage.setItem(key, value)
    } catch {
      // ignore
    }
  },

  removeItem(key: string): void {
    try {
      if (typeof window !== 'undefined') sessionStorage.removeItem(key)
    } catch {
      // ignore
    }
  },

  clear(): void {
    try {
      if (typeof window !== 'undefined') sessionStorage.clear()
    } catch {
      // ignore
    }
  },

  keys(): string[] {
    try {
      return typeof window !== 'undefined' ? Object.keys(sessionStorage) : []
    } catch {
      return []
    }
  },
}

/**
 * iOS-safe crypto.randomUUID() — falls back to a Math.random UUID on
 * Safari < 15.4 where crypto.randomUUID is not available.
 */
export function safeRandomUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // RFC 4122 v4 UUID fallback
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}
