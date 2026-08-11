import { safeStorage } from './safeStorage'

export interface OfflineScan {
  student_id: string
  name: string
  department: string
  section: string
  year: number
  batch: string | null
  ts: number    // QR timestamp (or 0 for offline pass)
  token: string // raw encrypted QR token — re-decrypted server-side on sync
  timestamp: string // ISO timestamp of scan
  date: string // YYYY-MM-DD
}

const DB_NAME = 'QrAttendanceOfflineDB'
const STORE_NAME = 'scans'
const DB_VERSION = 1

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      reject(new Error('IndexedDB is not supported in this environment'))
      return
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'student_id' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function saveOfflineScan(scan: OfflineScan): Promise<void> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const req = store.put(scan)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  } catch (e) {
    console.warn('IndexedDB save failed, falling back to localStorage:', e)
    // Fallback to localStorage if IndexedDB fails
    const currentQueue = JSON.parse(safeStorage.getItem('offline_scans_queue') || '[]')
    const filtered = currentQueue.filter((x: OfflineScan) => x.student_id !== scan.student_id)
    filtered.push(scan)
    safeStorage.setItem('offline_scans_queue', JSON.stringify(filtered))
  }
}

export async function getOfflineQueue(): Promise<OfflineScan[]> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const req = store.getAll()
      req.onsuccess = () => resolve(req.result || [])
      req.onerror = () => reject(req.error)
    })
  } catch (e) {
    console.warn('IndexedDB get failed, reading from localStorage fallback:', e)
    try {
      return JSON.parse(safeStorage.getItem('offline_scans_queue') || '[]')
    } catch {
      return []
    }
  }
}

export async function removeOfflineScan(studentId: string): Promise<void> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const req = store.delete(studentId)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  } catch (e) {
    const currentQueue = JSON.parse(safeStorage.getItem('offline_scans_queue') || '[]')
    const filtered = currentQueue.filter((x: OfflineScan) => x.student_id !== studentId)
    safeStorage.setItem('offline_scans_queue', JSON.stringify(filtered))
  }
}

export async function clearOfflineQueue(): Promise<void> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const req = store.clear()
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  } catch (e) {
    safeStorage.removeItem('offline_scans_queue')
  }
}
