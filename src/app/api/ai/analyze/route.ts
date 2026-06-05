import { NextRequest, NextResponse } from 'next/server'
import { analyzeFileWithAI } from '@/lib/ai-service'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { fileName, headers, sampleRows, apiKey } = body

    if (!apiKey) {
      return NextResponse.json({ success: false, message: '请先配置 DeepSeek API Key' }, { status: 400 })
    }

    const result = await analyzeFileWithAI(fileName, headers, sampleRows, apiKey)
    return NextResponse.json({ success: true, data: result })
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 })
  }
}
