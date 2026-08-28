const { database } = require('../config/database');

async function createEmployee(req, res, next) {
  const cedula = req.body?.cedula?.trim();
  const nombreCompleto = req.body?.nombre_completo?.trim();
  const supervisorNombre = req.body?.supervisor_nombre?.trim() || null;
  if (!cedula || !nombreCompleto) return res.status(400).json({ error: 'Cédula y nombre completo son obligatorios' });
  try {
    const result = await database.runAsync(
      'INSERT INTO employees (cedula, nombre_completo, supervisor_nombre) VALUES (?, ?, ?)',
      [cedula, nombreCompleto, supervisorNombre]
    );
    const [employee] = await database.allAsync('SELECT * FROM employees WHERE id = ?', [result.lastID]);
    res.status(201).json(employee);
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT') return res.status(409).json({ error: 'La cédula ya está registrada' });
    next(error);
  }
}

async function updateEmployee(req, res, next) {
  const cedula = req.body?.cedula?.trim();
  const nombreCompleto = req.body?.nombre_completo?.trim();
  const supervisorNombre = req.body?.supervisor_nombre?.trim() || null;
  if (!cedula || !nombreCompleto) return res.status(400).json({ error: 'Cédula y nombre completo son obligatorios' });
  try {
    const result = await database.runAsync(
      'UPDATE employees SET cedula = ?, nombre_completo = ?, supervisor_nombre = ? WHERE id = ?',
      [cedula, nombreCompleto, supervisorNombre, req.params.id]
    );
    if (!result.changes) return res.status(404).json({ error: 'Empleado no encontrado' });
    const [employee] = await database.allAsync('SELECT * FROM employees WHERE id = ?', [req.params.id]);
    res.json(employee);
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT') return res.status(409).json({ error: 'La cédula ya está registrada' });
    next(error);
  }
}

async function deleteEmployee(req, res, next) {
  try {
    const result = await database.runAsync('DELETE FROM employees WHERE id = ?', [req.params.id]);
    if (!result.changes) return res.status(404).json({ error: 'Empleado no encontrado' });
    res.status(204).send();
  } catch (error) { next(error); }
}

async function listEmployees(req, res, next) {
  try {
    res.json(await database.allAsync('SELECT * FROM employees ORDER BY nombre_completo ASC'));
  } catch (error) { next(error); }
}

async function searchEmployee(req, res, next) {
  const cedula = req.query.cc?.trim();
  if (!cedula) return res.status(400).json({ error: 'La cédula es obligatoria' });
  try {
    const [employee] = await database.allAsync('SELECT id, cedula, nombre_completo FROM employees WHERE cedula = ?', [cedula]);
    if (!employee) return res.status(404).json({ error: 'La cédula no está registrada en el sistema. Solicite registro a su supervisor.' });
    res.json(employee);
  } catch (error) { next(error); }
}

module.exports = { createEmployee, listEmployees, searchEmployee, updateEmployee, deleteEmployee };