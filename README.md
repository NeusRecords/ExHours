# ExHours - Gestion de Horas Extras

<p align="center">
  <strong>Registro, aprobacion y liquidacion operativa de horas extras</strong>
</p>

<p align="center">
  <a href="https://github.com/NeusRecords/ExHours"><img src="https://img.shields.io/badge/NeusRecords-ExHours-e66b45?style=for-the-badge" alt="NeusRecords ExHours"></a>
  <img src="https://img.shields.io/badge/Node.js-18%2B-3c873a?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js 18+"></a>
  <img src="https://img.shields.io/badge/Express-5-17212b?style=for-the-badge&logo=express&logoColor=white" alt="Express 5">
  <img src="https://img.shields.io/badge/SQLite-local-003b57?style=for-the-badge&logo=sqlite&logoColor=white" alt="SQLite">
</p>

ExHours es una aplicacion web para registrar, revisar y exportar horas extras. Centraliza el flujo entre empleados y supervisores, calcula automaticamente la jornada diurna/nocturna y clasifica los recargos aplicables segun las reglas configuradas para Colombia.

> La aplicacion esta pensada para operar localmente con Node.js, Express y SQLite. Antes de usarla en produccion, configura secretos, HTTPS, copias de seguridad y los controles de identidad de tu organizacion.

## Caracteristicas

- Registro de solicitudes mediante cedula, fecha, hora de inicio, hora de fin y motivo.
- Validacion contra un directorio de empleados autorizados.
- Gestion de empleados por supervisor: alta, edicion, asignacion de supervisor y eliminacion.
- Deteccion automatica de domingos y festivos colombianos.
- Desglose de horas diurnas y nocturnas usando 06:00-19:00 y 19:00-06:00.
- Clasificacion de turnos mixtos con detalle legible.
- Evidencias opcionales en PDF, JPG, JPEG o PNG hasta 5 MB.
- Bandeja de supervisor con filtros por fechas y empleado.
- Revision con comentario obligatorio: aprobar o rechazar.
- Edicion y eliminacion protegida de solicitudes.
- Exportacion CSV compatible con Excel en espanol, con BOM UTF-8 y separador `;`.

## Clasificacion de recargos

| Concepto | Franja | Recargo |
| --- | --- | ---: |
| Extra Diurna | 06:00 a 19:00, dia habil | 25% |
| Extra Nocturna | 19:00 a 06:00, dia habil | 75% |
| Extra Diurna Dominical / Festiva | 06:00 a 19:00, domingo o festivo | 100% |
| Extra Nocturna Dominical / Festiva | 19:00 a 06:00, domingo o festivo | 150% |

Los rangos mixtos se guardan como `Mixta (Xh Diurna / Yh Nocturna)` y conservan el recargo de la franja predominante en la fila principal. El desglose completo queda disponible en `horas_diurnas`, `horas_nocturnas` y en el reporte.

## Flujo de uso

### Empleado

1. Introduce la cedula registrada.
2. El sistema valida y completa el nombre autorizado.
3. Selecciona fecha, hora de inicio, hora de fin y motivo.
4. Adjunta evidencia si aplica.
5. Consulta el historial y los comentarios del supervisor.

### Supervisor

1. Entra desde **Acceso Supervisor**.
2. Usa el PIN configurado.
3. Autoriza empleados desde **Registrar Nuevo Empleado**.
4. Filtra y revisa solicitudes pendientes, aprobadas o rechazadas.
5. Deja un comentario y aprueba o rechaza.
6. Exporta el reporte CSV con los filtros activos.

## Stack tecnologico

- **Backend:** Node.js, Express 5.
- **Persistencia:** SQLite mediante `sqlite3`.
- **Subidas:** `multer`, almacenamiento local en `public/uploads/`.
- **Autenticacion:** JWT en cookie `HttpOnly` y token Bearer de respaldo.
- **Frontend:** HTML, CSS y JavaScript nativo.

## Estructura del proyecto

```text
ExHours/
├── config/
│   └── database.js
├── controllers/
│   ├── authController.js
│   ├── employeeController.js
│   └── overtimeController.js
├── middleware/
│   ├── authMiddleware.js
│   └── uploadMiddleware.js
├── public/
│   ├── uploads/
│   ├── app.js
│   ├── index.html
│   └── styles.css
├── routes/
│   ├── authRoutes.js
│   ├── employeeRoutes.js
│   └── overtimeRoutes.js
├── data/
│   └── overtime.sqlite
├── .env.example
├── package.json
├── package-lock.json
└── server.js
```

## Instalacion y ejecucion

Requisitos: Node.js 18 o superior y npm.

```bash
git clone https://github.com/NeusRecords/ExHours.git
cd ExHours
npm install
```

Copia `.env.example` como `.env` y configura los valores:

```env
PORT=3000
SUPERVISOR_PIN=1234
JWT_SECRET=cambia-esta-clave-en-produccion
```

Inicia la aplicacion:

```bash
npm start
```

Para desarrollo:

```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000).

## API principal

### Autenticacion

- `POST /api/auth/login`: iniciar sesion con `{ "pin": "..." }`.
- `POST /api/auth/logout`: cerrar sesion.

### Empleados

- `POST /api/employees`: autorizar empleado. Requiere supervisor.
- `GET /api/employees`: listar empleados autorizados. Requiere supervisor.
- `GET /api/employees/search?cc=...`: validar una cedula.
- `PUT /api/employees/:id`: editar empleado. Requiere supervisor.
- `DELETE /api/employees/:id`: eliminar empleado. Requiere supervisor.

### Solicitudes

- `POST /api/overtime`: crear solicitud como `multipart/form-data`.
- `GET /api/overtime?cedula=...`: consultar historial por cedula.
- `GET /api/overtime/supervisor/requests`: consultar solicitudes filtrables. Requiere supervisor.
- `GET /api/overtime/supervisor/pending`: consultar solo pendientes. Requiere supervisor.
- `PATCH /api/overtime/:id/review`: aprobar o rechazar con comentario. Requiere supervisor.
- `PUT /api/overtime/:id`: editar una solicitud. Requiere supervisor.
- `DELETE /api/overtime/:id`: eliminar una solicitud. Requiere supervisor.
- `GET /api/overtime/export`: exportar aprobadas en CSV. Requiere supervisor.

Los filtros opcionales para Supervisor y CSV son `desde`, `hasta` y `empleado`.

## Seguridad y datos locales

- No subas `.env`, `data/*.sqlite` ni archivos de `public/uploads/`.
- Cambia `SUPERVISOR_PIN` y `JWT_SECRET` antes de cualquier despliegue.
- Las evidencias se sirven localmente desde `/uploads/<archivo>`.
- La autorizacion del empleado se valida en backend, no solo en el navegador.
- Para un entorno real, considera almacenamiento privado de evidencias, HTTPS, control de acceso por usuarios y auditoria.

## Estado del proyecto

Version inicial funcional para registro, autorizacion, revision y exportacion de horas extras.

## Autor

Desarrollado y mantenido por [NeusRecords](https://github.com/NeusRecords).

**NeusRecords - ExHours**
