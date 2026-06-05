import { getSql } from '../lib/db'

async function initDb() {
  const sql = getSql()

  await sql`
    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      external_code VARCHAR(100),
      store_name VARCHAR(200),
      receiver_name VARCHAR(100),
      receiver_phone VARCHAR(50),
      receiver_address TEXT,
      sku_code VARCHAR(100) NOT NULL,
      sku_name VARCHAR(200) NOT NULL,
      sku_quantity NUMERIC(10,2) NOT NULL,
      sku_spec VARCHAR(200),
      remark TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `

  await sql`
    CREATE INDEX IF NOT EXISTS idx_orders_external_code ON orders(external_code)
  `

  await sql`
    CREATE INDEX IF NOT EXISTS idx_orders_receiver_name ON orders(receiver_name)
  `

  await sql`
    CREATE TABLE IF NOT EXISTS templates (
      id SERIAL PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      file_type VARCHAR(20) DEFAULT 'excel',
      operations JSONB DEFAULT '[]',
      field_mappings JSONB DEFAULT '{}',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `

  console.log('Database initialized successfully')
}

initDb().catch(console.error)
