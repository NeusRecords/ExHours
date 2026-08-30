const form = document.querySelector('#overtime-form');
const employeeList = document.querySelector('#employee-list');
const pendingList = document.querySelector('#pending-list');
const message = document.querySelector('#form-message');
const loginModal = document.querySelector('#login-modal');
const loginForm = document.querySelector('#login-form');
const loginMessage = document.querySelector('#login-message');
const supervisorFilters = document.querySelector('#supervisor-filters');
const filterStatus = document.querySelector('#filter-status');
const filterButton = supervisorFilters.querySelector('button[type="submit"]');
const employeeForm = document.querySelector('#employee-form');
const employeeMessage = document.querySelector('#employee-message');
const employeesList = document.querySelector('#employees-list');
const requestEditForm = document.querySelector('#request-edit-form');
const employeeEditForm = document.querySelector('#employee-edit-form');
const requestModal = document.querySelector('#request-modal');
const employeeModal = document.querySelector('#employee-modal');
const requestEditMessage = document.querySelector('#request-edit-message');
const employeeEditMessage = document.querySelector('#employee-edit-message');
const requestCache = new Map();
const employeeCache = new Map();
const statusLabels = { PENDIENTE: 'Pendiente', APROBADO: 'Aprobada', RECHAZADO: 'Rechazada' };

