// Database connection (Neon PostgreSQL Serverless)
// The user will set DATABASE_URL in environment variables

let _sql: any = null

async function getDb() {
  if (_sql) return _sql

  const { neon } = await import('@neondatabase/serverless')
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error('DATABASE_URL environment variable is not set. Please configure your database connection.')
  }
  _sql = neon(url)
  return _sql
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getSql(): Promise<any> {
  if (!_sql) {
    await getDb()
  }
  return _sql
}

export { getDb }
