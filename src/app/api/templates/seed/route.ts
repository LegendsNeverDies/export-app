import { NextRequest, NextResponse } from 'next/server'
import { getSql } from '@/lib/db'
import { presetRules } from '@/lib/preset-rules'

/**
 * 初始化预置规则到数据库
 * POST /api/templates/seed
 */
export async function POST(request: NextRequest) {
  try {
    const sql = await getSql()

    // 获取已存在的规则名称
    const existingRules = await sql`
      SELECT name FROM templates WHERE name LIKE '【预置】%'
    `
    const existingNames = new Set(existingRules.map((r: { name: string }) => r.name))

    const results = []
    for (const [key, rule] of Object.entries(presetRules)) {
      const presetName = `【预置】${rule.name}`

      if (existingNames.has(presetName)) {
        results.push({ name: presetName, status: 'skipped', reason: '已存在' })
        continue
      }

      try {
        const result = await sql`
          INSERT INTO templates (name, description, file_type, data_region, operations, field_mappings, field_confidence)
          VALUES (
            ${presetName},
            ${rule.description || null},
            ${rule.fileType || 'excel'},
            ${rule.dataRegion ? JSON.stringify(rule.dataRegion) : null},
            ${JSON.stringify(rule.operations)},
            ${JSON.stringify(rule.fieldMappings)},
            ${rule.fieldConfidence ? JSON.stringify(rule.fieldConfidence) : null}
          )
          RETURNING id, name
        `
        results.push({ name: presetName, status: 'created', id: result[0].id })
      } catch (err: any) {
        if (err.message?.includes('unique') || err.message?.includes('duplicate')) {
          results.push({ name: presetName, status: 'skipped', reason: '已存在' })
        } else {
          results.push({ name: presetName, status: 'error', error: err.message })
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `成功创建 ${results.filter(r => r.status === 'created').length} 个预置规则`,
      details: results,
    })
  } catch (err: any) {
    console.error('seed templates error:', err)
    return NextResponse.json(
      { success: false, message: err.message || '初始化预置规则失败' },
      { status: 500 }
    )
  }
}
