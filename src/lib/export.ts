import type { AttendanceRecord, SectionSummary } from '@/types'
import { formatTime } from './utils'

// ─────────────────────────────────────────
// Excel export (SheetJS)
// ─────────────────────────────────────────
export async function exportAttendanceToExcel(
  records: AttendanceRecord[],
  title: string,
  filename: string
) {
  const XLSX = await import('xlsx')

  const rows = records.map((r) => ({
    'Student ID':   r.student_id,
    'Name':         r.student_name,
    'Department':   r.department,
    'Year':         r.year,
    'Section':      r.section,
    'Session':      r.session,
    'Date':         r.date,
    'Time (IST)':   formatTime(r.timestamp),
    'Marked By':    r.marked_by_name,
  }))

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(rows)

  // Column widths
  ws['!cols'] = [14, 24, 14, 6, 10, 8, 12, 12, 24].map((w) => ({ wch: w }))

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
    FN3:              r.fn3_count,
    AN1:              r.an1_count,
    AN2:              r.an2_count,
    AN3:              r.an3_count,
    'Total Students': r.total_students,
    'Attendance %':   `${r.attendance_pct}%`,
  }))

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(data)
  ws['!cols'] = [14, 6, 10, 6, 6, 6, 6, 6, 6, 14, 14].map((w) => ({ wch: w }))
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
  doc.text('QR Attendance Report — SRMIST Trichy', 14, 16)
  doc.setFontSize(10)
  doc.setTextColor(100, 100, 100)
  doc.text(title, 14, 23)
  doc.text(`Generated: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`, 14, 29)

  autoTable(doc, {
    startY: 35,
    head: [['Student ID', 'Name', 'Dept', 'Yr', 'Sec', 'Session', 'Date', 'Time', 'Marked By']],
    body: records.map((r) => [
      r.student_id, r.student_name, r.department, r.year, r.section,
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
  doc.text('Section-wise Attendance Summary — SRMIST Trichy', 14, 16)
  doc.setFontSize(10)
  doc.setTextColor(100, 100, 100)
  doc.text(`Date: ${date}`, 14, 23)

  autoTable(doc, {
    startY: 30,
    head: [['Department', 'Year', 'Section', 'FN1', 'FN2', 'FN3', 'AN1', 'AN2', 'AN3', 'Total', '%']],
    body: rows.map((r) => [
      r.department, r.year, r.section,
      r.fn1_count, r.fn2_count, r.fn3_count,
      r.an1_count, r.an2_count, r.an3_count,
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
