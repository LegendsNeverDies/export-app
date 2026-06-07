import { NextRequest, NextResponse } from 'next/server'
import { getSql } from '@/lib/db'

export async function POST(request: NextRequest) {
  try {
    const sql = await getSql()
    const body = await request.json()
    const { codes } = body

    if (!Array.isArray(codes) || codes.length === 0) {
      return NextResponse.json({ success: true, data: [] })
    }

    const existing = await sql`SELECT external_code FROM orders WHERE external_code = ANY(${codes})`
    const existingCodes = existing.map((r: any) => r.external_code)

    return NextResponse.json({ success: true, data: existingCodes })
  } catch (err: any) {
    console.error('duplicate-check error:', err)
    return NextResponse.json({ success: false, message: err.message }, { status: 500 })
  }
}
