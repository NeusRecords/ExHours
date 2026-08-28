const express = require('express');
const { createEmployee, listEmployees, searchEmployee, updateEmployee, deleteEmployee } = require('../controllers/employeeController');
const { requireSupervisor } = require('../middleware/authMiddleware');

const router = express.Router();
router.post('/', requireSupervisor, createEmployee);
router.get('/', requireSupervisor, listEmployees);
router.get('/search', searchEmployee);
router.put('/:id', requireSupervisor, updateEmployee);
router.delete('/:id', requireSupervisor, deleteEmployee);
module.exports = router;