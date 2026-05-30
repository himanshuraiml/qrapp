import type { AttendanceRecord, SectionSummary, RosterRecord, BatchSummary, BatchRosterRecord } from '@/types'
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
    head: [['Student ID', 'Name', 'Dept', 'Yr', 'Sec', 'Session', 'Date', 'Time', 'Marked By']],
    body: await mapInChunks(records, (r) => [
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
