import { NextRequest, NextResponse } from 'next/server'
import { analyzeFileWithAI } from '@/lib/ai-service'
import { matchPresetRule } from '@/lib/preset-rules'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { fileName, headers, sampleRows, headRows, tailRows, sheetNames, totalRows, pdfFullText, apiKey, rawAllRows, rawAllSheets, usePresetRule } = body

    if (!apiKey) {
      return NextResponse.json({ success: false, message: '请先配置 DeepSeek API Key' }, { status: 400 })
    }

    // 优先使用 rawAllRows 或 rawAllSheets，headers 不再强制要求
    if (!rawAllRows && !rawAllSheets && (!headers || !Array.isArray(headers) || headers.length === 0)) {
      return NextResponse.json({ success: false, message: '缺少文件数据' }, { status: 400 })
    }

    // 尝试匹配预置规则
    const matchedRule = fileName ? matchPresetRule(fileName) : null
    if (matchedRule && usePresetRule !== false) {
      return NextResponse.json({
        success: true,
        data: {
          rule: matchedRule,
          explanation: `已自动匹配预置规则：${matchedRule.name}。规则详情：${matchedRule.description || '无'}`,
          isPreset: true,
        }
      })
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
      rawAllSheets: rawAllSheets,
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
