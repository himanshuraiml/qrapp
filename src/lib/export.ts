import type { AttendanceRecord, SectionSummary, RosterRecord, RosterMultiRecord, BatchSummary, BatchRosterRecord, BatchRosterMultiRecord } from '@/types'
import { formatTime } from './utils'

// Maps a large array in chunks, yielding to the event loop between chunks so
// the browser can repaint (e.g. keep an "Exporting…" spinner alive) instead of
// freezing the main thread on a huge synchronous .map(). Used by the attendance
// exporters, which can hold tens of thousands of rows.
async function mapInChunks<T, R>(items: T[], fn: (item: T) => R, chunkSize = 2000): Promise<R[]> {
  const out: R[] = new Array(items.length)
  for (let i = 0; i < items.length; i += chunkSize) {
    const end = Math.min(i + chunkSize, items.length)
    for (let j = i; j < end; j++) out[j] = fn(items[j])
    if (end < items.length) await new Promise((r) => setTimeout(r))
  }
  return out
}

// ─────────────────────────────────────────
// Bulk student upload template
// The header row here is the single source of truth — the upload parser in
// BulkStudentUpload matches on these exact (case-insensitive) names, so the
// template and the parser can never drift apart.
// ─────────────────────────────────────────
export const STUDENT_TEMPLATE_HEADERS = [
  'Register No', 'Name', 'Department', 'Year', 'Section', 'Batch', 'Password',
] as const

export async function downloadStudentTemplate() {
  const XLSX = await import('xlsx')

  const example = [
    { 'Register No': 'RA2311003010001', Name: 'John Doe',  Department: 'CSE', Year: 1, Section: 'A', Batch: 'A', Password: '' },
    { 'Register No': 'RA2311003010002', Name: 'Jane Smith', Department: 'IT',  Year: 2, Section: 'B', Batch: 'C', Password: '' },
  ]
  const ws = XLSX.utils.json_to_sheet(example, { header: [...STUDENT_TEMPLATE_HEADERS] })
  ws['!cols'] = [20, 24, 14, 6, 8, 8, 16].map((w) => ({ wch: w }))

  const notes = [
    ['QR Attendance — Bulk Student Upload Template'],
    [''],
    ['Required columns (do NOT rename, remove, or reorder the header row in the Students sheet):'],
    ['  Register No  — roll / register number; must be unique (e.g. RA2311003010001)'],
    ['  Name         — student full name'],
    ['  Department   — e.g. CSE, IT, AIML'],
    ['  Year         — must be 1, 2, 3 or 4'],
    ['  Section      — e.g. A, B, C'],
    [''],
    ['Optional columns:'],
    ['  Batch        — training batch A–P (leave blank if not applicable)'],
    ['  Password     — leave blank to default the password to the Register No'],
    [''],
    ['Notes:'],
    ['  • Delete the two example rows in the "Students" sheet before uploading.'],
    ['  • Existing register numbers are skipped, never overwritten.'],
    ['  • The login email is generated automatically as <registerno>@student.local'],
  ]
  const wsNotes = XLSX.utils.aoa_to_sheet(notes)
  wsNotes['!cols'] = [{ wch: 90 }]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Students')
  XLSX.utils.book_append_sheet(wb, wsNotes, 'Instructions')
  XLSX.writeFile(wb, 'student_upload_template.xlsx')
}

// ─────────────────────────────────────────
// Excel export (SheetJS)
// ─────────────────────────────────────────
export async function exportAttendanceToExcel(
  records: AttendanceRecord[],
  title: string,
  filename: string
) {
  const XLSX = await import('xlsx')

  const rows = await mapInChunks(records, (r) => ({
    'Student ID':   r.student_id,
    'Name':         r.student_name,
    'Department':   r.department,
    'Year':         r.year,
    'Section':      r.section,
    'Batch':        r.batch || '—',
    'Session':      r.session,
    'Date':         r.date,
    'Time (IST)':   formatTime(r.timestamp),
    'Marked By':    r.marked_by_name,
  }))

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(rows)

  // Column widths
  ws['!cols'] = [14, 24, 14, 6, 10, 10, 8, 12, 12, 24].map((w) => ({ wch: w }))

  XLSX.utils.book_append_sheet(wb, ws, 'Attendance')
  XLSX.writeFile(wb, `${filename}.xlsx`)
}

