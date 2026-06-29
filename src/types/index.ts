export type UserRole = 'Admin' | 'Faculty' | 'Student'
export type SessionLabel = 'FN1' | 'FN2' | 'AN1' | 'AN2'

export interface Profile {
  id: string
  name: string
  role: UserRole
  student_id?: string | null
  department?: string | null
  year?: number | null
  section?: string | null
  batch?: string | null
  special_login?: boolean
  status: 'Active' | 'Inactive'
  qr_blocked?: boolean
  qr_unblocked_at?: string
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
  batch?: string | null
}

export interface SectionSummary {
  department: string
  section: string
  year: number
  fn1_count: number
  fn2_count: number
  an1_count: number
  an2_count: number
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
  fn1_count?: number
  fn2_count?: number
  an1_count?: number
  an2_count?: number
}

export interface SessionSettings {
  id: number
  morning_start: string
  morning_end: string
  afternoon_start: string
  afternoon_end: string
  fn1_start: string
  fn1_end: string
  fn2_start: string
  fn2_end: string
  an1_start: string
  an1_end: string
  an2_start: string
  an2_end: string
  enabled: boolean
  qr_scan_open?: boolean
  block_immediate?: boolean
  qr_blocking_enabled?: boolean
  qr_blocking_enabled_at?: string | null
  restrict_faculty_batch?: boolean
  updated_at: string
}

export interface QrPayload {
  student_id: string
  name: string
  department: string
  year: number
  section: string
  batch?: string | null
  ts: number   // unix seconds — freshness check
}

export interface ReportFilters {
  dateFrom: string
  dateTo: string
  department: string
  section: string
  year: string
  session: string
  batch: string
}

export interface RosterRecord {
  student_id:  string
  name:        string
  department:  string
  year:        number
  section:     string
  present:     boolean
}

export interface RosterMultiRecord {
  student_id:   string
  name:         string
  department:   string
  year:         number
  section:      string
  fn1_present:  boolean
  fn2_present:  boolean
  an1_present:  boolean
  an2_present:  boolean
}

export interface BatchRosterRecord {
  student_id:  string
  name:        string
  batch:       string
  year:        number
  present:     boolean
  qr_blocked:  boolean
}

export interface BatchRosterMultiRecord {
  student_id:   string
  name:         string
  batch:        string
  year:         number
  fn1_present:  boolean
  fn2_present:  boolean
  an1_present:  boolean
  an2_present:  boolean
  qr_blocked:   boolean
}

export interface StudentAttendanceStats {
  present_count: number
  total_conducted: number
  absent_count: number
  attendance_pct: number
}

export interface StudentAttendanceHistoryRecord {
  date: string
  session: string
  present: boolean
  marked_by_name: string | null
  timestamp: string | null
}

export interface UnifiedRosterRecord {
  student_id: string
  name: string
  department: string
  year: number
  section: string
  batch: string
  qr_blocked: boolean
  fn1_present: boolean
  fn2_present: boolean
  an1_present: boolean
  an2_present: boolean
  range_present: number
  range_conducted: number
  range_absent: number
  range_pct: number
  overall_present: number
  overall_conducted: number
  overall_absent: number
  overall_pct: number
}


