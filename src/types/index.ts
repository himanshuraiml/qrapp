export type UserRole = 'Admin' | 'Faculty' | 'Student'
export type SessionLabel = 'FN1' | 'FN2' | 'FN3' | 'AN1' | 'AN2' | 'AN3'

export interface Profile {
  id: string
  name: string
  role: UserRole
  student_id?: string | null
  department?: string | null
  year?: number | null
  section?: string | null
  batch?: string | null
  status: 'Active' | 'Inactive'
  created_at: string
  updated_at: string
}

export interface AttendanceRecord {
  id: string
  student_id: string
  student_name: string
  department: string
  section: string
  year: number
  session: SessionLabel
  marked_by: string
  marked_by_name: string
  date: string        // 'YYYY-MM-DD'
  timestamp: string   // ISO8601
}

export interface SectionSummary {
  department: string
  section: string
  year: number
  fn1_count: number
  fn2_count: number
  fn3_count: number
  an1_count: number
  an2_count: number
  an3_count: number
  total_students: number
  attendance_pct: number
}

export interface DashboardStats {
  total_students: number
  total_faculty: number
  today_attendance: number
  today_scans: number
  attendance_pct: number
  by_session: Partial<Record<SessionLabel, number>>
  by_department: Array<{ department: string; students: number; scans: number }>
}

export interface BatchSummary {
  batch: string
  total_students: number
  present_count: number
  attendance_pct: number
}

export interface SessionSettings {
  id: number
  morning_start: string
  morning_end: string
  afternoon_start: string
  afternoon_end: string
  enabled: boolean
  updated_at: string
}

export interface QrPayload {
  student_id: string
  name: string
  department: string
  year: number
  section: string
  ts: number   // unix seconds — freshness check
}

export interface ReportFilters {
  dateFrom: string
  dateTo: string
  department: string
  section: string
  year: string
  session: string
}

export interface RosterRecord {
  student_id:  string
  name:        string
  department:  string
  year:        number
  section:     string
  present:     boolean
}
