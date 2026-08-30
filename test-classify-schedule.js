const { classifySchedule } = require('./controllers/overtimeController');

function assertEqual(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    console.error(`FAIL: ${label}`);
    console.error('Actual:', JSON.stringify(actual, null, 2));
    console.error('Expected:', JSON.stringify(expected, null, 2));
    process.exitCode = 1;
    return;
  }

  console.log(`PASS: ${label}`);
}

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://user:pass@localhost:5432/test';

const domingoCaso = classifySchedule('2026-08-30', '02:00', '20:00');
assertEqual('domingo 02:00-20:00', domingoCaso, {
  hf: 8,
  rnf: 4,
  hefd: 9,
  hefn: 1,
  hed: 0,
  hen: 0,
  rn: 0,
  porcentajeRecargo: 115.28,
  tipoHora: 'Jornada Ordinaria Dominical + Horas Extras Dominicales',
  totalHours: 18,
  diurnalHours: 17,
  nocturnalHours: 5,
  type: 'Jornada Ordinaria Dominical + Horas Extras Dominicales',
  detail: 'Jornada Ordinaria Dominical + Horas Extras Dominicales',
  surcharge: 115.28,
  isHolidayOrSunday: true,
  breakdown: {
    hf: 8,
    rnf: 4,
    hefd: 9,
    hefn: 1,
    hed: 0,
    hen: 0,
    rn: 0,
    porcentajeRecargo: 115.28,
    tipoHora: 'Jornada Ordinaria Dominical + Horas Extras Dominicales',
    totalHours: 18,
    diurnalHours: 17,
    nocturnalHours: 5,
    type: 'Jornada Ordinaria Dominical + Horas Extras Dominicales',
    detail: 'Jornada Ordinaria Dominical + Horas Extras Dominicales',
    surcharge: 115.28,
    isHolidayOrSunday: true,
  },
});

const domingoIsoCaso = classifySchedule('2026-08-30T00:00:00.000Z', '02:00', '20:00');
assertEqual('domingo ISO con hora', domingoIsoCaso, {
  hf: 8,
  rnf: 4,
  hefd: 9,
  hefn: 1,
  hed: 0,
  hen: 0,
  rn: 0,
  porcentajeRecargo: 115.28,
  tipoHora: 'Jornada Ordinaria Dominical + Horas Extras Dominicales',
  totalHours: 18,
  diurnalHours: 17,
  nocturnalHours: 5,
  type: 'Jornada Ordinaria Dominical + Horas Extras Dominicales',
  detail: 'Jornada Ordinaria Dominical + Horas Extras Dominicales',
  surcharge: 115.28,
  isHolidayOrSunday: true,
  breakdown: {
    hf: 8,
    rnf: 4,
    hefd: 9,
    hefn: 1,
    hed: 0,
    hen: 0,
    rn: 0,
    porcentajeRecargo: 115.28,
    tipoHora: 'Jornada Ordinaria Dominical + Horas Extras Dominicales',
    totalHours: 18,
    diurnalHours: 17,
    nocturnalHours: 5,
    type: 'Jornada Ordinaria Dominical + Horas Extras Dominicales',
    detail: 'Jornada Ordinaria Dominical + Horas Extras Dominicales',
    surcharge: 115.28,
    isHolidayOrSunday: true,
  },
});

const domingoDateObjectCaso = classifySchedule(new Date('2026-08-30T00:00:00Z'), '02:00', '20:00');
assertEqual('domingo Date object', domingoDateObjectCaso, {
  hf: 8,
  rnf: 4,
  hefd: 9,
  hefn: 1,
  hed: 0,
  hen: 0,
  rn: 0,
  porcentajeRecargo: 115.28,
  tipoHora: 'Jornada Ordinaria Dominical + Horas Extras Dominicales',
  totalHours: 18,
  diurnalHours: 17,
  nocturnalHours: 5,
  type: 'Jornada Ordinaria Dominical + Horas Extras Dominicales',
  detail: 'Jornada Ordinaria Dominical + Horas Extras Dominicales',
  surcharge: 115.28,
  isHolidayOrSunday: true,
  breakdown: {
    hf: 8,
    rnf: 4,
    hefd: 9,
    hefn: 1,
    hed: 0,
    hen: 0,
    rn: 0,
    porcentajeRecargo: 115.28,
    tipoHora: 'Jornada Ordinaria Dominical + Horas Extras Dominicales',
    totalHours: 18,
    diurnalHours: 17,
    nocturnalHours: 5,
    type: 'Jornada Ordinaria Dominical + Horas Extras Dominicales',
    detail: 'Jornada Ordinaria Dominical + Horas Extras Dominicales',
    surcharge: 115.28,
    isHolidayOrSunday: true,
  },
});

const ordinarioCaso = classifySchedule('2026-08-28', '20:00', '00:00');
assertEqual('ordinario 20:00-00:00', ordinarioCaso, {
  hf: 0,
  rnf: 0,
  hefd: 0,
  hefn: 0,
  hed: 0,
  hen: 4,
  rn: 4,
  porcentajeRecargo: 110,
  tipoHora: 'Mixta',
  totalHours: 4,
  diurnalHours: 0,
  nocturnalHours: 8,
  type: 'Mixta',
  detail: 'Mixta',
  surcharge: 110,
  isHolidayOrSunday: false,
  breakdown: {
    hf: 0,
    rnf: 0,
    hefd: 0,
    hefn: 0,
    hed: 0,
    hen: 4,
    rn: 4,
    porcentajeRecargo: 110,
    tipoHora: 'Mixta',
    totalHours: 4,
    diurnalHours: 0,
    nocturnalHours: 8,
    type: 'Mixta',
    detail: 'Mixta',
    surcharge: 110,
    isHolidayOrSunday: false,
  },
});

const casoDiurnoNocturno = classifySchedule('2026-08-19', '17:00', '22:00');
assertEqual('ordinario 17:00-22:00', casoDiurnoNocturno, {
  hf: 0,
  rnf: 0,
  hefd: 0,
  hefn: 0,
  hed: 2,
  hen: 3,
  rn: 3,
  porcentajeRecargo: 76,
  tipoHora: 'Mixta',
  totalHours: 5,
  diurnalHours: 2,
  nocturnalHours: 6,
  type: 'Mixta',
  detail: 'Mixta',
  surcharge: 76,
  isHolidayOrSunday: false,
  breakdown: {
    hf: 0,
    rnf: 0,
    hefd: 0,
    hefn: 0,
    hed: 2,
    hen: 3,
    rn: 3,
    porcentajeRecargo: 76,
    tipoHora: 'Mixta',
    totalHours: 5,
    diurnalHours: 2,
    nocturnalHours: 6,
    type: 'Mixta',
    detail: 'Mixta',
    surcharge: 76,
    isHolidayOrSunday: false,
  },
});

if (process.exitCode) {
  console.error('\nPruebas fallidas.');
} else {
  console.log('\nTodas las pruebas pasaron.');
}
