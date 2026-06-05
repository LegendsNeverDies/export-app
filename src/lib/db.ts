// Database connection placeholder
// Configure your actual database connection here (Neon PostgreSQL, etc.)
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
export function getSql(): any {
  if (!_sql) {
    throw new Error('Database not initialized. Call getDb() first in API routes.')
  }
  return _sql
}

export { getDb }
