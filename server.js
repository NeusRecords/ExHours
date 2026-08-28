require('dotenv').config();

const express = require('express');
const path = require('path');
const { initializeDatabase } = require('./config/database');
const overtimeRoutes = require('./routes/overtimeRoutes');
const authRoutes = require('./routes/authRoutes');
const employeeRoutes = require('./routes/employeeRoutes');

const app = express();
const port = Number(process.env.PORT) || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api/auth', authRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/overtime', overtimeRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'exhours' });
});

app.use((error, req, res, next) => {
  if (error.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'La evidencia supera el límite de 5 MB' });
  }
  if (error.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({ error: 'Solo se permiten archivos JPG, JPEG, PNG o PDF' });
  }
  console.error(error);
  res.status(500).json({ error: 'Error interno del servidor' });
});

initializeDatabase()
  .then(() => {
    app.listen(port, () => {
      console.log(`ExHours escuchando en http://localhost:${port}`);
    });
  })
  .catch((error) => {
    console.error('No se pudo inicializar la base de datos:', error);
    process.exit(1);
  });

module.exports = app;
