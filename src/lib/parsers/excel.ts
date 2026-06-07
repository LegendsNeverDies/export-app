import * as XLSX from 'xlsx'
import { ParsedFile, ParsedSheet, RawRow } from '../types'

/**
 * 解析 Excel 文件，保留完整的文件结构信息
 * 不做硬编码表头检测，表头位置由规则指定
 */
export function parseExcel(buffer: ArrayBuffer): ParsedFile[] {
  const wb = XLSX.read(buffer, {
    type: 'array',
    cellDates: true,
    cellNF: true,
    cellText: true,
  })

  return wb.SheetNames.map((sheetName, sheetIndex) => {
    const ws = wb.Sheets[sheetName]
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')

    // 获取所有行数据（二维数组）
    const allRows: unknown[][] = []
    for (let r = range.s.r; r <= range.e.r; r++) {
      const row: unknown[] = []
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cellAddress = XLSX.utils.encode_cell({ r, c })
        const cell = ws[cellAddress]
        if (cell) {
          // 保留原始值
          row.push(cell.v !== undefined ? cell.v : '')
        } else {
          row.push(null)
        }
      }
      allRows.push(row)
    }

    const totalRows = allRows.length
    const totalCols = range.e.c - range.s.c + 1

    // 默认使用第一行作为 headers（用户可通过规则指定其他行）
    const defaultHeaderIdx = 0
    const headers = allRows[defaultHeaderIdx]
      ? (allRows[defaultHeaderIdx] as unknown[]).map(h => String(h ?? '').trim())
      : []

    // 将所有行转换为对象格式（使用第一行作为 key）
    const rows: RawRow[] = allRows.map((row, rowIdx) => {
      const obj: RawRow = { _rowIndex: rowIdx }
      headers.forEach((h, i) => {
        if (h) obj[h] = (row as unknown[])[i]
      })
      return obj
    })

    // 构建结构化 Sheet 数据
    const parsedSheet: ParsedSheet = {
      name: sheetName,
      totalRows,
      totalCols,
      allRows,
      headers,
      rows,
    }

    return {
      sheets: wb.SheetNames,
      headers,
      rows,
      rawData: { sheetName, sheetIndex, allRows, totalRows, totalCols, range },
      parsedSheets: [parsedSheet],
    }
  })
}
