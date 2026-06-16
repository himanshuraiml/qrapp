'use client'

import { useRef, useState } from 'react'
import { downloadStudentTemplate } from '@/lib/export'

// Canonical field <- accepted (normalised) header aliases. Keeping a few common
// aliases reduces "column name mismatch" failures on upload.
const HEADER_ALIASES: Record<string, string[]> = {
  student_id: ['register no', 'registerno', 'register number', 'roll no', 'rollno', 'roll number', 'student id', 'studentid', 'reg no'],
  name:       ['name', 'full name', 'student name'],
  department: ['department', 'dept'],
  year:       ['year'],
  section:    ['section', 'sec'],
  batch:      ['batch'],
  password:   ['password', 'pwd', 'pass'],
}

interface ParsedRow {
  rowNum: number
  student_id: string
  name: string
  department: string
  year: string
  section: string
  batch: string
  password: string
  valid: boolean
  reason?: string
}

type RowResult = {
  rowNum: number
  student_id: string
  status: 'created' | 'updated' | 'skipped' | 'error'
  message?: string
}

const CHUNK_SIZE = 25

export default function BulkStudentUpload({ onComplete }: { onComplete?: () => void }) {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [fileName, setFileName] = useState('')
  const [parseError, setParseError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [results, setResults] = useState<RowResult[] | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function reset() {
    setRows([]); setFileName(''); setParseError(''); setResults(null); setProgress(0)
    if (fileRef.current) fileRef.current.value = ''
  }

  function buildHeaderMap(rawHeaders: string[]): Record<number, string> {
    const map: Record<number, string> = {}
    rawHeaders.forEach((h, i) => {
      const norm = String(h ?? '').trim().toLowerCase()
      for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
        if (aliases.includes(norm)) { map[i] = field; break }
      }
    })
    return map
  }

  async function handleFile(file: File) {
    reset()
    setFileName(file.name)
    try {
      const XLSX = await import('xlsx')
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      // Prefer a sheet named "Students", else the first sheet.
      const sheetName = wb.SheetNames.find((n) => n.toLowerCase() === 'students') ?? wb.SheetNames[0]
      const ws = wb.Sheets[sheetName]
      if (!ws) { setParseError('Could not read any sheet in this file.'); return }

      // rows as arrays so we can map header positions ourselves.
      const matrix: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', blankrows: false })
      if (matrix.length < 2) { setParseError('The sheet has a header row but no student rows.'); return }

      const headerMap = buildHeaderMap(matrix[0].map((x) => String(x)))
      const haveFields = new Set(Object.values(headerMap))
      const missing = ['student_id', 'name', 'department', 'year', 'section'].filter((f) => !haveFields.has(f))
      if (missing.length) {
        const labels: Record<string, string> = { student_id: 'Register No', name: 'Name', department: 'Department', year: 'Year', section: 'Section' }
        setParseError(`Missing required column(s): ${missing.map((m) => labels[m]).join(', ')}. Download the template and keep the header row unchanged.`)
        return
      }

      const get = (arr: any[], field: string) => {
        const idx = Object.keys(headerMap).find((k) => headerMap[Number(k)] === field)
        return idx === undefined ? '' : String(arr[Number(idx)] ?? '').trim()
      }

      const parsed: ParsedRow[] = []
      for (let i = 1; i < matrix.length; i++) {
        const arr = matrix[i]
        const student_id = get(arr, 'student_id').toUpperCase()
        const name = get(arr, 'name')
        const department = get(arr, 'department')
        const year = get(arr, 'year')
        const section = get(arr, 'section')
        const batch = get(arr, 'batch').toUpperCase()
        const password = get(arr, 'password')

        // Skip fully blank rows.
        if (!student_id && !name && !department && !section && !year) continue

        let valid = true
        let reason: string | undefined
        const yearNum = parseInt(year, 10)
        if (!student_id || !name || !department || !section || !year) {
          valid = false; reason = 'Missing required field'
        } else if (isNaN(yearNum) || yearNum < 1 || yearNum > 4) {
          valid = false; reason = 'Year must be 1–4'
        }

        parsed.push({ rowNum: i + 1, student_id, name, department, year, section, batch, password, valid, reason })
      }

      if (parsed.length === 0) { setParseError('No student rows found (did you delete the example rows but leave them all blank?).'); return }
      setRows(parsed)
    } catch (err: any) {
      setParseError(err?.message ?? 'Failed to read the file. Make sure it is a valid .xlsx file.')
    }
  }

  async function handleUpload() {
    const valid = rows.filter((r) => r.valid)
    if (valid.length === 0) return
    setUploading(true)
    setResults(null)
    setProgress(0)

    const all: RowResult[] = []
    // Invalid rows reported up-front (never sent to the server).
    rows.filter((r) => !r.valid).forEach((r) =>
      all.push({ rowNum: r.rowNum, student_id: r.student_id, status: 'error', message: r.reason }))

    try {
      for (let i = 0; i < valid.length; i += CHUNK_SIZE) {
        const chunk = valid.slice(i, i + CHUNK_SIZE)
        const res = await fetch('/api/admin/bulk-create-students', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            students: chunk.map((r) => ({
              rowNum: r.rowNum, student_id: r.student_id, name: r.name,
              department: r.department, year: r.year, section: r.section,
              batch: r.batch || null, password: r.password || null,
            })),
          }),
        })
        const json = await res.json()
        if (!json.success) {
          chunk.forEach((r) => all.push({ rowNum: r.rowNum, student_id: r.student_id, status: 'error', message: json.error ?? 'Request failed' }))
        } else {
          all.push(...(json.results as RowResult[]))
        }
        setProgress(Math.min(i + CHUNK_SIZE, valid.length))
      }
    } catch (err: any) {
      // network failure mid-way — mark the rest unknown
    }

    all.sort((a, b) => a.rowNum - b.rowNum)
    setResults(all)
    setUploading(false)
    if (all.some((r) => r.status === 'created' || r.status === 'updated')) onComplete?.()
  }

  async function downloadReport() {
    if (!results) return
    const XLSX = await import('xlsx')
    const data = results.map((r) => ({
      'Row': r.rowNum, 'Register No': r.student_id, 'Status': r.status, 'Detail': r.message ?? '',
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    ws['!cols'] = [6, 20, 10, 40].map((w) => ({ wch: w }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Upload_Report')
    XLSX.writeFile(wb, 'student_upload_report.xlsx')
  }

  const validCount = rows.filter((r) => r.valid).length
  const invalidCount = rows.length - validCount
  const created = results?.filter((r) => r.status === 'created').length ?? 0
  const updated = results?.filter((r) => r.status === 'updated').length ?? 0
  const skipped = results?.filter((r) => r.status === 'skipped').length ?? 0
  const errored = results?.filter((r) => r.status === 'error').length ?? 0

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        className="btn-secondary inline-flex items-center gap-1.5 text-xs py-2.5 font-bold"
      >
        <span>⬆️</span> Bulk Upload
      </button>

      {open && (
        <div className="card-premium border border-indigo-200/50 p-8 space-y-6 relative overflow-hidden bg-white/90 backdrop-blur-xl col-span-full w-full">
          <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-indigo-500 to-brand-500"></div>

          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-widest font-heading">Bulk Upload Students</h3>
              <p className="text-xs text-slate-400">Upload an Excel sheet. Use the template so the columns always match.</p>
            </div>
            <button
              onClick={() => downloadStudentTemplate()}
              className="btn-secondary text-xs py-2 px-4 font-bold whitespace-nowrap"
            >
              ⬇️ Download Template
            </button>
          </div>

          {/* File picker */}
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              disabled={uploading}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
              className="block text-xs text-slate-600 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-brand-500/10 file:text-brand-600 hover:file:bg-brand-500/20"
            />
            {fileName && <span className="text-xs text-slate-400 font-medium">{fileName}</span>}
            {(rows.length > 0 || results) && !uploading && (
              <button onClick={reset} className="text-xs font-bold text-slate-400 hover:text-slate-600 underline">Clear</button>
            )}
          </div>

          {parseError && (
            <div className="text-xs font-bold text-red-500 bg-red-50 border border-red-200 rounded-xl px-4 py-3">⚠️ {parseError}</div>
          )}

          {/* Preview before upload */}
          {rows.length > 0 && !results && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-3 text-xs font-bold">
                <span className="px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200">{validCount} ready</span>
                {invalidCount > 0 && <span className="px-3 py-1.5 rounded-xl bg-red-50 text-red-600 border border-red-200">{invalidCount} need fixing</span>}
              </div>

              <div className="max-h-64 overflow-auto rounded-xl border border-slate-200">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr className="text-slate-400 uppercase tracking-wider">
                      <th className="text-left px-3 py-2 font-bold">Row</th>
                      <th className="text-left px-3 py-2 font-bold">Register No</th>
                      <th className="text-left px-3 py-2 font-bold">Name</th>
                      <th className="text-left px-3 py-2 font-bold">Dept</th>
                      <th className="text-left px-3 py-2 font-bold">Yr</th>
                      <th className="text-left px-3 py-2 font-bold">Sec</th>
                      <th className="text-left px-3 py-2 font-bold">Batch</th>
                      <th className="text-left px-3 py-2 font-bold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((r) => (
                      <tr key={r.rowNum} className={r.valid ? '' : 'bg-red-50/50'}>
                        <td className="px-3 py-2 text-slate-400">{r.rowNum}</td>
                        <td className="px-3 py-2 font-semibold text-slate-700">{r.student_id || '—'}</td>
                        <td className="px-3 py-2 text-slate-600">{r.name || '—'}</td>
                        <td className="px-3 py-2 text-slate-600">{r.department || '—'}</td>
                        <td className="px-3 py-2 text-slate-600">{r.year || '—'}</td>
                        <td className="px-3 py-2 text-slate-600">{r.section || '—'}</td>
                        <td className="px-3 py-2 text-slate-600">{r.batch || '—'}</td>
                        <td className="px-3 py-2">
                          {r.valid
                            ? <span className="text-emerald-600 font-bold">OK</span>
                            : <span className="text-red-500 font-bold">{r.reason}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center gap-3 pt-2 border-t border-slate-100">
                <button
                  onClick={handleUpload}
                  disabled={uploading || validCount === 0}
                  className="btn-primary text-xs py-2.5 px-6 font-bold shadow-md shadow-brand-500/10 disabled:opacity-50"
                >
                  {uploading ? `Uploading… ${progress}/${validCount}` : `Create ${validCount} Student${validCount === 1 ? '' : 's'}`}
                </button>
                {invalidCount > 0 && (
                  <span className="text-xs text-slate-400">Rows marked red are skipped — fix them in the sheet and re-upload.</span>
                )}
              </div>

              {uploading && (
                <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full bg-brand-500 transition-all" style={{ width: `${validCount ? (progress / validCount) * 100 : 0}%` }} />
                </div>
              )}
            </div>
          )}

          {/* Results */}
          {results && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-3 text-xs font-bold">
                <span className="px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200">{created} created</span>
                {updated > 0 && <span className="px-3 py-1.5 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-200">{updated} updated</span>}
                {skipped > 0 && <span className="px-3 py-1.5 rounded-xl bg-amber-50 text-amber-700 border border-amber-200">{skipped} skipped (already exist)</span>}
                {errored > 0 && <span className="px-3 py-1.5 rounded-xl bg-red-50 text-red-600 border border-red-200">{errored} failed</span>}
                <button onClick={downloadReport} className="px-3 py-1.5 rounded-xl bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200">⬇️ Download report</button>
              </div>

              {(updated > 0 || skipped > 0 || errored > 0) && (
                <div className="max-h-64 overflow-auto rounded-xl border border-slate-200">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 sticky top-0">
                      <tr className="text-slate-400 uppercase tracking-wider">
                        <th className="text-left px-3 py-2 font-bold">Row</th>
                        <th className="text-left px-3 py-2 font-bold">Register No</th>
                        <th className="text-left px-3 py-2 font-bold">Status</th>
                        <th className="text-left px-3 py-2 font-bold">Detail</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {results.filter((r) => r.status !== 'created').map((r) => (
                        <tr key={`${r.rowNum}-${r.student_id}`} className={r.status === 'error' ? 'bg-red-50/50' : r.status === 'updated' ? 'bg-indigo-50/30' : 'bg-amber-50/40'}>
                          <td className="px-3 py-2 text-slate-400">{r.rowNum}</td>
                          <td className="px-3 py-2 font-semibold text-slate-700">{r.student_id || '—'}</td>
                          <td className="px-3 py-2 font-bold">
                            {r.status === 'error' && <span className="text-red-500">failed</span>}
                            {r.status === 'skipped' && <span className="text-amber-600">skipped</span>}
                            {r.status === 'updated' && <span className="text-indigo-600">updated</span>}
                          </td>
                          <td className="px-3 py-2 text-slate-600">{r.message ?? ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  )
}
