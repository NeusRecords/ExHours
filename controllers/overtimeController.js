const XLSX = require('xlsx');
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

function classifySchedule(workDate, startTime, endTime, cedula = null) {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  if (start === null || end === null || start === end) return null;

  const durationMinutes = end > start ? end - start : 1440 - start + end;
  const isHolidayOrSunday = esFestivoODomingo(workDate);
  const toHours = (minutes) => Number((minutes / 60).toFixed(2));

  let hf = 0;
  let rnf = 0;
  let hefd = 0;
  let hefn = 0;
  let hed = 0;
  let hen = 0;
  let rn = 0;

  let cursor = start;
  let remaining = durationMinutes;
  let ordinaryBaseMinutesUsed = 0;

  while (remaining > 0) {
    const minuteOfDay = cursor % 1440;
    const isNightSegment = minuteOfDay >= 21 * 60 || minuteOfDay < 6 * 60;
    const nextBoundary = minuteOfDay < 6 * 60
      ? 6 * 60
      : minuteOfDay < 21 * 60
        ? 21 * 60
        : 24 * 60;
    const segmentMinutes = Math.min(remaining, nextBoundary - minuteOfDay);

    if (isHolidayOrSunday) {
      const availableOrdinaryMinutes = Math.max(0, 8 * 60 - ordinaryBaseMinutesUsed);
      const ordinaryMinutes = Math.min(segmentMinutes, availableOrdinaryMinutes);
      const extraMinutes = segmentMinutes - ordinaryMinutes;

      if (ordinaryMinutes > 0) {
        if (isNightSegment) {
          rnf += ordinaryMinutes;
        } else {
          hf += ordinaryMinutes;
        }
        ordinaryBaseMinutesUsed += ordinaryMinutes;
      }

      if (extraMinutes > 0) {
        if (isNightSegment) {
          hefn += extraMinutes;
        } else {
          hefd += extraMinutes;
        }
      }
    } else {
      if (isNightSegment) {
        hen += segmentMinutes;
        rn += segmentMinutes;
      } else {
        hed += segmentMinutes;
      }
    }

    cursor += segmentMinutes;
    remaining -= segmentMinutes;
  }

  const totalHours = toHours(durationMinutes);
  const breakdown = {
    hf: Number(toHours(hf)),
    rnf: Number(toHours(rnf)),
    hefd: Number(toHours(hefd)),
    hefn: Number(toHours(hefn)),
    hed: Number(toHours(hed)),
    hen: Number(toHours(hen)),
    rn: Number(toHours(rn)),
  };

  return {
    totalHours,
    isHolidayOrSunday,
    ...breakdown,
    breakdown,
  };
}

function getRequestFilters(query = {}) {
  const filters = [];
  const params = [];

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

  if (query.cedula?.trim()) {
    filters.push(`cedula = $${params.length + 1}`);
    params.push(query.cedula.trim());
  }

  if (query.status) {
    const normalizedStatus = String(query.status).trim().toUpperCase();
    if (['PENDIENTE', 'APROBADO', 'RECHAZADO'].includes(normalizedStatus)) {
      filters.push(`status = $${params.length + 1}`);
      params.push(normalizedStatus);
    }
  }

  return { filters, params };
}

function buildOfficialBreakdown(schedule) {
  const source = schedule && typeof schedule === 'object' && schedule.breakdown ? schedule.breakdown : (schedule || {});

  const breakdown = {
    hed: Number(source.hed ?? source.extraDiurnalHours ?? source.extra_diurnal_hours ?? 0),
    hen: Number(source.hen ?? source.extraNocturnalHours ?? source.extra_nocturnal_hours ?? 0),
    rn: Number(source.rn ?? source.nocturnalHours ?? source.horas_nocturnas ?? 0),
    rnf: Number(source.rnf ?? source.ordinaryNocturnalHours ?? source.ordinary_nocturnal_hours ?? 0),
    hf: Number(source.hf ?? source.ordinaryDominicalHours ?? source.ordinary_dominical_hours ?? source.ordinary_diurnal_hours ?? 0),
    hefd: Number(source.hefd ?? source.extraDiurnaDominicalHours ?? source.extra_diurna_dominical_hours ?? 0),
    hefn: Number(source.hefn ?? source.extraNocturnaDominicalHours ?? source.extra_nocturna_dominical_hours ?? 0),
  };

  if (source.isHolidayOrSunday || schedule?.isHolidayOrSunday) {
    const ordinaryDiurnal = Number(source.ordinaryDiurnalHours ?? source.ordinary_diurnal_hours ?? 0);
    const ordinaryNocturnal = Number(source.ordinaryNocturnalHours ?? source.ordinary_nocturnal_hours ?? 0);
    const extraDiurnal = Number(source.extraDiurnaDominicalHours ?? source.extra_diurna_dominical_hours ?? 0);
    const extraNocturnal = Number(source.extraNocturnaDominicalHours ?? source.extra_nocturna_dominical_hours ?? 0);
    breakdown.hed = Number(source.hed ?? 0);
    breakdown.hen = Number(source.hen ?? 0);
    breakdown.rn = Number(source.rn ?? 0);
    breakdown.rnf = Number(source.rnf ?? ordinaryNocturnal);
    breakdown.hf = Number(source.hf ?? ordinaryDiurnal);
    breakdown.hefd = Number(source.hefd ?? extraDiurnal);
    breakdown.hefn = Number(source.hefn ?? extraNocturnal);
  }

  return breakdown;
}