function supervisorHeaders() {
  const token = sessionStorage.getItem('supervisor_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function activeFilterQuery() {
  const query = new URLSearchParams();
  const data = new FormData(supervisorFilters);
  for (const [name, value] of data) {
    if (String(value).trim()) query.set(name, String(value).trim());
  }
  return query.toString();
}

async function fetchRequests(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('No se pudieron cargar las solicitudes');
  return response.json();
}

async function loadEmployeeHistory() {
  const cedula = form.elements.cedula.value.trim();
  if (!cedula) {
    employeeList.innerHTML = '<p class="empty-state">Escribe tu cédula para consultar tu historial.</p>';
    return;
  }
  const requests = await fetchRequests(`/api/overtime?cedula=${encodeURIComponent(cedula)}`);
  employeeList.innerHTML = requests.length ? requests.map(renderEmployeeRequest).join('') : '<p class="empty-state">No tienes solicitudes registradas.</p>';
}

async function validateEmployee() {
  const cedula = form.elements.cedula.value.trim();
  const nameField = form.elements.employeeName;
  nameField.value = '';
  if (!cedula) return;
  const response = await fetch(`/api/employees/search?cc=${encodeURIComponent(cedula)}`);
  if (!response.ok) throw new Error('La cédula no está registrada en el sistema. Solicite registro a su supervisor.');
  const employee = await response.json();
  nameField.value = employee.nombre_completo;
  await loadEmployeeHistory();
}

function formatDateValue(value) {
  if (!value) return '';
  const dateString = String(value).trim();
  if (!dateString) return '';
  return dateString.includes('T') ? dateString.split('T')[0] : dateString.substring(0, 10);
}

function formatPercentage(value) {
  if (value == null || value === '') return '0%';
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return '0%';
  return Number.isInteger(numericValue)
    ? `${numericValue}%`
    : `${Number(numericValue.toFixed(2)).toString()}%`;
}

function formatFilterDate(value) {
  if (!value) return '';
  return value.split('-').reverse().join('/');
}

function showFilterStatus(requestCount) {
  const data = Object.fromEntries(new FormData(supervisorFilters));
  const selectedRange = data.desde && data.hasta
    ? ` entre ${formatFilterDate(data.desde)} y ${formatFilterDate(data.hasta)}`
    : data.desde
      ? ` desde ${formatFilterDate(data.desde)}`
      : data.hasta
        ? ` hasta ${formatFilterDate(data.hasta)}`
        : '';
  const employee = data.empleado?.trim() ? ` para "${data.empleado.trim()}"` : '';
  filterStatus.textContent = requestCount
    ? `Filtro aplicado: ${requestCount} solicitud${requestCount === 1 ? '' : 'es'} encontrada${requestCount === 1 ? '' : 's'}${selectedRange}${employee}.`
    : 'No se encontraron solicitudes para los filtros seleccionados.';
  filterStatus.classList.toggle('empty', requestCount === 0);
  filterStatus.hidden = false;
}

async function loadPendingRequests({ announce = false } = {}) {
  const query = activeFilterQuery();
  const response = await fetch(`/api/overtime/supervisor/requests${query ? `?${query}` : ''}`, { credentials: 'include', headers: supervisorHeaders() });
  if (response.status === 401) return showEmployeeView();
  if (!response.ok) throw new Error('No se pudieron cargar las solicitudes pendientes');
  const requests = await response.json();
  requests.forEach((request) => requestCache.set(String(request.id), request));
  pendingList.innerHTML = requests.length ? requests.map(renderPendingRequest).join('') : '<p class="empty-state">No se encontraron solicitudes para el rango seleccionado.</p>';
  if (announce) showFilterStatus(requests.length);
}

async function exportApprovedRequests() {
  const query = activeFilterQuery();
  const response = await fetch(`/api/overtime/export${query ? `?${query}` : ''}`, { credentials: 'include', headers: supervisorHeaders() });
  if (response.status === 401) {
    showEmployeeView();
    throw new Error('La sesión de supervisor ha expirado');
  }
  if (!response.ok) throw new Error('No se pudo generar el reporte CSV');

  const csvBlob = await response.blob();
  const downloadUrl = URL.createObjectURL(csvBlob);
  const downloadLink = document.createElement('a');
  downloadLink.href = downloadUrl;
  downloadLink.download = 'horas_extras_aprobadas.csv';
  document.body.appendChild(downloadLink);
  downloadLink.click();
  downloadLink.remove();
  URL.revokeObjectURL(downloadUrl);
}

function showEmployeeView() {
  document.querySelector('#supervisor-view').hidden = true;
  document.querySelector('#employee-view').hidden = false;
}

function showSupervisorView() {
  document.querySelector('#employee-view').hidden = true;
  document.querySelector('#supervisor-view').hidden = false;
  loadPendingRequests().catch((error) => { pendingList.innerHTML = `<p class="empty-state">${error.message}</p>`; });
  loadEmployees();
}

async function loadEmployees() {
  const response = await fetch('/api/employees', { credentials: 'include', headers: supervisorHeaders() });
  if (!response.ok) return;
  const employees = await response.json();
  employeeCache.clear();
  employees.forEach((employee) => employeeCache.set(String(employee.id), employee));
  employeesList.innerHTML = employees.length
    ? employees.map((employee) => `<p class="employee-row"><span><strong>${escapeHtml(employee.nombre_completo)}</strong><small>CC ${escapeHtml(employee.cedula)} · Supervisor: ${escapeHtml(employee.supervisor_nombre || 'Sin asignar')}</small></span><span class="row-actions"><button class="action-link" data-edit-employee="${employee.id}" type="button">Editar</button><button class="action-link danger-link" data-delete-employee="${employee.id}" type="button">Eliminar</button></span></p>`).join('')
    : '<p class="empty-state">No hay empleados autorizados.</p>';
}

function getScheduleBreakdown(request) {
  const ordinaryDominicalHours = Number(request.ordinaryDominicalHours ?? request.ordinary_dominical_hours ?? request.ordinary_dominical ?? 0);
  const ordinaryNocturnalHours = Number(request.ordinaryNocturnalHours ?? request.ordinary_nocturnal_hours ?? 0);
  const extraDiurnaDominicalHours = Number(request.extraDiurnaDominicalHours ?? request.extra_diurna_dominical_hours ?? 0);
  const extraNocturnaDominicalHours = Number(request.extraNocturnaDominicalHours ?? request.extra_nocturna_dominical_hours ?? 0);
  const totalHours = Number(request.total_horas ?? request.hours ?? 0);

  if (request.es_festivo || ordinaryDominicalHours > 0 || extraDiurnaDominicalHours > 0 || extraNocturnaDominicalHours > 0) {
    const ordinaryText = `Total: ${totalHours || Number((ordinaryDominicalHours + extraDiurnaDominicalHours + extraNocturnaDominicalHours).toFixed(2))} h · Ordinaria Dominical: ${ordinaryDominicalHours.toFixed(2)} h${ordinaryNocturnalHours > 0 ? `, recargo dominical (${ordinaryNocturnalHours.toFixed(2)} h)` : ''}`;
    const extras = [];
    if (extraDiurnaDominicalHours > 0) extras.push(`${extraDiurnaDominicalHours.toFixed(2)} h (Diurna 116.25%)`);
    if (extraNocturnaDominicalHours > 0) extras.push(`${extraNocturnaDominicalHours.toFixed(2)} h (Nocturna 168.75%)`);
    const extraText = extras.length ? `Extras Dominicales: ${extras.join(' · ')}` : '';
    return extraText ? `${ordinaryText} · ${extraText}` : ordinaryText;
  }

  return `${request.horas_diurnas ?? 0}h diurnas · ${request.horas_nocturnas ?? 0}h nocturnas`;
}

function renderEmployeeRequest(request) {
  const evidence = request.evidencia_url ? `<a class="evidence-link" href="${escapeHtml(request.evidencia_url)}" target="_blank" rel="noopener">Ver evidencia</a>` : '';
  const holidayBadge = request.es_festivo ? '<span class="holiday-badge">Festivo/Domingo</span>' : '';
  const workDate = formatDateValue(request.work_date);
  const surcharge = formatPercentage(request.porcentaje_recargo);
  const scheduleBreakdown = getScheduleBreakdown(request);
  return `<article class="request"><div><p class="request-title">${escapeHtml(workDate)} · ${request.total_horas ?? request.hours} h ${holidayBadge}</p><p class="request-meta">${escapeHtml(request.hora_inicio || '--:--')} - ${escapeHtml(request.hora_fin || '--:--')} · ${escapeHtml(scheduleBreakdown)}</p><p class="request-meta">Detalle / Tipo de Hora: <strong>${escapeHtml(request.tipo_hora || 'Sin clasificar')}</strong> · ${surcharge}</p><p class="request-reason">${escapeHtml(request.reason)}</p>${request.review_comment ? `<p class="review-comment"><strong>Comentario del supervisor:</strong> ${escapeHtml(request.review_comment)}</p>` : ''}${evidence}</div><span class="badge ${request.status.toLowerCase()}">${statusLabels[request.status]}</span></article>`;
}

function renderPendingRequest(request) {
  requestCache.set(String(request.id), request);
  const reviewForm = request.status === 'PENDIENTE'
    ? `<form class="review-form" data-id="${request.id}"><label>Comentario de revisión<textarea name="comment" rows="2" maxlength="500" required placeholder="Escribe el motivo de tu decisión"></textarea></label><div class="review-actions"><button type="submit" data-status="APROBADO">Aprobar</button><button class="reject-button" type="submit" data-status="RECHAZADO">Rechazar</button></div></form>`
    : `<span class="badge ${request.status.toLowerCase()}">${statusLabels[request.status]}</span>${request.review_comment ? `<p class="review-comment"><strong>Comentario:</strong> ${escapeHtml(request.review_comment)}</p>` : ''}`;
  const detail = request.tipo_hora?.startsWith('Mixta')
    ? `${request.horas_diurnas}h Extra Diurna, ${request.horas_nocturnas}h Extra Nocturna`
    : request.tipo_hora || 'Sin clasificar';
  const evidence = request.evidencia_url ? `<a class="evidence-link" href="${escapeHtml(request.evidencia_url)}" target="_blank" rel="noopener">Ver evidencia</a>` : '';
  const holidayBadge = request.es_festivo ? '<span class="holiday-badge">Festivo/Domingo</span>' : '';
  const workDate = formatDateValue(request.work_date);
  const surcharge = formatPercentage(request.porcentaje_recargo);
  const scheduleBreakdown = getScheduleBreakdown(request);
  return `<article class="request supervisor-request"><div><p class="request-title">${escapeHtml(request.employee_name)} · ${escapeHtml(workDate)} ${holidayBadge}</p><p class="request-meta">Horario: ${escapeHtml(request.hora_inicio || '--:--')} - ${escapeHtml(request.hora_fin || '--:--')}</p><p class="request-meta">${escapeHtml(scheduleBreakdown)}</p><p class="request-meta">Detalle / Tipo de Hora: <strong>${escapeHtml(detail)}</strong> · Recargo: <strong>${surcharge}</strong></p><p class="request-reason">${escapeHtml(request.reason)}</p>${evidence}</div><div class="request-actions">${reviewForm}<div class="row-actions"><button class="action-link" data-edit-request="${request.id}" type="button">Editar</button><button class="action-link danger-link" data-delete-request="${request.id}" type="button">Eliminar</button></div></div></article>`;
}

function openRequestEditor(id) {
  const request = requestCache.get(String(id));
  if (!request) return;
  Object.entries({ id, cedula: request.cedula || '', workDate: formatDateValue(request.work_date), horaInicio: request.hora_inicio, horaFin: request.hora_fin, reason: request.reason, status: request.status }).forEach(([name, value]) => { requestEditForm.elements[name].value = value; });
  requestEditMessage.textContent = '';
  requestModal.showModal();
}

function openEmployeeEditor(id) {
  const employee = employeeCache.get(String(id));
  if (!employee) return;
  Object.entries(employee).forEach(([name, value]) => { if (employeeEditForm.elements[name]) employeeEditForm.elements[name].value = value || ''; });
  employeeEditMessage.textContent = '';
  employeeModal.showModal();
}

async function deleteRecord(url, messageTarget, reload) {
  if (!window.confirm('¿Estás seguro de eliminar este registro?')) return;
  const response = await fetch(url, { method: 'DELETE', credentials: 'include', headers: supervisorHeaders() });
  if (!response.ok) { const result = await response.json(); throw new Error(result.error || 'No se pudo eliminar'); }
  messageTarget.textContent = 'Registro eliminado correctamente.';
  await reload();
}

async function reviewRequest(id, status, comment) {
  const response = await fetch(`/api/overtime/${id}/review`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json', ...supervisorHeaders() }, body: JSON.stringify({ status, comment }) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  await Promise.all([loadPendingRequests(), loadEmployeeHistory()]);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  message.textContent = '';
  const data = new FormData(form);
  try {
    if (!form.elements.employeeName.value) throw new Error('La cédula no está registrada en el sistema. Solicite registro a su supervisor.');
    const response = await fetch('/api/overtime', { method: 'POST', body: data });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    message.textContent = 'Solicitud enviada correctamente.';
    await loadEmployeeHistory();
    form.elements.workDate.value = '';
    form.elements.horaInicio.value = '';
    form.elements.horaFin.value = '';
    form.elements.reason.value = '';
    form.elements.evidencia.value = '';
  } catch (error) { message.textContent = error.message; }
});

form.elements.cedula.addEventListener('change', () => validateEmployee().catch((error) => { message.textContent = error.message; }));
form.elements.cedula.addEventListener('blur', () => validateEmployee().catch((error) => { message.textContent = error.message; }));

document.querySelector('#employee-refresh').addEventListener('click', () => loadEmployeeHistory().catch((error) => { employeeList.innerHTML = `<p class="empty-state">${error.message}</p>`; }));
document.querySelector('#supervisor-refresh').addEventListener('click', () => loadPendingRequests().catch((error) => { pendingList.innerHTML = `<p class="empty-state">${error.message}</p>`; }));
document.querySelector('#export-csv').addEventListener('click', () => exportApprovedRequests().catch((error) => { message.textContent = error.message; }));
supervisorFilters.addEventListener('submit', async (event) => {
  event.preventDefault();
  filterButton.textContent = 'Filtrando...';
  filterButton.disabled = true;
  try {
    await loadPendingRequests({ announce: true });
  } catch (error) {
    pendingList.innerHTML = `<p class="empty-state">${error.message}</p>`;
    filterStatus.textContent = 'No fue posible aplicar los filtros.';
    filterStatus.classList.add('empty');
    filterStatus.hidden = false;
  } finally {
    filterButton.textContent = 'Filtrar';
    filterButton.disabled = false;
  }
});
document.querySelector('#clear-filters').addEventListener('click', () => {
  supervisorFilters.reset();
  filterStatus.textContent = '';
  filterStatus.hidden = true;
  filterStatus.classList.remove('empty');
  loadPendingRequests().catch((error) => { pendingList.innerHTML = `<p class="empty-state">${error.message}</p>`; });
});

employeeForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  employeeMessage.textContent = '';
  try {
    const response = await fetch('/api/employees', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', ...supervisorHeaders() }, body: JSON.stringify(Object.fromEntries(new FormData(employeeForm))) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    employeeForm.reset();
    employeeMessage.textContent = 'Empleado autorizado correctamente.';
    await loadEmployees();
  } catch (error) { employeeMessage.textContent = error.message; }
});

requestEditForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  requestEditMessage.textContent = '';
  try {
    const payload = Object.fromEntries(new FormData(requestEditForm));
    const response = await fetch(`/api/overtime/${payload.id}`, { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json', ...supervisorHeaders() }, body: JSON.stringify(payload) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    requestModal.close();
    await loadPendingRequests();
  } catch (error) { requestEditMessage.textContent = error.message; }
});

employeeEditForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  employeeEditMessage.textContent = '';
  try {
    const payload = Object.fromEntries(new FormData(employeeEditForm));
    const response = await fetch(`/api/employees/${payload.id}`, { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json', ...supervisorHeaders() }, body: JSON.stringify(payload) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    employeeModal.close();
    await loadEmployees();
  } catch (error) { employeeEditMessage.textContent = error.message; }
});

pendingList.addEventListener('click', (event) => {
  const editButton = event.target.closest('[data-edit-request]');
  const deleteButton = event.target.closest('[data-delete-request]');
  if (editButton) openRequestEditor(editButton.dataset.editRequest);
  if (deleteButton) deleteRecord(`/api/overtime/${deleteButton.dataset.deleteRequest}`, message, loadPendingRequests).catch((error) => { message.textContent = error.message; });
});

employeesList.addEventListener('click', (event) => {
  const editButton = event.target.closest('[data-edit-employee]');
  const deleteButton = event.target.closest('[data-delete-employee]');
  if (editButton) openEmployeeEditor(editButton.dataset.editEmployee);
  if (deleteButton) deleteRecord(`/api/employees/${deleteButton.dataset.deleteEmployee}`, employeeMessage, loadEmployees).catch((error) => { employeeMessage.textContent = error.message; });
});

