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

  throw new Error('不支持的文件格式，仅支持 Excel、PDF')
}

export { parseExcel, parsePDF }
