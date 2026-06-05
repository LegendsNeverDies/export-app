import { NextRequest, NextResponse } from 'next/server'
import { getSql } from '@/lib/db'

export async function GET() {
  try {
    const sql = getSql()
    const result = await sql`SELECT id, name, file_type, operations, field_mappings, to_char(created_at, 'YYYY-MM-DD HH24:MI:SS') as created_at, to_char(updated_at, 'YYYY-MM-DD HH24:MI:SS') as updated_at FROM templates ORDER BY id DESC`
    return NextResponse.json({ success: true, data: result })
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const sql = getSql()
    const body = await request.json()
    const { name, fileType, operations, fieldMappings } = body

    if (!name || !operations || !fieldMappings) {
      return NextResponse.json({ success: false, message: '模板名称、操作和映射不能为空' }, { status: 400 })
    }

    const result = await sql`INSERT INTO templates (name, file_type, operations, field_mappings) VALUES (${name}, ${fileType || 'excel'}, ${JSON.stringify(operations)}, ${JSON.stringify(fieldMappings)}) RETURNING id, name, file_type, operations, field_mappings, to_char(created_at, 'YYYY-MM-DD HH24:MI:SS') as created_at`
    return NextResponse.json({ success: true, data: result[0] }, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 })
  }
}
