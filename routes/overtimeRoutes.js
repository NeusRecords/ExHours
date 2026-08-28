const express = require('express');
const {
  listRequests,
  listPendingRequests,
  listSupervisorRequests,
  exportApprovedRequests,
  createRequest,
  reviewRequest,
  updateRequest,
  deleteRequest,
} = require('../controllers/overtimeController');
const { requireSupervisor } = require('../middleware/authMiddleware');
const { upload } = require('../middleware/uploadMiddleware');

const router = express.Router();

router.get('/', listRequests);
router.get('/supervisor/pending', requireSupervisor, listPendingRequests);
router.get('/supervisor/requests', requireSupervisor, listSupervisorRequests);
router.get('/export', requireSupervisor, exportApprovedRequests);
router.post('/', upload.single('evidencia'), createRequest);
router.patch('/:id/review', requireSupervisor, reviewRequest);
router.put('/:id', requireSupervisor, updateRequest);
router.delete('/:id', requireSupervisor, deleteRequest);

module.exports = router;