function normalizeRequestBreakdown(request) {
  if (!request || typeof request !== 'object') return request;

  const workDate = request.work_date ?? request.workDate ?? request.fecha ?? null;
  const startTime = request.hora_inicio ?? request.horaInicio ?? null;
  const endTime = request.hora_fin ?? request.horaFin ?? null;
  const cedula = request.cedula ?? null;

  const schedule = workDate && startTime && endTime && isValidDate(workDate)
    ? classifySchedule(workDate, startTime, endTime, cedula)
    : null;

  const source = schedule || {
    hed: request.hed ?? 0,
    hen: request.hen ?? 0,
    rn: request.rn ?? 0,
    rnf: request.rnf ?? 0,
    hf: request.hf ?? 0,
    hefd: request.hefd ?? 0,
    hefn: request.hefn ?? 0,
    isHolidayOrSunday: request.es_festivo || request.isHolidayOrSunday || false,
  };

  const officialBreakdown = buildOfficialBreakdown(source);

  return {
    ...request,
    breakdown: officialBreakdown,
    hed: officialBreakdown.hed,
    hen: officialBreakdown.hen,
    rn: officialBreakdown.rn,
    rnf: officialBreakdown.rnf,
    hf: officialBreakdown.hf,
    hefd: officialBreakdown.hefd,
    hefn: officialBreakdown.hefn,
  };
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
    res.json(requests.map((request) => normalizeRequestBreakdown(request)));
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
    res.json(requests.map((request) => normalizeRequestBreakdown(request)));
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
    res.json(requests.map((request) => normalizeRequestBreakdown(request)));
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
      `SELECT * FROM overtime_requests WHERE ${filters.join(' AND ')} ORDER BY work_date DESC, created_at DESC`,
      params
    );

    const rowsForExcel = requests.map((request) => {
      const b = classifySchedule(
        request.work_date || request.fecha,
        request.hora_inicio || request.horaInicio,
        request.hora_fin || request.horaFin,
        request.cedula
      ) || {
        hed: 0,
        hen: 0,
        rn: 0,
        rnf: 0,
        hf: 0,
        hefd: 0,
        hefn: 0,
      };

      return {
        'Cédula': request.cedula || '',
        'Nombre Completo': request.nombre_completo || request.employee_name || request.nombre || '',
        'Fecha': request.work_date ? new Date(request.work_date).toISOString().split('T')[0] : '',
        'Hora Inicio': request.hora_inicio || '',
        'Hora Fin': request.hora_fin || '',
        'Total Horas': parseFloat(request.total_horas || request.totalHours || 0),
        'Motivo': request.motivo || request.reason || '',
        'Estado': request.status || 'APROBADA',
        'HED': parseFloat(b.hed || 0),
        'HEN': parseFloat(b.hen || 0),
        'RN': parseFloat(b.rn || 0),
        'RNF': parseFloat(b.rnf || 0),
        'HF': parseFloat(b.hf || 0),
        'HEFD': parseFloat(b.hefd || 0),
        'HEFN': parseFloat(b.hefn || 0),
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(rowsForExcel);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Solicitudes');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=Horas_Extras.xlsx');
    return res.send(buffer);
  } catch (error) {
    console.error('Error al exportar Excel:', error);
    return res.status(500).json({ error: 'Error al generar el archivo Excel' });
  }
}

async function createRequest(req, res, next) {
  const { cedula, workDate, horaInicio, horaFin, reason } = req.body || {};
  const schedule = isValidDate(workDate) ? classifySchedule(workDate, horaInicio, horaFin, cedula) : null;

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
    res.status(201).json(normalizeRequestBreakdown(request));
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
    res.json(normalizeRequestBreakdown(request));
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
    const schedule = isValidDate(workDate) ? classifySchedule(workDate, horaInicio, horaFin, cedula) : null;
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
    res.json(normalizeRequestBreakdown(request));
  } catch (error) { next(error); }
}

async function deleteRequest(req, res, next) {
  try {
    const result = await database.runAsync('DELETE FROM overtime_requests WHERE id = $1', [req.params.id]);
    if (!result.changes) return res.status(404).json({ error: 'Solicitud no encontrada' });
    res.status(204).send();
  } catch (error) { next(error); }
}

module.exports = { listRequests, listPendingRequests, listSupervisorRequests, exportApprovedRequests, createRequest, reviewRequest, updateRequest, deleteRequest, esFestivoODomingo, classifySchedule };
