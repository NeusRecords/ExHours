const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL es obligatoria para conectar con PostgreSQL');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

pool.runAsync = async function runAsync(text, values = []) {
  const result = await this.query(text, values);
  return {
    ...result,
    lastID: result.rows[0]?.id,
    changes: result.rowCount,
  };
};

pool.allAsync = async function allAsync(text, values = []) {
  const result = await this.query(text, values);
  return result.rows;
};

async function initializeDatabase() {
  await pool.runAsync(`
    CREATE TABLE IF NOT EXISTS employees (
      id SERIAL PRIMARY KEY,
      cedula TEXT UNIQUE NOT NULL,
      nombre_completo TEXT NOT NULL,
      supervisor_nombre TEXT,
      creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.runAsync(`
    CREATE TABLE IF NOT EXISTS overtime_requests (
      id SERIAL PRIMARY KEY,
      employee_name TEXT NOT NULL,
      work_date DATE NOT NULL,
      hours NUMERIC(5, 2) NOT NULL CHECK (hours > 0 AND hours <= 24),
      hora_inicio TEXT,
      hora_fin TEXT,
      total_horas NUMERIC(5, 2),
      horas_diurnas NUMERIC(5, 2),
      horas_nocturnas NUMERIC(5, 2),
      tipo_hora TEXT,
      porcentaje_recargo NUMERIC(5, 2),
      evidencia_url TEXT,
      cedula TEXT,
      es_festivo BOOLEAN NOT NULL DEFAULT FALSE,
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK (status IN ('PENDIENTE', 'APROBADO', 'RECHAZADO')),
      review_comment TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      reviewed_at TIMESTAMP
    )
  `);

  await pool.runAsync('ALTER TABLE overtime_requests ADD COLUMN IF NOT EXISTS rn NUMERIC(5, 2) NOT NULL DEFAULT 0');
}

module.exports = { database: pool, initializeDatabase };
