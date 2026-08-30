const { database } = require('../config/database');

function isValidDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function timeToMinutes(value) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

function easterSunday(year) {
  const century = Math.floor(year / 100);
  const yearRemainder = year % 19;
  const solarCorrection = Math.floor((century - 15) / 3);
  const lunarCorrection = (19 * yearRemainder + century - Math.floor(century / 4) - solarCorrection + 15) % 30;
  const weekdayCorrection = (32 + 2 * (century % 4) + 2 * Math.floor(year % 100 / 4) - lunarCorrection - (year % 100)) % 7;
  const month = Math.floor((lunarCorrection + weekdayCorrection + 90) / 25);
  const day = (lunarCorrection + weekdayCorrection + month + 19) % 32;
  return new Date(Date.UTC(year, month - 1, day));
}

function dateKey(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function colombianHolidays(year) {
  const holidays = new Set(['01-01', '05-01', '07-20', '08-07', '12-08', '12-25'].map((monthDay) => `${year}-${monthDay}`));
  const easter = easterSunday(year);
  [
    [-3, 'Jueves Santo'],
    [-2, 'Viernes Santo'],
    [39, 'Ascension'],
    [60, 'Corpus Christi'],
    [68, 'Sagrado Corazon'],
  ].forEach(([offset]) => holidays.add(dateKey(addDays(easter, offset))));

  ['01-06', '03-19', '06-29', '08-15', '10-12', '11-01', '11-11'].forEach((monthDay) => {
    const holiday = new Date(`${year}-${monthDay}T00:00:00Z`);
    const dayOfWeek = holiday.getUTCDay();
    const monday = addDays(holiday, (8 - dayOfWeek) % 7);
    holidays.add(dateKey(monday));
  });
  return holidays;
}

function esFestivoODomingo(fechaStr) {
  if (!isValidDate(fechaStr)) return false;
  const fecha = new Date(`${fechaStr}T00:00:00Z`);
  return fecha.getUTCDay() === 0 || colombianHolidays(Number(fechaStr.slice(0, 4))).has(fechaStr);
}

function classifySchedule(workDate, startTime, endTime) {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  if (start === null || end === null || start === end) return null;
  const durationMinutes = end > start ? end - start : 1440 - start + end;
  const isHolidayOrSunday = esFestivoODomingo(workDate);
  const segments = [];
  let remaining = durationMinutes;
  let cursor = start;
  while (remaining > 0) {
    const minuteOfDay = cursor % 1440;
      const query = cedula
        ? 'SELECT * FROM overtime_requests WHERE cedula = $1 ORDER BY work_date DESC, created_at DESC'
        : 'SELECT * FROM overtime_requests ORDER BY work_date DESC, created_at DESC';
    segments.push({ minutes: segmentMinutes, isNight });
    cursor += segmentMinutes;
    remaining -= segmentMinutes;
  }
  const diurnalMinutes = segments.filter((segment) => !segment.isNight).reduce((total, segment) => total + segment.minutes, 0);
  const nocturnalMinutes = segments.filter((segment) => segment.isNight).reduce((total, segment) => total + segment.minutes, 0);
  const diurnalHours = Number((diurnalMinutes / 60).toFixed(2));
  const nocturnalHours = Number((nocturnalMinutes / 60).toFixed(2));
  const isMixed = diurnalMinutes > 0 && nocturnalMinutes > 0;
  const isDominicalOrHoliday = isHolidayOrSunday;
  const daySuffix = isDominicalOrHoliday ? ' Dominical / Festiva' : '';
  const dominantIsNight = nocturnalMinutes > diurnalMinutes;
  const type = isMixed
    ? `Mixta (${diurnalHours}h Diurna / ${nocturnalHours}h Nocturna)`
    : `Extra ${dominantIsNight ? 'Nocturna' : 'Diurna'}${daySuffix}`;
  const detail = isMixed
    ? `${diurnalHours}h Extra Diurna${daySuffix}, ${nocturnalHours}h Extra Nocturna${daySuffix}`
    : type;
  const surcharge = dominantIsNight
    ? (isDominicalOrHoliday ? 150 : 75)
    : (isDominicalOrHoliday ? 100 : 25);
  return { totalHours: Number((durationMinutes / 60).toFixed(2)), diurnalHours, nocturnalHours, type, detail, surcharge, isHolidayOrSunday };
  if (query.desde && isValidDate(query.desde)) {
    filters.push(`work_date >= $${params.length + 1}`);
    params.push(query.desde);
  }
  if (query.hasta && isValidDate(query.hasta)) {
    filters.push(`work_date <= $${params.length + 1}`);
    params.push(query.hasta);
  }
  if (query.empleado?.trim()) {
    filters.push(`LOWER(employee_name) LIKE LOWER('%' || $${params.length + 1} || '%')`);
    params.push(query.empleado.trim());
  }
  return { filters, params };
}

async function listRequests(req, res, next) {
  try {
    const cedula = req.query.cedula?.trim();
    const query = cedula
      ? 'SELECT * FROM overtime_requests WHERE cedula = $1 ORDER BY work_date DESC, created_at DESC'
      : 'SELECT * FROM overtime_requests ORDER BY work_date DESC, created_at DESC';
    const params = cedula ? [cedula] : [];
    const requests = await database.allAsync(
      query,
      params
    );
    res.json(requests);
  } catch (error) {
    next(error);
  }
}

async function listPendingRequests(req, res, next) {
  try {
    const { filters, params } = getRequestFilters(req.query);
    filters.unshift("status = 'PENDIENTE'");
    const requests = await database.allAsync(
      `SELECT * FROM overtime_requests WHERE ${filters.join(' AND ')} ORDER BY work_date ASC, created_at ASC`,
      params
    );
    res.json(requests);
  } catch (error) {
    next(error);
  }
}

async function listSupervisorRequests(req, res, next) {
  try {
    const { filters, params } = getRequestFilters(req.query);
    const requests = await database.allAsync(
      `SELECT * FROM overtime_requests${filters.length ? ` WHERE ${filters.join(' AND ')}` : ''} ORDER BY work_date DESC, created_at DESC`,
      params
    );
    res.json(requests);
  } catch (error) {
    next(error);
  }
}

function csvValue(value, sanitize = false) {
  const normalizedValue = value == null ? '' : String(value);
  const safeValue = sanitize
    ? normalizedValue.replace(/[\r\n]+/g, ' ').replace(/;/g, ',')
    : normalizedValue;
  return `"${safeValue.replace(/"/g, '""')}"`;
}

function scheduleDetail(request) {
  if (request.tipo_hora?.startsWith('Mixta')) {
    return `${request.horas_diurnas}h Extra Diurna, ${request.horas_nocturnas}h Extra Nocturna`;
  }
  return request.tipo_hora || '';
}

async function exportApprovedRequests(req, res, next) {
  try {
    const { filters, params } = getRequestFilters(req.query);
    filters.unshift("LOWER(status) = 'aprobado'");
    const requests = await database.allAsync(
      `SELECT employee_name, work_date, hora_inicio, hora_fin, total_horas, horas_diurnas, horas_nocturnas, tipo_hora, porcentaje_recargo, reason, status, review_comment, evidencia_url, es_festivo, created_at FROM overtime_requests WHERE ${filters.join(' AND ')} ORDER BY work_date DESC, created_at DESC`,
      params
    );
    const headers = ['Empleado', 'Fecha', 'Horario (Inicio - Fin)', 'Total Horas', 'Horas Diurnas', 'Horas Nocturnas', 'Tipo de Hora', 'Detalle / Tipo de Hora', '% Recargo', 'Motivo', 'Estado', 'Comentario Supervisor', 'Evidencia', 'Festivo/Domingo', 'Fecha de Creacion'];
    const rows = requests.map((request) => [
      request.employee_name,
      request.work_date,
      `${request.hora_inicio || ''} - ${request.hora_fin || ''}`,
      request.total_horas ?? request.hours,
      request.horas_diurnas ?? '',
      request.horas_nocturnas ?? '',
      scheduleDetail(request),
      request.tipo_hora,
      request.porcentaje_recargo == null ? '' : `${request.porcentaje_recargo}%`,
      request.reason,
      request.status,
      request.review_comment,
      request.evidencia_url,
      request.es_festivo ? 'SI' : 'NO',
      request.created_at,
    ]);
    const csv = [headers, ...rows].map((row) => row.map((value, index) => csvValue(value, index === 9 || index === 11)).join(';')).join('\r\n');

    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename=horas_extras_aprobadas.csv',
    });
    res.send(`\uFEFF${csv}\r\n`);
  } catch (error) {
    next(error);
  }
}

