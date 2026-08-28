const express = require('express');
const { login, logout, session } = require('../controllers/authController');
const { requireSupervisor } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/login', login);
router.post('/logout', logout);
router.get('/session', (req, res, next) => {
  try {
    requireSupervisor(req, res, next);
  } catch (error) {
    next(error);
  }
}, session);

module.exports = router;