export async function exportSectionSummaryToExcel(
  rows: SectionSummary[],
  date: string
) {
  const XLSX = await import('xlsx')

  const data = rows.map((r) => ({
    Department:       r.department,
    Year:             r.year,
    Section:          r.section,
    FN1:              r.fn1_count,
    FN2:              r.fn2_count,
    AN1:              r.an1_count,
    AN2:              r.an2_count,
    'Total Students': r.total_students,
    'Attendance %':   `${r.attendance_pct}%`,
  }))

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(data)
  ws['!cols'] = [14, 6, 10, 6, 6, 6, 6, 14, 14].map((w) => ({ wch: w }))
  XLSX.utils.book_append_sheet(wb, ws, `Summary_${date}`)
  XLSX.writeFile(wb, `section_summary_${date}.xlsx`)
}


// ─────────────────────────────────────────
// PDF export (jsPDF + autoTable)
// ─────────────────────────────────────────
export async function exportAttendanceToPDF(
  records: AttendanceRecord[],
  title: string,
  filename: string
) {
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

  doc.setFontSize(16)
  doc.setTextColor(30, 27, 75)
  doc.text('QR Attendance Report — SRMIST Tiruchirappalli Campus', 14, 16)
  doc.setFontSize(10)
  doc.setTextColor(100, 100, 100)
  doc.text(title, 14, 23)
  doc.text(`Generated: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`, 14, 29)

  autoTable(doc, {
    startY: 35,
    head: [['Student ID', 'Name', 'Dept', 'Yr', 'Sec', 'Batch', 'Session', 'Date', 'Time', 'Marked By']],
    body: await mapInChunks(records, (r) => [
      r.student_id, r.student_name, r.department, r.year, r.section, r.batch || '—',
      r.session, r.date, formatTime(r.timestamp), r.marked_by_name,
    ]),
    styles: { fontSize: 7.5, cellPadding: 2 },
    headStyles: { fillColor: [99, 102, 241], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [238, 242, 255] },
    margin: { left: 14, right: 14 },
  })

  doc.save(`${filename}.pdf`)
}

export async function exportSectionSummaryToPDF(
  rows: SectionSummary[],
  date: string
) {
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

  doc.setFontSize(16)
  doc.setTextColor(30, 27, 75)
  doc.text('Section-wise Attendance Summary — SRMIST Tiruchirappalli Campus', 14, 16)
  doc.setFontSize(10)
  doc.setTextColor(100, 100, 100)
  doc.text(`Date: ${date}`, 14, 23)

  autoTable(doc, {
    startY: 30,
    head: [['Department', 'Year', 'Section', 'FN1', 'FN2', 'AN1', 'AN2', 'Total', '%']],
    body: rows.map((r) => [
      r.department, r.year, r.section,
      r.fn1_count, r.fn2_count,
      r.an1_count, r.an2_count,
      r.total_students, `${r.attendance_pct}%`,
    ]),
    styles: { fontSize: 8, cellPadding: 2, halign: 'center' },
    columnStyles: { 0: { halign: 'left' } },
    headStyles: { fillColor: [99, 102, 241], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [238, 242, 255] },
    margin: { left: 14, right: 14 },
  })

  doc.save(`section_summary_${date}.pdf`)
}

// ─────────────────────────────────────────
// Roster export (attendance drill-down)
// ─────────────────────────────────────────
export async function exportRosterToExcel(
  rows: RosterRecord[],
  date: string,
  session: string
) {
  const XLSX = await import('xlsx')

  const data = rows.map((r) => ({
    'Student ID': r.student_id,
    Name:         r.name,
    Department:   r.department,
    Year:         r.year,
    Section:      r.section,
    Status:       r.present ? 'Present' : 'Absent',
  }))

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(data)
  ws['!cols'] = [18, 28, 16, 6, 10, 10].map((w) => ({ wch: w }))
  XLSX.utils.book_append_sheet(wb, ws, `Roster_${session}`)
  XLSX.writeFile(wb, `roster_${date}_${session}.xlsx`)
}

