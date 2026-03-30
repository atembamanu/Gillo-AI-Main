import pg from 'pg';

const { Pool } = pg;

const connectionString =
  process.env.POSTGRES_URL ||
  'postgres://postgres:postgres@localhost:5432/notes';

export const pool = new Pool({
  connectionString
});

export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
  const result = await pool.query(text, params);
  return result.rows as T[];
}

