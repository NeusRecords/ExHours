const XLSX = require('xlsx');
const { database } = require('../config/database');

function normalizeWorkDate(value) {
  if (!value && value !== '') return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }

  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const isoDate = trimmed.match(/^\d{4}-\d{2}-\d{2}T.*$/)
    ? trimmed.split('T')[0]
    : trimmed;

  return /^\d{4}-\d{2}-\d{2}$/.test(isoDate) ? isoDate : null;
}

function isValidDate(value) {
  const normalized = normalizeWorkDate(value);
  if (!normalized) return false;
  return !Number.isNaN(Date.parse(`${normalized}T00:00:00Z`));
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
  const normalizedDate = normalizeWorkDate(workDate);
  if (!normalizedDate) return null;

  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  if (start === null || end === null || start === end) return null;

  const durationMinutes = end > start ? end - start : 1440 - start + end;
  const [year, month, day] = normalizedDate.split('-').map(Number);
  const dateObj = new Date(year, month - 1, day);
  const isSunday = Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day) && dateObj.getDay() === 0;
  const isHolidayOrSunday = isSunday || esFestivoODomingo(normalizedDate);
  const toHours = (minutes) => Number((minutes / 60).toFixed(2));
  const dayStartMinutes = 6 * 60;
  const nightStartMinutes = 19 * 60;

  let hf = 0;
  let rnf = 0;
  let hefd = 0;
  let hefn = 0;
  let hed = 0;
  let hen = 0;
  let rn = 0;
  let porcentajeRecargo = 0;
  let tipoHora = 'Horas Extras';

  if (isHolidayOrSunday) {
    const ordinaryLimitMinutes = 8 * 60;
    let remainingOrdinary = Math.min(durationMinutes, ordinaryLimitMinutes);
    let cursor = start;
    let remaining = durationMinutes;

    while (remaining > 0) {
      const minuteOfDay = cursor % 1440;
      const isNightSegment = minuteOfDay >= nightStartMinutes || minuteOfDay < dayStartMinutes;
      const nextBoundary = minuteOfDay < dayStartMinutes ? dayStartMinutes : minuteOfDay < nightStartMinutes ? nightStartMinutes : 1440;
      const segmentMinutes = Math.min(remaining, nextBoundary - minuteOfDay);
      const assignedOrdinaryMinutes = Math.min(segmentMinutes, remainingOrdinary);
      const extraMinutes = segmentMinutes - assignedOrdinaryMinutes;

      if (assignedOrdinaryMinutes > 0) {
        hf += assignedOrdinaryMinutes;
        if (isNightSegment) {
          rnf += assignedOrdinaryMinutes;
        }
        remainingOrdinary -= assignedOrdinaryMinutes;
      }

      if (extraMinutes > 0) {
        if (isNightSegment) {
          hefn += extraMinutes;
        } else {
          hefd += extraMinutes;
        }
      }

      cursor += segmentMinutes;
      remaining -= segmentMinutes;
    }

    porcentajeRecargo = (hf * 90 + rnf * 35 + hefd * 116.25 + hefn * 168.75) / durationMinutes;
    tipoHora = hefd > 0 || hefn > 0 ? 'Jornada Ordinaria Dominical + Horas Extras Dominicales' : 'Jornada Ordinaria Dominical';
  } else {
    let cursor = start;
    let remaining = durationMinutes;

    while (remaining > 0) {
      const minuteOfDay = cursor % 1440;
      const isNightSegment = minuteOfDay >= nightStartMinutes || minuteOfDay < dayStartMinutes;
      const nextBoundary = minuteOfDay < dayStartMinutes ? dayStartMinutes : minuteOfDay < nightStartMinutes ? nightStartMinutes : 1440;
      const segmentMinutes = Math.min(remaining, nextBoundary - minuteOfDay);

      if (isNightSegment) {
        hen += segmentMinutes;
      } else {
        hed += segmentMinutes;
      }

      cursor += segmentMinutes;
      remaining -= segmentMinutes;
    }

    porcentajeRecargo = (hed * 25 + hen * 75) / durationMinutes;
    tipoHora = hed > 0 && hen > 0 ? 'Mixta' : 'Horas Extras';
  }

  const diurnalHours = Number(toHours(hed + hefd + hf));
  const nocturnalHours = Number(toHours(hen + hefn + rnf + rn));
  const base = {
    hf: Number(toHours(hf)),
    rnf: Number(toHours(rnf)),
    hefd: Number(toHours(hefd)),
    hefn: Number(toHours(hefn)),
    hed: Number(toHours(hed)),
    hen: Number(toHours(hen)),
    rn: Number(toHours(rn)),
    porcentajeRecargo: Number((porcentajeRecargo || 0).toFixed(2)),
    tipoHora: tipoHora || 'Horas Extras',
    totalHours: Number((durationMinutes / 60).toFixed(2)),
    diurnalHours,
    nocturnalHours,
    type: tipoHora || 'Horas Extras',
    detail: tipoHora || 'Horas Extras',
    surcharge: Number((porcentajeRecargo || 0).toFixed(2)),
    isHolidayOrSunday,
  };

  return {
    ...base,
    breakdown: base,
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
    porcentajeRecargo: Number(source.porcentajeRecargo ?? source.porcentaje_recargo ?? source.surcharge ?? 0),
    tipoHora: source.tipoHora ?? source.tipo_hora ?? source.type ?? 'Horas Extras',
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
    porcentaje_recargo: Number(request.porcentaje_recargo ?? request.porcentajeRecargo ?? officialBreakdown.porcentajeRecargo ?? 0),
    porcentajeRecargo: Number(request.porcentaje_recargo ?? request.porcentajeRecargo ?? officialBreakdown.porcentajeRecargo ?? 0),
    tipo_hora: request.tipo_hora ?? request.tipoHora ?? officialBreakdown.tipoHora ?? 'Horas Extras',
    tipoHora: request.tipo_hora ?? request.tipoHora ?? officialBreakdown.tipoHora ?? 'Horas Extras',
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
      const normalizedRequest = normalizeRequestBreakdown(request);
      const breakdown = normalizedRequest.breakdown || normalizedRequest;
      const safeNumber = (value) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
      };

      return {
        'Cédula': request.cedula || '',
        'Nombre Completo': request.nombre_completo || request.employee_name || request.nombre || '',
        'Fecha': normalizeWorkDate(request.work_date || request.fecha || '') || '',
        'Hora Inicio': request.hora_inicio || '',
        'Hora Fin': request.hora_fin || '',
        'Total Horas': safeNumber(request.total_horas ?? request.totalHours ?? breakdown.totalHours ?? 0),
        'Motivo': request.motivo || request.reason || '',
        'Estado': request.status || 'APROBADA',
        'HED': safeNumber(breakdown.hed ?? 0),
        'HEN': safeNumber(breakdown.hen ?? 0),
        'RN': safeNumber(breakdown.rn ?? 0),
        'RNF': safeNumber(breakdown.rnf ?? 0),
        'HF': safeNumber(breakdown.hf ?? 0),
        'HEFD': safeNumber(breakdown.hefd ?? 0),
        'HEFN': safeNumber(breakdown.hefn ?? 0),
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

async function exportConsolidatedRequests(req, res, next) {
  try {
    const { filters, params } = getRequestFilters(req.query);
    filters.unshift("LOWER(status) = 'aprobado'");
    const requests = await database.allAsync(
      `SELECT * FROM overtime_requests WHERE ${filters.join(' AND ')} ORDER BY employee_name ASC, cedula ASC`,
      params
    );
    const consolidatedMap = new Map();
    const safeNumber = (value) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    };

    requests.forEach((request) => {
      const normalizedRequest = normalizeRequestBreakdown(request);
      const breakdown = normalizedRequest.breakdown || normalizedRequest;
      const cedula = request.cedula || 'SIN_CEDULA';
      const current = consolidatedMap.get(cedula) || {
        'Cédula': cedula,
        'Nombre Completo': request.employee_name || request.nombre_completo || request.nombre || '',
        'Total Solicitudes': 0,
        'Total Horas': 0,
        HED: 0,
        HEN: 0,
        RN: 0,
        RNF: 0,
        HF: 0,
        HEFD: 0,
        HEFN: 0,
      };

      current['Total Solicitudes'] += 1;
      current['Total Horas'] += safeNumber(request.total_horas ?? request.totalHours ?? breakdown.totalHours);
      ['HED', 'HEN', 'RN', 'RNF', 'HF', 'HEFD', 'HEFN'].forEach((field) => {
        current[field] += safeNumber(breakdown[field.toLowerCase()]);
      });
      consolidatedMap.set(cedula, current);
    });

    const rowsForExcel = Array.from(consolidatedMap.values()).map((employee) => {
      const rounded = { ...employee };
      ['Total Horas', 'HED', 'HEN', 'RN', 'RNF', 'HF', 'HEFD', 'HEFN'].forEach((field) => {
        rounded[field] = Number(employee[field].toFixed(2));
      });
      return rounded;
    });
    const worksheet = XLSX.utils.json_to_sheet(rowsForExcel);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Consolidado');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=Consolidado_Horas_Extras.xlsx');
    return res.send(buffer);
  } catch (error) {
    console.error('Error al exportar consolidado:', error);
    return res.status(500).json({ error: 'Error al generar el consolidado en Excel' });
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

    const duplicate = await database.allAsync(
      'SELECT id FROM overtime_requests WHERE cedula = $1 AND work_date = $2 AND hora_inicio = $3 LIMIT 1',
      [cedula.trim(), workDate, horaInicio]
    );
    if (duplicate.length > 0) {
      return res.status(409).json({ error: 'Ya existe una solicitud registrada para este horario.' });
    }

    const totalHours = Number(schedule.totalHours ?? schedule.total_horas ?? 0);
    const diurnalHours = Number(schedule.diurnalHours ?? ((schedule.hed ?? 0) + (schedule.hefd ?? 0) + (schedule.hf ?? 0)));
    const nocturnalHours = Number(schedule.nocturnalHours ?? ((schedule.hen ?? 0) + (schedule.hefn ?? 0) + (schedule.rnf ?? 0) + (schedule.rn ?? 0)));
    const tipoHora = schedule.tipoHora || schedule.tipo_hora || schedule.type || 'Horas Extras';
    const porcentajeRecargo = Number(schedule.porcentajeRecargo ?? schedule.porcentaje_recargo ?? schedule.surcharge ?? 0);

    const result = await database.runAsync(
      `INSERT INTO overtime_requests (employee_name, cedula, work_date, hours, hora_inicio, hora_fin, total_horas, horas_diurnas, horas_nocturnas, tipo_hora, porcentaje_recargo, reason, evidencia_url, es_festivo)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING id`,
      [employee.nombre_completo, cedula.trim(), workDate, totalHours, horaInicio, horaFin, totalHours, diurnalHours, nocturnalHours, tipoHora, porcentajeRecargo, reason.trim(), req.file ? `/uploads/${req.file.filename}` : null, schedule.isHolidayOrSunday]
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
    const totalHours = Number(schedule.totalHours ?? schedule.total_horas ?? 0);
    const diurnalHours = Number(schedule.diurnalHours ?? ((schedule.hed ?? 0) + (schedule.hefd ?? 0) + (schedule.hf ?? 0)));
    const nocturnalHours = Number(schedule.nocturnalHours ?? ((schedule.hen ?? 0) + (schedule.hefn ?? 0) + (schedule.rnf ?? 0) + (schedule.rn ?? 0)));
    const tipoHora = schedule.tipoHora || schedule.tipo_hora || schedule.type || 'Horas Extras';
    const porcentajeRecargo = Number(schedule.porcentajeRecargo ?? schedule.porcentaje_recargo ?? schedule.surcharge ?? 0);

    await database.runAsync(
      `UPDATE overtime_requests SET employee_name = $1, cedula = $2, work_date = $3, hours = $4, hora_inicio = $5, hora_fin = $6, total_horas = $7, horas_diurnas = $8, horas_nocturnas = $9, tipo_hora = $10, porcentaje_recargo = $11, reason = $12, status = $13, review_comment = $14, reviewed_at = CASE WHEN $15 = 'PENDIENTE' THEN NULL ELSE COALESCE(reviewed_at, CURRENT_TIMESTAMP) END WHERE id = $16`,
      [employee.nombre_completo, cedula, workDate, totalHours, horaInicio, horaFin, totalHours, diurnalHours, nocturnalHours, tipoHora, porcentajeRecargo, reason, status, reviewComment, status, req.params.id]
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

module.exports = { listRequests, listPendingRequests, listSupervisorRequests, exportApprovedRequests, exportConsolidatedRequests, createRequest, reviewRequest, updateRequest, deleteRequest, esFestivoODomingo, classifySchedule };
