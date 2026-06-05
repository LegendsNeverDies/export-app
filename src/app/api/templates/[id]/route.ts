import { NextRequest, NextResponse } from 'next/server'
import { getSql } from '@/lib/db'

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sql = getSql()
    const { id } = await params
    const body = await request.json()
    const { name, fileType, operations, fieldMappings } = body

    const result = await sql`UPDATE templates SET name = COALESCE(${name || null}, name), file_type = COALESCE(${fileType || null}, file_type), operations = COALESCE(${operations ? JSON.stringify(operations) : null}, operations), field_mappings = COALESCE(${fieldMappings ? JSON.stringify(fieldMappings) : null}, field_mappings), updated_at = CURRENT_TIMESTAMP WHERE id = ${id} RETURNING id, name, file_type, operations, field_mappings, to_char(updated_at, 'YYYY-MM-DD HH24:MI:SS') as updated_at`

    if (result.length === 0) return NextResponse.json({ success: false, message: '模板不存在' }, { status: 404 })
    return NextResponse.json({ success: true, data: result[0] })
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sql = getSql()
    const { id } = await params
    const result = await sql`DELETE FROM templates WHERE id = ${id} RETURNING id`
    if (result.length === 0) return NextResponse.json({ success: false, message: '模板不存在' }, { status: 404 })
    return NextResponse.json({ success: true, message: '删除成功' })
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 })
  }
}
