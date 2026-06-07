import { NextRequest, NextResponse } from 'next/server'
import { getSql } from '@/lib/db'

export async function GET() {
  try {
    const sql = await getSql()
    const result = await sql`
      SELECT id, name, description, file_type, data_region, operations, field_mappings, field_confidence,
        to_char(created_at, 'YYYY-MM-DD HH24:MI:SS') as created_at,
        to_char(updated_at, 'YYYY-MM-DD HH24:MI:SS') as updated_at
      FROM templates
      ORDER BY id DESC
    `
    return NextResponse.json({ success: true, data: result })
  } catch (err: any) {
    console.error('templates GET error:', err)
    return NextResponse.json({ success: false, message: err.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const sql = await getSql()
    const body = await request.json()
    const { name, description, fileType, dataRegion, operations, fieldMappings, fieldConfidence } = body

    if (!name || !operations || !fieldMappings) {
      return NextResponse.json(
        { success: false, message: '模板名称、操作和映射不能为空' },
        { status: 400 }
      )
    }

    const result = await sql`
      INSERT INTO templates (name, description, file_type, data_region, operations, field_mappings, field_confidence)
      VALUES (
        ${name},
        ${description || null},
        ${fileType || 'excel'},
        ${dataRegion ? JSON.stringify(dataRegion) : null},
        ${JSON.stringify(operations)},
        ${JSON.stringify(fieldMappings)},
        ${fieldConfidence ? JSON.stringify(fieldConfidence) : null}
      )
      RETURNING id, name, description, file_type, data_region, operations, field_mappings, field_confidence,
        to_char(created_at, 'YYYY-MM-DD HH24:MI:SS') as created_at
    `
    return NextResponse.json({ success: true, data: result[0] }, { status: 201 })
  } catch (err: any) {
    console.error('templates POST error:', err)
    // 唯一约束冲突
    if (err.message?.includes('unique') || err.message?.includes('duplicate')) {
      return NextResponse.json(
        { success: false, message: '规则名称已存在，请使用其他名称' },
        { status: 409 }
      )
    }
    return NextResponse.json({ success: false, message: err.message }, { status: 500 })
  }
}
