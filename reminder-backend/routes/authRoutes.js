const router       = require('express').Router();
const authController = require('../controllers/authController');

router.post('/send-otp',       authController.sendOtp);
router.post('/verify-otp',     authController.verifyOtp);
router.get('/verify-token',    authController.verifyToken);
router.get('/check-mobile/:mobile', authController.checkMobile);
router.put('/profile', authController.updateProfile);
router.put('/fcm-token', authController.updateFcmToken);

module.exports = router;