async function createRequest(req, res, next) {
  const { cedula, workDate, horaInicio, horaFin, reason } = req.body || {};
  const schedule = isValidDate(workDate) ? classifySchedule(workDate, horaInicio, horaFin) : null;

  if (!cedula?.trim() || !isValidDate(workDate) || !schedule || schedule.totalHours <= 0 || schedule.totalHours > 24 || !reason?.trim()) {
    return res.status(400).json({ error: 'Cédula, fecha, hora de inicio, hora de fin y motivo son obligatorios y válidos' });
  }

  try {
    const [employee] = await database.allAsync('SELECT nombre_completo FROM employees WHERE cedula = $1', [cedula.trim()]);
    if (!employee) return res.status(403).json({ error: 'La cédula no está registrada en el sistema. Solicite registro a su supervisor.' });
    const result = await database.runAsync(
      `INSERT INTO overtime_requests (employee_name, cedula, work_date, hours, hora_inicio, hora_fin, total_horas, horas_diurnas, horas_nocturnas, tipo_hora, porcentaje_recargo, reason, evidencia_url, es_festivo)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING id`,
      [employee.nombre_completo, cedula.trim(), workDate, schedule.totalHours, horaInicio, horaFin, schedule.totalHours, schedule.diurnalHours, schedule.nocturnalHours, schedule.type, schedule.surcharge, reason.trim(), req.file ? `/uploads/${req.file.filename}` : null, schedule.isHolidayOrSunday]
    );
    const [request] = await database.allAsync('SELECT * FROM overtime_requests WHERE id = $1', [result.lastID]);
    res.status(201).json(request);
  } catch (error) {
    next(error);
  }
}

