import { NextRequest, NextResponse } from 'next/server'
import { getSql } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const sql = getSql()
    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const size = Math.max(1, Math.min(200, parseInt(searchParams.get('size') || '10')))
    const offset = (page - 1) * size

    const externalCode = searchParams.get('externalCode')
    const receiverName = searchParams.get('receiverName')

    let whereClause = ''
    const params: any[] = []
    let paramIdx = 1

    if (externalCode) {
      whereClause += ` AND external_code ILIKE $${paramIdx++}`
      params.push(`%${externalCode}%`)
    }
    if (receiverName) {
      whereClause += ` AND receiver_name ILIKE $${paramIdx++}`
      params.push(`%${receiverName}%`)
    }

    const countResult = await sql.query(`SELECT COUNT(*)::int AS total FROM orders WHERE 1=1 ${whereClause}`, params)
    const total = countResult[0].total

    const result = await sql.query(
      `SELECT id, external_code, store_name, receiver_name, receiver_phone, receiver_address, sku_code, sku_name, sku_quantity, sku_spec, remark, to_char(created_at, 'YYYY-MM-DD HH24:MI:SS') as created_at FROM orders WHERE 1=1 ${whereClause} ORDER BY id DESC LIMIT $${paramIdx++} OFFSET $${paramIdx}`,
      [...params, size, offset]
    )

    return NextResponse.json({ success: true, data: result, pagination: { page, size, total } })
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const sql = getSql()
    const body = await request.json()
    const orders = body.orders || []

    if (!Array.isArray(orders) || orders.length === 0) {
      return NextResponse.json({ success: false, message: '导入数据不能为空' }, { status: 400 })
    }

    const codesToCheck = orders.filter((o: any) => o.externalCode).map((o: any) => o.externalCode)
    let existingCodes = new Set()
    if (codesToCheck.length > 0) {
      const existing = await sql`SELECT external_code FROM orders WHERE external_code = ANY(${codesToCheck})`
      existingCodes = new Set(existing.map((r: any) => r.external_code))
    }

    const validOrders = orders.filter((o: any) => !o.externalCode || !existingCodes.has(o.externalCode))

    let imported = 0
    const insertBatchSize = 200
    for (let i = 0; i < validOrders.length; i += insertBatchSize) {
      const batch = validOrders.slice(i, i + insertBatchSize)
      const placeholders = batch.map((_: any, idx: number) => {
        const base = idx * 11
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11})`
      }).join(', ')

      const params = batch.flatMap((o: any) => [
        o.externalCode || null, o.storeName || null, o.receiverName || null,
        o.receiverPhone || null, o.receiverAddress || null,
        o.skuCode, o.skuName, o.skuQuantity, o.skuSpec || null, o.remark || null,
        new Date().toISOString(),
      ])

      await sql.query(
        `INSERT INTO orders (external_code, store_name, receiver_name, receiver_phone, receiver_address, sku_code, sku_name, sku_quantity, sku_spec, remark, created_at) VALUES ${placeholders}`,
        params
      )
      imported += batch.length
    }

    return NextResponse.json({ success: true, message: `成功导入 ${imported} 条数据` })
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 })
  }
}
