const jwt = require('jsonwebtoken');

const authCookie = 'supervisor_token';
const jwtSecret = process.env.JWT_SECRET || 'exhours-dev-secret';

function login(req, res) {
  const { pin } = req.body;
  if (!pin || pin !== (process.env.SUPERVISOR_PIN || '1234')) {
    return res.status(401).json({ error: 'PIN incorrecto' });
  }

  const token = jwt.sign({ role: 'supervisor' }, jwtSecret, { expiresIn: '2h' });
  const secureFlag = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${authCookie}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Max-Age=7200${secureFlag}`);
  res.json({ authenticated: true, token });
}

function logout(req, res) {
  const secureFlag = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${authCookie}=; HttpOnly; SameSite=Strict; Max-Age=0${secureFlag}`);
  res.json({ authenticated: false });
}

function session(req, res) {
  res.json({ authenticated: Boolean(req.supervisor) });
}

module.exports = { authCookie, jwtSecret, login, logout, session };