export async function exportRosterToPDF(
  rows: RosterRecord[],
  date: string,
  session: string
) {
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

  doc.setFontSize(16)
  doc.setTextColor(30, 27, 75)
  doc.text('Attendance Roster — SRMIST Tiruchirappalli Campus', 14, 16)
  doc.setFontSize(10)
  doc.setTextColor(100, 100, 100)
  doc.text(`Date: ${date}  |  Session: ${session}`, 14, 23)
  doc.text(`Generated: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`, 14, 29)

  autoTable(doc, {
    startY: 35,
    head: [['Student ID', 'Name', 'Department', 'Year', 'Section', 'Status']],
    body: rows.map((r) => [
      r.student_id, r.name, r.department, r.year, r.section,
      r.present ? 'Present' : 'Absent',
    ]),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [99, 102, 241], textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      5: {
        fontStyle: 'bold',
      },
    },
    didParseCell: (data: any) => {
      if (data.column.index === 5 && data.section === 'body') {
        data.cell.styles.textColor =
          data.cell.raw === 'Present' ? [22, 163, 74] : [220, 38, 38]
      }
    },
    alternateRowStyles: { fillColor: [238, 242, 255] },
    margin: { left: 14, right: 14 },
  })

  doc.save(`roster_${date}_${session}.pdf`)
}

// ─────────────────────────────────────────
// Roster Multi-Session export (All Sessions mode)
// ─────────────────────────────────────────
const ROSTER_SESSION_KEYS: Array<{ key: keyof RosterMultiRecord; label: string }> = [
  { key: 'fn1_present', label: 'FN1' },
  { key: 'fn2_present', label: 'FN2' },
  { key: 'an1_present', label: 'AN1' },
  { key: 'an2_present', label: 'AN2' },
]

function activeRosterSessions(rows: RosterMultiRecord[]) {
  return ROSTER_SESSION_KEYS.filter(({ key }) => rows.some((r) => r[key] === true))
}

export async function exportRosterMultiToExcel(rows: RosterMultiRecord[], date: string) {
  const XLSX = await import('xlsx')
  const sessions = activeRosterSessions(rows)

  const data = rows.map((r) => {
    const base: Record<string, string | number> = {
      'Student ID': r.student_id,
      Name:         r.name,
      Department:   r.department,
      Year:         r.year,
      Section:      r.section,
    }
    sessions.forEach(({ key, label }) => {
      base[label] = r[key] ? 'Present' : 'Absent'
    })
    return base
  })

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(data)
  ws['!cols'] = [18, 28, 16, 6, 10, ...sessions.map(() => 10)].map((w) => ({ wch: w }))
  XLSX.utils.book_append_sheet(wb, ws, 'Roster_All_Sessions')
  XLSX.writeFile(wb, `roster_${date}_all_sessions.xlsx`)
}

export async function exportRosterMultiToPDF(rows: RosterMultiRecord[], date: string) {
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')
  const sessions = activeRosterSessions(rows)

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

  doc.setFontSize(16)
  doc.setTextColor(30, 27, 75)
  doc.text('Attendance Roster (All Sessions) — SRMIST Tiruchirappalli Campus', 14, 16)
  doc.setFontSize(10)
  doc.setTextColor(100, 100, 100)
  doc.text(`Date: ${date}  |  Sessions: ${sessions.map((s) => s.label).join(', ')}`, 14, 23)
  doc.text(`Generated: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`, 14, 29)

  autoTable(doc, {
    startY: 35,
    head: [['Student ID', 'Name', 'Department', 'Year', 'Section', ...sessions.map((s) => s.label)]],
    body: rows.map((r) => [
      r.student_id, r.name, r.department, r.year, r.section,
      ...sessions.map(({ key }) => r[key] ? 'Present' : 'Absent'),
    ]),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [99, 102, 241], textColor: 255, fontStyle: 'bold' },
    didParseCell: (data: any) => {
      if (data.column.index >= 5 && data.section === 'body') {
        data.cell.styles.textColor =
          data.cell.raw === 'Present' ? [22, 163, 74] : [220, 38, 38]
        data.cell.styles.fontStyle = 'bold'
      }
    },
    alternateRowStyles: { fillColor: [238, 242, 255] },
    margin: { left: 14, right: 14 },
  })

  doc.save(`roster_${date}_all_sessions.pdf`)
}

