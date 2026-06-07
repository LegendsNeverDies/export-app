import { NextRequest, NextResponse } from 'next/server'
import { analyzeFileWithAI } from '@/lib/ai-service'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { fileName, headers, sampleRows, headRows, tailRows, sheetNames, totalRows, pdfFullText, apiKey, rawAllRows } = body

    if (!apiKey) {
      return NextResponse.json({ success: false, message: '请先配置 DeepSeek API Key' }, { status: 400 })
    }

    // 优先使用 rawAllRows，headers 不再强制要求
    if (!rawAllRows && (!headers || !Array.isArray(headers) || headers.length === 0)) {
      return NextResponse.json({ success: false, message: '缺少文件数据' }, { status: 400 })
    }

    const result = await analyzeFileWithAI({
      fileName: fileName || '未知文件',
      headers: headers || [],
      sampleRows: sampleRows || [],
      headRows: headRows || [],
      tailRows: tailRows || [],
      sheetNames: sheetNames || [],
      totalRows: totalRows,
      pdfFullText: pdfFullText,
      rawAllRows: rawAllRows,
      apiKey,
    })

    return NextResponse.json({ success: true, data: result })
  } catch (err: any) {
    console.error('AI analyze error:', err)
    return NextResponse.json(
      { success: false, message: err.message || 'AI 分析失败' },
      { status: 500 }
    )
  }
}
