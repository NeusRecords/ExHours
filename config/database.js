const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const dataDirectory = path.join(__dirname, '..', 'data');
const databasePath = path.join(dataDirectory, 'overtime.sqlite');

fs.mkdirSync(dataDirectory, { recursive: true });
const database = new sqlite3.Database(databasePath);

database.runAsync = function runAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    this.run(sql, params, function onRun(error) {
      if (error) reject(error);
      else resolve(this);
    });
  });
};

database.allAsync = function allAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    this.all(sql, params, (error, rows) => {
      if (error) reject(error);
      else resolve(rows);
    });
  });
};

async function initializeDatabase() {
  await database.runAsync(`
    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cedula TEXT UNIQUE NOT NULL,
      nombre_completo TEXT NOT NULL,
      supervisor_nombre TEXT,
      creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  const employeeColumns = await database.allAsync('PRAGMA table_info(employees)');
  if (!employeeColumns.some((column) => column.name === 'supervisor_nombre')) {
    await database.runAsync('ALTER TABLE employees ADD COLUMN supervisor_nombre TEXT');
  }
  const existingSchema = await database.allAsync(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'overtime_requests'"
  );

  if (existingSchema[0]?.sql.includes("'pending'") || existingSchema[0]?.sql.includes("'approved'")) {
    await database.runAsync('ALTER TABLE overtime_requests RENAME TO overtime_requests_legacy');
    await createRequestsTable();
    await database.runAsync(`
      INSERT INTO overtime_requests (id, employee_name, work_date, hours, reason, status, created_at, reviewed_at)
      SELECT id, employee_name, work_date, hours, reason,
        CASE status WHEN 'approved' THEN 'APROBADO' WHEN 'rejected' THEN 'RECHAZADO' ELSE 'PENDIENTE' END,
        created_at, reviewed_at
      FROM overtime_requests_legacy
    `);
    await database.runAsync('DROP TABLE overtime_requests_legacy');
    return;
  }

  await createRequestsTable();
}

async function createRequestsTable() {
  await database.runAsync(`
    CREATE TABLE IF NOT EXISTS overtime_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_name TEXT NOT NULL,
      work_date TEXT NOT NULL,
      hours REAL NOT NULL CHECK (hours > 0 AND hours <= 24),
      hora_inicio TEXT,
      hora_fin TEXT,
      total_horas REAL,
      horas_diurnas REAL,
      horas_nocturnas REAL,
      tipo_hora TEXT,
      porcentaje_recargo REAL,
      evidencia_url TEXT,
      cedula TEXT,
      es_festivo INTEGER NOT NULL DEFAULT 0,
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK (status IN ('PENDIENTE', 'APROBADO', 'RECHAZADO')),
      review_comment TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      reviewed_at TEXT
    )
  `);

  const columns = await database.allAsync('PRAGMA table_info(overtime_requests)');
  const columnNames = new Set(columns.map((column) => column.name));
  const additions = [
    ['hora_inicio', 'TEXT'],
    ['hora_fin', 'TEXT'],
    ['total_horas', 'REAL'],
    ['horas_diurnas', 'REAL'],
    ['horas_nocturnas', 'REAL'],
    ['tipo_hora', 'TEXT'],
    ['porcentaje_recargo', 'REAL'],
    ['evidencia_url', 'TEXT'],
    ['cedula', 'TEXT'],
    ['es_festivo', 'INTEGER NOT NULL DEFAULT 0'],
  ];
  for (const [name, type] of additions) {
    if (!columnNames.has(name)) await database.runAsync(`ALTER TABLE overtime_requests ADD COLUMN ${name} ${type}`);
  }
  await database.runAsync('UPDATE overtime_requests SET total_horas = hours WHERE total_horas IS NULL');
  await database.runAsync('UPDATE overtime_requests SET horas_diurnas = total_horas WHERE horas_diurnas IS NULL AND total_horas IS NOT NULL');
  await database.runAsync('UPDATE overtime_requests SET horas_nocturnas = 0 WHERE horas_nocturnas IS NULL AND total_horas IS NOT NULL');
  await database.runAsync(`
    UPDATE overtime_requests SET tipo_hora = CASE tipo_hora
      WHEN 'HED' THEN 'Extra Diurna'
      WHEN 'HEN' THEN 'Extra Nocturna'
      WHEN 'HEDD' THEN 'Extra Diurna Dominical / Festiva'
      WHEN 'HEND' THEN 'Extra Nocturna Dominical / Festiva'
      ELSE tipo_hora
    END
    WHERE tipo_hora IN ('HED', 'HEN', 'HEDD', 'HEND')
  `);
}

module.exports = { database, initializeDatabase };
