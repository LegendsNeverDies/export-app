import { parseExcel } from './excel'
import { parsePDF } from './pdf'
import { ParsedFile } from '../types'

export async function parseFile(file: File): Promise<ParsedFile[]> {
  const buffer = await file.arrayBuffer()
  const name = file.name.toLowerCase()

  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    return parseExcel(buffer)
  }

  if (name.endsWith('.pdf')) {
    const result = await parsePDF(buffer)
    return [result]
  }

  if (name.endsWith('.docx') || name.endsWith('.doc')) {
    const result = await parseWord(buffer)
    return [result]
  }

  throw new Error('不支持的文件格式，仅支持 Excel、Word、PDF')
}

async function parseWord(buffer: ArrayBuffer): Promise<ParsedFile> {
  const mammoth = await import('mammoth')
  const result = await mammoth.extractRawText({ arrayBuffer: buffer })
  const lines = result.value.split('\n').map(l => l.trim()).filter(l => l.length > 0)

  return {
    headers: ['内容'],
    rows: lines.map(line => ({ '内容': line })),
    rawData: result,
  }
}

export { parseExcel, parsePDF }
