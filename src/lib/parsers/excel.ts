import * as XLSX from 'xlsx'
import { ParsedFile } from '../types'

export function parseExcel(buffer: ArrayBuffer): ParsedFile[] {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true, cellNF: true })
  return wb.SheetNames.map((sheetName, sheetIndex) => {
    const ws = wb.Sheets[sheetName]
    const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][]

    // Auto-detect header row: contains "物品编码" or "序号" or "SKU编码"
    let headerRowIdx = data.findIndex(row =>
      row.some(cell => /物品编码|SKU编码|序号/.test(String(cell ?? '')))
    )
    if (headerRowIdx < 0) headerRowIdx = 0

    const rawHeaders = data[headerRowIdx] as string[]
    const headers = rawHeaders.map(h => String(h ?? '').trim())

    const rows = data.slice(headerRowIdx + 1).map(row => {
      const obj: Record<string, unknown> = {}
      headers.forEach((h, i) => { obj[h] = (row as unknown[])[i] })
      return obj
    })

    return { sheets: wb.SheetNames, headers, rows, rawData: { sheetName, sheetIndex, allRows: data } }
  })
}