document.querySelectorAll('[data-close-modal]').forEach((button) => button.addEventListener('click', () => document.querySelector(`#${button.dataset.closeModal}`).close()));

document.querySelector('#supervisor-login-link').addEventListener('click', () => { loginMessage.textContent = ''; loginForm.reset(); loginModal.showModal(); });
document.querySelector('#close-login').addEventListener('click', () => loginModal.close());
loginModal.addEventListener('click', (event) => { if (event.target === loginModal) loginModal.close(); });

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginMessage.textContent = '';
  try {
    const response = await fetch('/api/auth/login', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: loginForm.elements.pin.value }) });
    const result = await response.json();
    console.log('Respuesta de login del supervisor:', { status: response.status, body: result });
    if (response.status === 401) {
      loginMessage.textContent = 'Clave incorrecta';
      return;
    }
    if (response.status !== 200 && result.success !== true) {
      throw new Error(result.error || 'No se pudo iniciar sesión');
    }
    if (result.token) sessionStorage.setItem('supervisor_token', result.token);
    loginModal.close();
    showSupervisorView();
  } catch (error) {
    console.error('Error en el login del supervisor:', error);
    loginMessage.textContent = error.message || 'No se pudo iniciar sesión';
  }
});

document.querySelector('#supervisor-logout').addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'include', headers: supervisorHeaders() });
  sessionStorage.removeItem('supervisor_token');
  showEmployeeView();
});

pendingList.addEventListener('submit', async (event) => {
  event.preventDefault();
  const reviewForm = event.target;
  const status = event.submitter.dataset.status;
  try { await reviewRequest(reviewForm.dataset.id, status, reviewForm.elements.comment.value); }
  catch (error) { message.textContent = error.message; }
});

loadEmployeeHistory().catch(() => {});