async function reviewRequest(req, res, next) {
  const { status, comment } = req.body;
  if (!['APROBADO', 'RECHAZADO'].includes(status)) {
    return res.status(400).json({ error: 'El estado debe ser APROBADO o RECHAZADO' });
  }
  if (!comment?.trim() || comment.trim().length > 500) {
    return res.status(400).json({ error: 'El comentario de revisión es obligatorio (máximo 500 caracteres)' });
  }

  try {
    const result = await database.runAsync(
      "UPDATE overtime_requests SET status = $1, review_comment = $2, reviewed_at = CURRENT_TIMESTAMP WHERE id = $3 AND status = 'PENDIENTE'",
      [status, comment.trim(), req.params.id]
    );
    if (!result.changes) return res.status(404).json({ error: 'Solicitud pendiente no encontrada' });
    const [request] = await database.allAsync('SELECT * FROM overtime_requests WHERE id = $1', [req.params.id]);
    res.json(request);
  } catch (error) {
    next(error);
  }
}

async function updateRequest(req, res, next) {
  try {
    const [current] = await database.allAsync('SELECT * FROM overtime_requests WHERE id = $1', [req.params.id]);
    if (!current) return res.status(404).json({ error: 'Solicitud no encontrada' });
    const cedula = (req.body?.cedula || current.cedula || '').trim();
    const workDate = req.body?.workDate || current.work_date;
    const horaInicio = req.body?.horaInicio || current.hora_inicio;
    const horaFin = req.body?.horaFin || current.hora_fin;
    const reason = (req.body?.reason || current.reason).trim();
    const status = req.body?.status || current.status;
    const schedule = isValidDate(workDate) ? classifySchedule(workDate, horaInicio, horaFin) : null;
    if (!cedula || !schedule || !reason || !['PENDIENTE', 'APROBADO', 'RECHAZADO'].includes(status)) {
      return res.status(400).json({ error: 'Cédula, fecha, horarios, motivo y estado son obligatorios y válidos' });
    }
    const [employee] = await database.allAsync('SELECT nombre_completo FROM employees WHERE cedula = $1', [cedula]);
    if (!employee) return res.status(403).json({ error: 'La cédula no está registrada en el sistema' });
    const reviewComment = req.body?.review_comment?.trim() || (status === current.status ? current.review_comment : null);
    await database.runAsync(
      `UPDATE overtime_requests SET employee_name = $1, cedula = $2, work_date = $3, hours = $4, hora_inicio = $5, hora_fin = $6, total_horas = $7, horas_diurnas = $8, horas_nocturnas = $9, tipo_hora = $10, porcentaje_recargo = $11, reason = $12, status = $13, review_comment = $14, reviewed_at = CASE WHEN $15 = 'PENDIENTE' THEN NULL ELSE COALESCE(reviewed_at, CURRENT_TIMESTAMP) END WHERE id = $16`,
      [employee.nombre_completo, cedula, workDate, schedule.totalHours, horaInicio, horaFin, schedule.totalHours, schedule.diurnalHours, schedule.nocturnalHours, schedule.type, schedule.surcharge, reason, status, reviewComment, status, req.params.id]
    );
    const [request] = await database.allAsync('SELECT * FROM overtime_requests WHERE id = $1', [req.params.id]);
    res.json(request);
  } catch (error) { next(error); }
}

async function deleteRequest(req, res, next) {
  try {
    const result = await database.runAsync('DELETE FROM overtime_requests WHERE id = $1', [req.params.id]);
    if (!result.changes) return res.status(404).json({ error: 'Solicitud no encontrada' });
    res.status(204).send();
  } catch (error) { next(error); }
}

module.exports = { listRequests, listPendingRequests, listSupervisorRequests, exportApprovedRequests, createRequest, reviewRequest, updateRequest, deleteRequest, esFestivoODomingo };
