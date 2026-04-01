const router = require('express').Router();
const ctrl   = require('../controllers/notificationController');
const auth   = require('../middleware/authMiddleware');

router.use(auth);

router.get('/due/:user_id',       ctrl.getDueNotifications);
router.get('/:user_id',           ctrl.getNotifications);
router.post('/mark-notified',     ctrl.markNotified);

module.exports = router;
