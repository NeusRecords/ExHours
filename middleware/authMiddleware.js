const jwt = require('jsonwebtoken');
const { authCookie, jwtSecret } = require('../controllers/authController');

function getCookieValue(cookieHeader, name) {
  const cookie = cookieHeader?.split(';').map((value) => value.trim()).find((value) => value.startsWith(`${name}=`));
  return cookie ? decodeURIComponent(cookie.slice(name.length + 1)) : null;
}

function requireSupervisor(req, res, next) {
  const authorization = req.headers.authorization || '';
  const bearerToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : null;
  const token = bearerToken || getCookieValue(req.headers.cookie, authCookie);
  try {
    const payload = jwt.verify(token, jwtSecret);
    if (payload.role !== 'supervisor') throw new Error('Invalid role');
    req.supervisor = payload;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Autenticación de supervisor requerida' });
  }
}

module.exports = { requireSupervisor };