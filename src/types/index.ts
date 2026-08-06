export type UserRole = 'Admin' | 'Faculty' | 'Student'
export type SessionLabel = 'FN1' | 'FN2' | 'AN1' | 'AN2'

export interface Profile {
  id: string
  name: string
  role: UserRole
  student_id?: string | null
  institution?: string | null
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
  institution?: string | null
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

export type ModuleType = 'training' | 'cdc' | 'placements'

export interface ModuleFeatureFlags {
  training: boolean
  cdc: boolean
  placements: boolean
}

export interface CdcPeriodTiming {
  period: number
  start_time: string
  end_time: string
}

export interface Activity {
  id: string
  title: string
  activity_type: 'Training' | 'CDC' | 'PlacementDrive'
  period_number?: number
  date: string
  start_time?: string
  end_time?: string
  venue?: string
  metadata?: Record<string, any>
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
  // Module Feature Flags
  module_training_enabled?: boolean
  module_cdc_enabled?: boolean
  module_drives_enabled?: boolean
  // CDC 8 Periods Configuration
  p1_start?: string; p1_end?: string
  p2_start?: string; p2_end?: string
  p3_start?: string; p3_end?: string
  p4_start?: string; p4_end?: string
  p5_start?: string; p5_end?: string
  p6_start?: string; p6_end?: string
  p7_start?: string; p7_end?: string
  p8_start?: string; p8_end?: string
  updated_at: string
}

export interface QrPayload {
  student_id: string
  name: string
  institution?: string | null
  department: string
  year: number
  section: string
  batch?: string | null
  ts: number   // unix seconds — freshness check (0 for offline pass)
  date?: string
  mode?: 'online' | 'offline'
}

export interface ReportFilters {
  dateFrom: string
  dateTo: string
  institution?: string
  department: string
  section: string
  year: string
  session: string
  batch: string
}

export interface RosterRecord {
  student_id:  string
  name:        string
  institution?: string | null
  department:  string
  year:        number
  section:     string
  present:     boolean
}

export interface RosterMultiRecord {
  student_id:   string
  name:         string
  institution?: string | null
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
  institution?: string | null
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

export interface PlacementDrive {
  id: string
  company_name: string
  title: string
  drive_date: string
  drive_date_end?: string | null
  venue: string
  description?: string | null
  status: 'Upcoming' | 'Active' | 'Completed'
  total_eligible?: number
  total_present?: number
  created_at: string
  updated_at: string
}

export interface PlacementDriveStudent {
  id: string
  drive_id: string
  student_id: string
  status: 'Eligible' | 'Present' | 'Absent'
  marked_at?: string | null
  marked_by?: string | null
  marked_by_name?: string | null
  created_at: string
  // Per-student scheduling details (from TPO CSV upload)
  mobile?: string | null
  assessment_date?: string | null
  test_time?: string | null
  slot?: string | null
  venue?: string | null
  // Joined student info
  name?: string
  department?: string
  year?: number
  section?: string
  batch?: string
}


export interface PlacementDriveStudentRow {
  student_id: string
  mobile?: string
  assessment_date?: string
  test_time?: string
  slot?: string
  venue?: string
}

export interface CdcPeriodAllocation {
  id: string
  section_name: string
  institution?: string | null
  department?: string | null
  year?: number | string | null
  section?: string | null
  subject: string
  faculty_id?: string | null
  faculty_name?: string | null
}

export interface CdcTimetableEntry {
  id?: string
  day_of_week: number
  period_number: number
  subject?: string | null
  faculty_name?: string | null
  allocations: CdcPeriodAllocation[]
}




