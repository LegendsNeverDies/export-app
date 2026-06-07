import { NextRequest, NextResponse } from 'next/server'
import { getSql } from '@/lib/db'

export async function POST(request: NextRequest) {
  try {
    const sql = await getSql()
    const { searchParams } = new URL(request.url)
    const force = searchParams.get('force') === 'true'

    if (force) {
      // 强制重建：先删除旧表
      await sql`DROP TABLE IF EXISTS orders CASCADE`
      await sql`DROP TABLE IF EXISTS templates CASCADE`
    }

    // 运单数据表
    await sql`
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        batch_id VARCHAR(50) NOT NULL,
        external_code VARCHAR(255),
        store_name VARCHAR(255),
        receiver_name VARCHAR(255),
        receiver_phone VARCHAR(50),
        receiver_address TEXT,
        sku_code VARCHAR(255) NOT NULL,
        sku_name VARCHAR(255) NOT NULL,
        sku_quantity NUMERIC(12,2) NOT NULL CHECK (sku_quantity > 0),
        sku_spec VARCHAR(255),
        remark TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `

    // 解析规则表
    await sql`
      CREATE TABLE IF NOT EXISTS templates (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        file_type VARCHAR(20) NOT NULL DEFAULT 'excel',
        data_region JSONB,
        operations JSONB NOT NULL DEFAULT '[]',
        field_mappings JSONB NOT NULL DEFAULT '{}',
        field_confidence JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `

    // 索引（IF NOT EXISTS 避免重复创建）
    await sql`CREATE INDEX IF NOT EXISTS idx_orders_batch_id ON orders(batch_id)`
    await sql`CREATE INDEX IF NOT EXISTS idx_orders_external_code ON orders(external_code)`
    await sql`CREATE INDEX IF NOT EXISTS idx_orders_receiver_name ON orders(receiver_name)`
    await sql`CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at)`
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_templates_name ON templates(name)`

    return NextResponse.json({ success: true, message: '数据库初始化成功' })
  } catch (err: any) {
    console.error('init-db error:', err)
    return NextResponse.json({ success: false, message: err.message }, { status: 500 })
  }
}
