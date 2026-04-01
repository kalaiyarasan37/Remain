require('dotenv').config();
const db         = require('../config/db');
const otpService = require('../services/otpService');
const jwt        = require('jsonwebtoken');

// POST /api/auth/send-otp
const sendOtp = async (req, res) => {
  try {
    const { name, mobile } = req.body;
    if (!mobile) return res.status(400).json({ message: 'Mobile is required' });
    if (!/^\d{10,15}$/.test(mobile))
      return res.status(400).json({ message: 'Invalid mobile number' });

    const [rows] = await db.query(
      'SELECT * FROM users WHERE mobile_no = ?', [mobile]
    );

    if (rows.length === 0) {
      // New user — name required
      if (!name || !name.trim())
        return res.status(400).json({ message: 'Name is required for new users' });
      await db.query(
        'INSERT INTO users (name, mobile_no, active) VALUES (?, ?, true)',
        [name.trim(), mobile]
      );
    }

    const otp = otpService.sendOTP(mobile);
    res.json({ message: 'OTP sent successfully', otp_debug: otp });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY')
      return res.status(409).json({ message: 'Mobile already registered' });
    console.error('sendOtp error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// POST /api/auth/verify-otp
const verifyOtp = async (req, res) => {
  try {
    const { mobile, otp } = req.body;
    if (!mobile || !otp)
      return res.status(400).json({ message: 'Mobile and OTP required' });

    if (!otpService.verifyOTP(mobile, otp))
      return res.status(400).json({ message: 'Invalid or expired OTP' });

    await db.query(
      'UPDATE users SET is_verified = true WHERE mobile_no = ?', [mobile]
    );

    const [[user]] = await db.query(
      'SELECT * FROM users WHERE mobile_no = ?', [mobile]
    );

    const token = jwt.sign(
      { id: user.id, mobile: user.mobile_no },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      message: 'OTP verified successfully',
      token,
      user: {
        id:         user.id,
        name:       user.name,
        mobile_no:  user.mobile_no,
        is_verified:user.is_verified,
        active:     user.active,
        created_at: user.created_at,
      },
    });
  } catch (err) {
    console.error('verifyOtp error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// GET /api/auth/verify-token
const verifyToken = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer '))
      return res.status(401).json({ valid: false, message: 'No token' });

    const token = authHeader.split(' ')[1];
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ valid: false, message: 'Token expired' });
    }

    const [[user]] = await db.query(
      'SELECT id, name, mobile_no, is_verified, active, created_at FROM users WHERE id = ?',
      [decoded.id]
    );

    if (!user || !user.active)
      return res.status(404).json({ valid: false, message: 'User not found' });

    res.json({ valid: true, user });
  } catch (err) {
    res.status(500).json({ message: 'Internal server error' });
  }
};

// GET /api/auth/check-mobile/:mobile
const checkMobile = async (req, res) => {
  try {
    const { mobile } = req.params;
    const [rows] = await db.query(
      'SELECT id, name FROM users WHERE mobile_no = ?', [mobile]
    );
    res.json({ exists: rows.length > 0, name: rows[0]?.name || null });
  } catch (err) {
    res.status(500).json({ message: 'Internal server error' });
  }
};
// PUT /api/auth/profile
const updateProfile = async (req, res) => {
  try {
    const { name, mobile } = req.body;
    if (!name || !mobile) {
      return res.status(400).json({ message: 'Name and mobile required' });
    }

    await db.query(
      'UPDATE users SET name = ? WHERE mobile_no = ?',
      [name.trim(), mobile]
    );

    res.json({ message: 'Profile updated successfully' });
  } catch (err) {
    console.error('updateProfile error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// PUT /api/auth/fcm-token
const updateFcmToken = async (req, res) => {
  try {
    const { mobile, fcm_token } = req.body;
    if (!mobile || !fcm_token) {
      return res.status(400).json({ message: 'Mobile and fcm_token required' });
    }

    // Uncomment this line when DB is updated:
    // await db.query('UPDATE users SET fcm_token = ? WHERE mobile_no = ?', [fcm_token, mobile]);

    res.json({ message: 'FCM token updated successfully (DB skipped until schema updated)' });
  } catch (err) {
    console.error('updateFcm error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = { sendOtp, verifyOtp, verifyToken, checkMobile, updateProfile, updateFcmToken };