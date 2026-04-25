import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

export default pool;

export type QueryParam = string | number | boolean | null;
export type QueryParams = QueryParam[];

export async function query(text: string, params?: QueryParams) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('Executed query', { text: text.slice(0, 80), duration, rows: res.rowCount });
    return res;
  } catch (error) {
    console.error('Query error', { text: text.slice(0, 80), error });
    throw error;
  }
}

export async function testConnection() {
  try {
    const result = await query('SELECT NOW()');
    return { connected: true, timestamp: result.rows[0].now };
  } catch (error) {
    return { connected: false, error: (error as Error).message };
  }
}
