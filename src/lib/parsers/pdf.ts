import { ParsedFile, ParsedPdf, ParsedPdfPage, ParsedPdfSection, RawRow } from '../types'

/**
 * 解析 PDF 文件，使用 pdfjs-dist legacy build（Node.js 兼容）
 * PDF 文本没有行列结构，需要用位置信息来识别行
 */
export async function parsePDF(buffer: ArrayBuffer): Promise<ParsedFile> {
  let fullText: string
  let numPages: number
  let structuredItems: { str: string; x: number; y: number; page: number }[] = []

  try {
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise
    numPages = doc.numPages

    const pageTexts: string[] = []
    for (let i = 1; i <= numPages; i++) {
      const page = await doc.getPage(i)
      const content = await page.getTextContent()
      const text = content.items
        .map((item: any) => item.str || '')
        .join(' ')
      pageTexts.push(text)

      // 收集文本项的位置信息，用于识别行
      for (const item of content.items as any[]) {
        if (item.str && item.str.trim()) {
          const transform = item.transform
          structuredItems.push({
            str: item.str,
            x: transform[4],
            y: transform[5],
            page: i,
          })
        }
      }
    }
    doc.destroy()
    fullText = pageTexts.join('\n\n')
  } catch (err: any) {
    throw new Error(`PDF 解析失败: ${err.message}`)
  }

  const pages: ParsedPdfPage[] = fullText.split('\n\n').map((text, idx) => ({
    pageIndex: idx,
    text: text.trim(),
  })).filter(p => p.text.length > 0)

  const sections = detectSections(pages, fullText)
  const { headers, rows, allRows } = extractStructuredData(structuredItems)

  const parsedPdf: ParsedPdf = {
    pages,
    sections,
    headers,
    rows,
    fullText,
  }

  return {
    headers,
    rows,
    rawData: { fullText, numPages, sections },
    parsedPdf,
    parsedSheets: [{
      name: 'PDF',
      totalRows: allRows.length,
      totalCols: headers.length || 7,
      allRows,
      headers,
      rows,
    }],
  }
}

function detectSections(pages: ParsedPdfPage[], fullText: string): ParsedPdfSection[] {
  const sections: ParsedPdfSection[] = []
  const orderMarkers = fullText.match(/配送单号|发货单号|调拨单号|单据编号/g) || []

  if (orderMarkers.length > 1) {
    let lastIdx = 0
    const markerPattern = /(?:配送单号|发货单号|调拨单号|单据编号)/g
    let match
    while ((match = markerPattern.exec(fullText)) !== null) {
      if (match.index > lastIdx + 50) {
        sections.push({ type: 'order', text: fullText.substring(lastIdx, match.index).trim(), startPage: 0, endPage: 0 })
      }
      lastIdx = match.index
    }
    if (lastIdx < fullText.length) {
      sections.push({ type: 'order', text: fullText.substring(lastIdx).trim(), startPage: 0, endPage: 0 })
    }
  } else {
    sections.push({ type: 'order', text: fullText, startPage: 0, endPage: pages.length - 1 })
  }

  return sections
}

/**
 * 使用位置信息从 PDF 文本项中提取结构化表格数据
 * 按 Y 坐标分行，按 X 坐标排列
 */
function extractStructuredData(items: { str: string; x: number; y: number; page: number }[]): {
  headers: string[]
  rows: RawRow[]
  allRows: unknown[][]
} {
  if (items.length === 0) {
    return { headers: [], rows: [], allRows: [] }
  }

  // 按 Y 坐标分行（Y 值相近的在同一行，容差 3px）
  const sortedItems = [...items].sort((a, b) => {
    if (a.page !== b.page) return a.page - b.page
    return b.y - a.y || a.x - b.x // PDF Y 轴从上到下递减
  })

  const lines: { y: number; page: number; items: { str: string; x: number }[] }[] = []
  let currentLine: { y: number; page: number; items: { str: string; x: number }[] } | null = null

  for (const item of sortedItems) {
    if (!currentLine || Math.abs(item.y - currentLine.y) > 3 || item.page !== currentLine.page) {
      currentLine = { y: item.y, page: item.page, items: [] }
      lines.push(currentLine)
    }
    currentLine.items.push({ str: item.str, x: item.x })
  }

  // 每行按 X 排序
  for (const line of lines) {
    line.items.sort((a, b) => a.x - b.x)
  }

  // 将每行合并为文本数组
  const textLines: string[][] = lines.map(line => {
    // 将 X 坐标相近的项合并（容差 5px）
    const merged: { str: string; x: number }[] = []
    for (const item of line.items) {
      const last = merged[merged.length - 1]
      if (last && Math.abs(item.x - (last.x + last.str.length * 5)) < 15) {
        last.str += item.str
      } else {
        merged.push({ str: item.str, x: item.x })
      }
    }
    return merged.map(m => m.str.trim()).filter(s => s)
  })

  // 查找表头行
  const headerKeywords = ['物品编码', 'SKU编码', '物品名称', '条码', '物品类别']
  let headerLineIdx = -1

  for (let i = 0; i < Math.min(textLines.length, 30); i++) {
    const line = textLines[i]
    let matchCount = 0
    headerKeywords.forEach(kw => {
      if (line.some(cell => cell.includes(kw))) matchCount++
    })
    if (matchCount >= 2) {
      headerLineIdx = i
      break
    }
  }

  if (headerLineIdx < 0) {
    // 没有找到表头行，将全文按行返回
    return {
      headers: ['内容'],
      rows: textLines.map((line, idx) => ({ _rowIndex: idx, '内容': line.join(' ') })),
      allRows: textLines,
    }
  }

  const headerCols = textLines[headerLineIdx]
  const metaLines = textLines.slice(0, headerLineIdx)
  const dataAndFooterLines = textLines.slice(headerLineIdx + 1)

  // 分离数据行和页脚行
  const totalPatterns = ['合计', '总计', 'total', '小计', '合 计']
  const footerKeywords = ['收货人', '收货电话', '收货地址', '签字', '备注']
  const dataRows: string[][] = []
  const footerRows: string[][] = []
  let inFooter = false

  for (const line of dataAndFooterLines) {
    const lineText = line.join(' ')
    if (totalPatterns.some(p => lineText.includes(p))) continue
    if (footerKeywords.some(kw => lineText.includes(kw))) {
      inFooter = true
    }
    if (line.length > 0) {
      if (inFooter) {
        footerRows.push(line)
      } else if (line.length >= 3 && !lineText.match(/^第\d+页/)) {
        dataRows.push(line)
      }
    }
  }

  // 构建 allRows
  const allRows: unknown[][] = [
    ...metaLines,
    headerCols,
    ...dataRows,
    ...footerRows,
  ]

  // 构建 object 格式 rows
  const rows: RawRow[] = dataRows.map((row, idx) => {
    const obj: RawRow = { _rowIndex: idx }
    headerCols.forEach((h, i) => {
      if (h && i < row.length) {
        obj[h] = row[i]
      }
    })
    return obj
  })

  return { headers: headerCols, rows, allRows }
}
