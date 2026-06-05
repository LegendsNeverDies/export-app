import * as pdfParse from 'pdf-parse'
import { ParsedFile } from '../types'

export async function parsePDF(buffer: ArrayBuffer): Promise<ParsedFile> {
  const data = await (pdfParse as any)(Buffer.from(buffer))
  const text = data.text

  const lines = text.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0)

  const headers = ['内容']
  const rows = lines.map((line: string) => ({ '内容': line }))

  return {
    headers,
    rows,
    rawData: { text, lines, numpages: data.numpages },
  }
}
