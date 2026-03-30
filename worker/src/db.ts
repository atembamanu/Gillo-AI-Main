import pg from 'pg';
import { config } from './config';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.postgresUrl
});

export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
  const result = await pool.query(text, params);
  return result.rows as T[];
}

