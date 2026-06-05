import { NextRequest, NextResponse } from 'next/server'
import { parseFile } from '@/lib/parsers'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ success: false, message: '未找到文件' }, { status: 400 })
    }

    const result = await parseFile(file)
    return NextResponse.json({ success: true, data: result })
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 })
  }
}
