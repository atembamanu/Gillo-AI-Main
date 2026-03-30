import pg from 'pg';
import { buildPgPoolConfig } from './postgresPoolConfig';

const { Pool } = pg;

export const pool = new Pool(buildPgPoolConfig());

export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
  const result = await pool.query(text, params);
  return result.rows as T[];
}