// ─────────────────────────────────────────
// Batch Roster export (attendance drill-down)
// ─────────────────────────────────────────
export async function exportBatchRosterToExcel(
  rows: BatchRosterRecord[],
  date: string,
  session: string
) {
  const XLSX = await import('xlsx')

  const data = rows.map((r) => ({
    'Student ID': r.student_id,
    Name:         r.name,
    Batch:        `Batch ${r.batch}`,
    Year:         r.year,
    Status:       r.present ? 'Present' : 'Absent',
  }))

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(data)
  ws['!cols'] = [18, 28, 12, 6, 10].map((w) => ({ wch: w }))
  XLSX.utils.book_append_sheet(wb, ws, `Roster_${session}`)
  XLSX.writeFile(wb, `batch_roster_${date}_${session}.xlsx`)
}

export async function exportBatchRosterToPDF(
  rows: BatchRosterRecord[],
  date: string,
  session: string
) {
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

  doc.setFontSize(16)
  doc.setTextColor(30, 27, 75)
  doc.text('Batch-wise Attendance Roster — SRMIST Tiruchirappalli Campus', 14, 16)
  doc.setFontSize(10)
  doc.setTextColor(100, 100, 100)
  doc.text(`Date: ${date}  |  Session: ${session}`, 14, 23)
  doc.text(`Generated: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`, 14, 29)

  autoTable(doc, {
    startY: 35,
    head: [['Student ID', 'Name', 'Batch', 'Year', 'Status']],
    body: rows.map((r) => [
      r.student_id, r.name, `Batch ${r.batch}`, r.year,
      r.present ? 'Present' : 'Absent',
    ]),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [99, 102, 241], textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      4: {
        fontStyle: 'bold',
      },
    },
    didParseCell: (data: any) => {
      if (data.column.index === 4 && data.section === 'body') {
        data.cell.styles.textColor =
          data.cell.raw === 'Present' ? [22, 163, 74] : [220, 38, 38]
      }
    },
    alternateRowStyles: { fillColor: [238, 242, 255] },
    margin: { left: 14, right: 14 },
  })

  doc.save(`batch_roster_${date}_${session}.pdf`)
}


// ─────────────────────────────────────────
// Batch Summary export
// ─────────────────────────────────────────
export async function exportBatchSummaryToExcel(
  rows: BatchSummary[],
  dateRangeText: string
) {
  const XLSX = await import('xlsx')

  const data = rows.map((r) => ({
    Batch:              `Batch ${r.batch}`,
    'FN1':              r.fn1_count ?? 0,
    'FN2':              r.fn2_count ?? 0,
    'AN1':              r.an1_count ?? 0,
    'AN2':              r.an2_count ?? 0,
    'Total Students':   r.total_students,
    'Daily Avg Present': r.present_count,
    'Attendance %':     `${r.attendance_pct}%`,
  }))

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(data)
  ws['!cols'] = [12, 8, 8, 8, 8, 16, 18, 16].map((w) => ({ wch: w }))
  XLSX.utils.book_append_sheet(wb, ws, 'Batch_Summary')
  XLSX.writeFile(wb, `batch_summary_${dateRangeText.replace(/[^a-zA-Z0-9_-]/g, '_')}.xlsx`)
}

