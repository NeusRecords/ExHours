# ExHours

Aplicación web para registrar y aprobar horas extra con Node.js, Express y SQLite.

## Estructura

- `server.js`: arranque de Express y middleware global.
- `config/database.js`: conexión e inicialización del esquema SQLite, incluidos horarios y recargos.
- `controllers/`: lógica de negocio y validaciones.
- `routes/`: endpoints HTTP.
- `middleware/authMiddleware.js`: protección de las operaciones de supervisor.
- `public/`: frontend estático.
- `public/uploads/`: evidencias adjuntas (JPG, JPEG, PNG o PDF), servidas mediante `/uploads`.
- `employees`: empleados autorizados por el supervisor; las solicitudes nuevas se asocian mediante `cedula`.
- `data/`: base de datos local, ignorada por Git.

## Ejecutar

```bash
npm install
npm start
```

Abrir `http://localhost:3000`. Para desarrollo usar `npm run dev`.

El acceso de supervisor usa `SUPERVISOR_PIN` del archivo `.env` (por defecto `1234` en desarrollo) y una cookie JWT `HttpOnly`. En producción se debe definir también un `JWT_SECRET` fuerte y cambiar el PIN.

### API

- `GET /api/overtime`: listar solicitudes.
- `POST /api/overtime`: crear una solicitud `multipart/form-data` con `employeeName`, `workDate`, `horaInicio`, `horaFin`, `reason` y el archivo opcional `evidencia`. Se permiten JPG, JPEG, PNG o PDF hasta 5 MB. El backend calcula `total_horas`, `tipo_hora` y `porcentaje_recargo`.
- `GET /api/overtime/supervisor/pending`: listar pendientes; requiere sesión de supervisor. Acepta `desde`, `hasta` y `empleado` como filtros opcionales.
- `GET /api/overtime/supervisor/requests`: consultar solicitudes de cualquier estado en el panel Supervisor; requiere sesión y acepta `desde`, `hasta` y `empleado`.
- `PATCH /api/overtime/:id/review`: guardar `status` (`APROBADO` o `RECHAZADO`) y `comment`; requiere sesión de supervisor.
- `GET /api/overtime/export`: exportar las aprobadas con horario, tipo CST y recargo en CSV; requiere sesión de supervisor y acepta los mismos filtros `desde`, `hasta` y `empleado`.
- `POST /api/employees`: autorizar un empleado con `cedula` y `nombre_completo`; requiere sesión de supervisor.
- `GET /api/employees`: listar empleados autorizados; requiere sesión de supervisor.
- `GET /api/employees/search?cc=...`: buscar una cédula para validar el registro antes de crear una solicitud.
- `PUT /api/employees/:id`: editar cédula, nombre y supervisor asignado; requiere sesión de supervisor.
- `DELETE /api/employees/:id`: eliminar un empleado del directorio; requiere sesión de supervisor.
- `PUT /api/overtime/:id`: editar cédula, fecha, horario, motivo o estado de una solicitud; requiere sesión de supervisor.
- `DELETE /api/overtime/:id`: eliminar una solicitud; requiere sesión de supervisor.

Los festivos colombianos se calculan localmente con fechas fijas, festivos trasladables según la Ley Emiliani y fechas móviles relacionadas con Pascua/Semana Santa. Las solicitudes recibidas en domingo o festivo guardan `es_festivo = 1` y aplican los recargos dominicales/festivos.
- `POST /api/auth/login`: autenticar con `{ "pin": "..." }`.
- `POST /api/auth/logout`: cerrar la sesión de supervisor.

La clasificación usa jornada diurna de 06:00 a 19:00 y nocturna de 19:00 a 06:00. El sistema guarda `horas_diurnas` y `horas_nocturnas`; en un rango mixto `tipo_hora` queda como `Mixta (Xh Diurna / Yh Nocturna)` y el detalle muestra cada concepto por separado. Los porcentajes son `Extra Diurna` 25%, `Extra Nocturna` 75%, `Extra Diurna Dominical / Festiva` 100% y `Extra Nocturna Dominical / Festiva` 150%. Para una solicitud mixta se conserva el recargo de la franja predominante, dado que cada fila tiene un único porcentaje en el esquema actual.