export async function exportBatchSummaryToPDF(
  rows: BatchSummary[],
  dateRangeText: string
) {
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

  doc.setFontSize(14)
  doc.setTextColor(30, 27, 75)
  doc.text('Batch-wise Session Attendance Summary — SRMIST Tiruchirappalli', 14, 16)
  doc.setFontSize(9)
  doc.setTextColor(100, 100, 100)
  doc.text(`Date Range: ${dateRangeText}`, 14, 23)
  doc.text(`Generated: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`, 14, 29)

  autoTable(doc, {
    startY: 35,
    head: [['Batch', 'FN1', 'FN2', 'AN1', 'AN2', 'Total Students', 'Daily Avg Present', 'Attendance %']],
    body: rows.map((r) => [
      `Batch ${r.batch}`,
      r.fn1_count ?? 0,
      r.fn2_count ?? 0,
      r.an1_count ?? 0,
      r.an2_count ?? 0,
      r.total_students,
      r.present_count,
      `${r.attendance_pct}%`,
    ]),
    styles: { fontSize: 9, cellPadding: 3, halign: 'center' },
    columnStyles: { 0: { halign: 'left', fontStyle: 'bold' } },
    headStyles: { fillColor: [99, 102, 241], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [238, 242, 255] },
    margin: { left: 14, right: 14 },
  })

  doc.save(`batch_summary_${dateRangeText.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`)
}


// ─────────────────────────────────────────
// Batch Roster Multi-Session export (All Sessions mode)
// ─────────────────────────────────────────
const SESSION_KEYS: Array<{ key: keyof BatchRosterMultiRecord; label: string }> = [
  { key: 'fn1_present', label: 'FN1' },
  { key: 'fn2_present', label: 'FN2' },
  { key: 'an1_present', label: 'AN1' },
  { key: 'an2_present', label: 'AN2' },
]

function activeSessions(rows: BatchRosterMultiRecord[]) {
  return SESSION_KEYS.filter(({ key }) => rows.some((r) => r[key] === true))
}

export async function exportBatchRosterMultiToExcel(
  rows: BatchRosterMultiRecord[],
  date: string
) {
  const XLSX = await import('xlsx')
  const sessions = activeSessions(rows)

  const data = rows.map((r) => {
    const base: Record<string, string | number> = {
      'Student ID': r.student_id,
      Name: r.name,
      Batch: `Batch ${r.batch}`,
      Year: r.year,
    }
    sessions.forEach(({ key, label }) => {
      base[label] = r[key] ? 'Present' : 'Absent'
    })
    return base
  })

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(data)
  ws['!cols'] = [18, 28, 12, 6, ...sessions.map(() => 10)].map((w) => ({ wch: w }))
  XLSX.utils.book_append_sheet(wb, ws, 'Batch_Roster_All_Sessions')
  XLSX.writeFile(wb, `batch_roster_${date}_all_sessions.xlsx`)
}

export async function exportBatchRosterMultiToPDF(
  rows: BatchRosterMultiRecord[],
  date: string
) {
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')
  const sessions = activeSessions(rows)

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

  doc.setFontSize(16)
  doc.setTextColor(30, 27, 75)
  doc.text('Batch-wise Attendance Roster (All Sessions) — SRMIST Tiruchirappalli Campus', 14, 16)
  doc.setFontSize(10)
  doc.setTextColor(100, 100, 100)
  doc.text(`Date: ${date}  |  Sessions: ${sessions.map((s) => s.label).join(', ')}`, 14, 23)
  doc.text(`Generated: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`, 14, 29)

  autoTable(doc, {
    startY: 35,
    head: [['Student ID', 'Name', 'Batch', 'Year', ...sessions.map((s) => s.label)]],
    body: rows.map((r) => [
      r.student_id, r.name, `Batch ${r.batch}`, r.year,
      ...sessions.map(({ key }) => r[key] ? 'Present' : 'Absent'),
    ]),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [99, 102, 241], textColor: 255, fontStyle: 'bold' },
    didParseCell: (data: any) => {
      if (data.column.index >= 4 && data.section === 'body') {
        data.cell.styles.textColor =
          data.cell.raw === 'Present' ? [22, 163, 74] : [220, 38, 38]
        data.cell.styles.fontStyle = 'bold'
      }
    },
    alternateRowStyles: { fillColor: [238, 242, 255] },
    margin: { left: 14, right: 14 },
  })

  doc.save(`batch_roster_${date}_all_sessions.pdf`)
}
